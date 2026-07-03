require('dotenv').config();
const { App } = require('@slack/bolt');
const providers = require('./providers');
const store = require('./store');
const { ask, formatForSlack } = require('./ai');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// ---------------------------------------------------------------------------
// /stderr-ping
// ---------------------------------------------------------------------------
app.command('/stderr-ping', async ({ ack, respond }) => {
  await ack();
  const start = Date.now();
  await respond('Ping...');
  const ms = Date.now() - start;
  await respond(`Pong! \`${ms}ms\` round-trip to Slack`);
});

// ---------------------------------------------------------------------------
// /stderr-timestamp
// ---------------------------------------------------------------------------
app.command('/stderr-timestamp', async ({ ack, respond }) => {
  await ack();
  const now = new Date();
  const unix = Math.floor(now.getTime() / 1000);
  await respond('```\nUnix:  ' + unix + '\nISO:   ' + now.toISOString() + '\n```');
});

// ---------------------------------------------------------------------------
// /stderr-help — list every available command
// ---------------------------------------------------------------------------
const HELP_TEXT = [
  '*Available commands:*',
  '• `/stderr-ping` — Check bot latency',
  '• `/stderr-timestamp` — Show current Unix & ISO timestamp',
  '• `/stderr-connect` — Pick an AI provider and connect',
  '• `/stderr-switch <provider>` — Quick-switch to a different provider',
  '• `/stderr-models` — List all available AI providers and models',
  '• `/stderr-whoami` — Show which provider you are connected to',
  '• `/stderr-ask <question>` — Ask anything (free-form coding assistant)',
  '• `/stderr-commit <describe change>` — Generate a Conventional Commit message',
  '• `/stderr-regex <describe pattern>` — Generate a regular expression',
  '• `/stderr-stack <error text>` — Explain a stack trace or error',
  '• `/stderr-help` — Show this message',
].join('\n');

app.command('/stderr-help', async ({ ack, respond }) => {
  await ack();
  await respond({
    response_type: 'ephemeral',
    text: HELP_TEXT,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: HELP_TEXT } }],
  });
});

// ---------------------------------------------------------------------------
// /stderr-models — list every provider with model info
// ---------------------------------------------------------------------------
app.command('/stderr-models', async ({ ack, respond, command }) => {
  await ack();
  const current = store.get(command.user_id);
  const lines = Object.entries(providers).map(([key, def]) => {
    const parts = [`• *${def.label}*`, `\`${def.model}\``];
    if (def.default) parts.push('_(default)_');
    if (current && current.provider === key) parts.push('_✓ connected_');
    return parts.join(' — ');
  });
  const text = '*Available models:*\n' + lines.join('\n');
  await respond({
    response_type: 'ephemeral',
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  });
});

// ---------------------------------------------------------------------------
// /stderr-switch <provider> — instant provider switch
// ---------------------------------------------------------------------------
app.command('/stderr-switch', async ({ ack, respond, command }) => {
  await ack();
  const target = (command.text || '').trim().toLowerCase();
  if (!target) {
    const keys = Object.keys(providers).join(', ');
    await respond(`Usage: \`/stderr-switch <provider>\`\nAvailable providers: ${keys}`);
    return;
  }
  const def = providers[target];
  if (!def) {
    await respond(`Unknown provider \`${target}\`. Run \`/stderr-models\` to see available providers.`);
    return;
  }
  const current = store.get(command.user_id);
  if (current) {
    // Existing user: keep their API key, just switch provider
    store.set(command.user_id, { provider: target, apiKey: current.apiKey });
  } else {
    // No prior connection
    if (def.free) {
      store.set(command.user_id, { provider: target, apiKey: '' });
    } else {
      await respond(
        'You are not connected yet. Run `/stderr-connect` first to add an API key, then switch.'
      );
      return;
    }
  }
  await respond(`Switched to *${def.label}* (model \`${def.model}\`).`);
});

// ---------------------------------------------------------------------------
// /stderr-connect — provider picker (skip API key modal for free providers)
// ---------------------------------------------------------------------------
app.command('/stderr-connect', async ({ ack, respond, command }) => {
  await ack();
  const current = store.get(command.user_id);
  const currentLine = current
    ? `Currently connected: *${providers[current.provider]?.label || current.provider}*\n`
    : 'Not connected yet.\n';

  await respond({
    response_type: 'ephemeral',
    text: 'Select an AI provider',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: currentLine + 'Pick a provider to connect:' },
        accessory: {
          type: 'static_select',
          action_id: 'select_provider',
          placeholder: { type: 'plain_text', text: 'Choose a provider' },
          options: Object.entries(providers).map(([key, def]) => ({
            text: { type: 'plain_text', text: def.label },
            value: key,
          })),
        },
      },
    ],
  });
});

// When a provider is selected from the dropdown, either connect directly (free)
// or open the API-key modal (paid).
app.action('select_provider', async ({ ack, body, client, respond, logger }) => {
  await ack();
  try {
    const providerKey = body.actions[0].selected_option.value;
    const def = providers[providerKey];

    // Free providers: connect immediately, no API key needed
    if (def.free) {
      store.set(body.user.id, { provider: providerKey, apiKey: '' });
      await respond({
        response_type: 'ephemeral',
        text: `Connected to *${def.label}* (model \`${def.model}\`). No API key needed!`,
      });
      return;
    }

    // Paid providers: open modal for API key
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'connect_modal',
        private_metadata: providerKey,
        title: { type: 'plain_text', text: 'Connect AI' },
        submit: { type: 'plain_text', text: 'Save' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `Provider: *${def.label}*\nModel: \`${def.model}\`` },
          },
          {
            type: 'input',
            block_id: 'apikey_block',
            label: { type: 'plain_text', text: 'API key' },
            element: {
              type: 'plain_text_input',
              action_id: 'apikey_input',
              placeholder: { type: 'plain_text', text: def.keyHint || 'API key' },
            },
          },
        ],
      },
    });
  } catch (err) {
    logger.error('Failed to open connect modal:', err.message);
  }
});

app.view('connect_modal', async ({ ack, body, view, logger }) => {
  try {
    const providerKey = view.private_metadata;
    const apiKey = view.state.values?.apikey_block?.apikey_input?.value?.trim();
    if (!apiKey) {
      await ack({
        response_action: 'errors',
        errors: { apikey_block: 'Please enter an API key.' },
      });
      return;
    }
    store.set(body.user.id, { provider: providerKey, apiKey });
    await ack();
  } catch (err) {
    logger.error('Failed to save provider config:', err.message);
    await ack(); // Still close modal to avoid Slack 3-second timeout
  }
});

// ---------------------------------------------------------------------------
// /stderr-whoami
// ---------------------------------------------------------------------------
app.command('/stderr-whoami', async ({ ack, respond, command }) => {
  await ack();
  const cfg = store.resolve(command.user_id);
  if (!cfg) {
    await respond('Not connected. Run `/stderr-connect` to pick a provider.');
    return;
  }
  const def = providers[cfg.provider];
  const isDefault = !store.get(command.user_id) && store.getDefault();
  const note = isDefault ? ' (auto-connected via HACKCLUB_API_KEY)' : '';
  await respond(`Connected to *${def?.label || cfg.provider}* (model \`${def?.model}\`).${note}`);
});

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------
const COMMIT_SYSTEM =
  'You convert a plain-language change description into a single Conventional Commit message. ' +
  'Output ONLY the commit message, no preamble, no code fences, no explanation. ' +
  'Format: type(optional-scope): subject. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore. ' +
  'Subject is imperative mood, lowercase, no trailing period, under 72 chars. ' +
  'Add a body only if the description clearly contains extra detail worth keeping; separate it with a blank line.';

const REGEX_SYSTEM =
  'You generate a single regular expression from a plain-language description. ' +
  'Output ONLY the regex, no preamble, no explanation, no code fences. ' +
  'Use the form /pattern/flags so the intended flags are explicit. ' +
  'Prefer portable, standard regex syntax. If the description is ambiguous, choose the most common interpretation.';

const STACK_SYSTEM =
  'You explain a programming error or stack trace to a developer. ' +
  'Be concise and practical. State (1) what the error means, (2) the most likely cause, ' +
  '(3) how to fix it. Reference the relevant file/line from the trace if present. ' +
  'No fluff, no restating the whole trace.';

const ASK_SYSTEM =
  'You are a helpful coding assistant called STDerr. Be concise and practical. ' +
  'Use Slack mrkdwn formatting where helpful: wrap code in single backticks for inline, ' +
  'triple backticks for multi-line. Use *bold* for emphasis.';

// ---------------------------------------------------------------------------
// Shared AI command factory with typing indicators + mrkdwn formatting
// ---------------------------------------------------------------------------
function aiCommand(system, { wrapCode = false, format = false, usage } = {}) {
  return async ({ ack, respond, command }) => {
    await ack();
    const text = (command.text || '').trim();
    if (!text) {
      await respond(usage);
      return;
    }

    // Resolve config: explicit user config first, then global default (HACKCLUB_API_KEY)
    const cfg = store.resolve(command.user_id);
    if (!cfg) {
      await respond(
        'Not connected. Run `/stderr-connect` to pick a provider, ' +
        'or set `HACKCLUB_API_KEY` in your `.env` for instant Hack Club AI access.'
      );
      return;
    }

    // Typing indicator: show "Thinking..." then replace with answer
    let thinkingTs;
    try {
      const thinkResp = await respond({
        response_type: 'ephemeral',
        text: 'Thinking...',
      });
      thinkingTs = thinkResp?.ts;
    } catch {
      // respond() in socket mode may not return a ts — fall through
    }

    try {
      const out = await ask(cfg.provider, cfg.apiKey, system, text);

      // Build the final output
      let reply;
      if (format) {
        reply = formatForSlack(out);
      } else if (wrapCode) {
        reply = '```\n' + out + '\n```';
      } else {
        reply = out;
      }

      // Try to replace the "Thinking..." message; fall back to a new message
      if (thinkingTs) {
        try {
          await respond({ text: reply, replace_original: true, response_type: 'ephemeral' });
          return;
        } catch {
          // replace failed — send as new message
        }
      }
      await respond(reply);
    } catch (err) {
      const errMsg = `Error from *${providers[cfg.provider]?.label || cfg.provider}*: ${err.message}`;
      if (thinkingTs) {
        try {
          await respond({ text: errMsg, replace_original: true, response_type: 'ephemeral' });
          return;
        } catch { /* fall through */ }
      }
      await respond(errMsg);
    }
  };
}

// ---------------------------------------------------------------------------
// Slash command registrations
// ---------------------------------------------------------------------------
app.command(
  '/stderr-ask',
  aiCommand(ASK_SYSTEM, { format: true, usage: 'Usage: `/stderr-ask <your question>`' })
);

app.command(
  '/stderr-commit',
  aiCommand(COMMIT_SYSTEM, { wrapCode: true, usage: 'Usage: `/stderr-commit <describe your change>`' })
);

app.command(
  '/stderr-regex',
  aiCommand(REGEX_SYSTEM, { wrapCode: true, usage: 'Usage: `/stderr-regex <describe what to match>`' })
);

app.command(
  '/stderr-stack',
  aiCommand(STACK_SYSTEM, { format: true, usage: 'Usage: paste an error: `/stderr-stack <error text>`' })
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async () => {
  try {
    await app.start();
    const defaultNote = store.getDefault()
      ? ' | Hack Club AI ready (HACKCLUB_API_KEY)'
      : ' | no HACKCLUB_API_KEY set, users must /stderr-connect';
    console.log('STDerr is running (Socket Mode)' + defaultNote);
  } catch (err) {
    console.error('Failed to start STDerr:', err.message);
    process.exit(1);
  }
})();
