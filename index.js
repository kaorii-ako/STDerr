require('dotenv').config();
const { App } = require('@slack/bolt');
const providers = require('./providers');
const store = require('./store');
const { ask } = require('./ai');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// --- /stderr-ping : latency check ---
app.command('/stderr-ping', async ({ ack, respond }) => {
  await ack();
  const start = Date.now();
  await respond('Ping...');
  const ms = Date.now() - start;
  await respond(`Pong! \`${ms}ms\` round-trip to Slack`);
});

// --- /stderr-timestamp : unix + ISO 8601 ---
app.command('/stderr-timestamp', async ({ ack, respond }) => {
  await ack();
  const now = new Date();
  const unix = Math.floor(now.getTime() / 1000);
  await respond('```\nUnix:  ' + unix + '\nISO:   ' + now.toISOString() + '\n```');
});

// --- /stderr-connect : pick a provider, then enter an API key ---
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

// Provider chosen -> open a modal to capture the API key
app.action('select_provider', async ({ ack, body, client }) => {
  await ack();
  const providerKey = body.actions[0].selected_option.value;
  const def = providers[providerKey];

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
});

// Modal submitted -> persist the user's provider + key
app.view('connect_modal', async ({ ack, body, view }) => {
  const providerKey = view.private_metadata;
  const apiKey = view.state.values.apikey_block.apikey_input.value.trim();
  store.set(body.user.id, { provider: providerKey, apiKey });
  await ack();
});

// --- /stderr-whoami : show current connection (no key) ---
app.command('/stderr-whoami', async ({ ack, respond, command }) => {
  await ack();
  const cfg = store.get(command.user_id);
  if (!cfg) {
    await respond('Not connected. Run `/stderr-connect` to pick a provider.');
    return;
  }
  const def = providers[cfg.provider];
  await respond(`Connected to *${def?.label || cfg.provider}* (model \`${def?.model}\`).`);
});

// --- AI-backed commands ---

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

// Wraps a slash command that needs the user's connected AI.
function aiCommand(system, { wrapCode = false, usage }) {
  return async ({ ack, respond, command }) => {
    await ack();
    const text = (command.text || '').trim();
    if (!text) {
      await respond(usage);
      return;
    }
    const cfg = store.get(command.user_id);
    if (!cfg) {
      await respond('Not connected. Run `/stderr-connect` to pick a provider and add your API key.');
      return;
    }
    try {
      const out = await ask(cfg.provider, cfg.apiKey, system, text);
      await respond(wrapCode ? '```\n' + out + '\n```' : out);
    } catch (err) {
      await respond(`Error from *${providers[cfg.provider]?.label || cfg.provider}*: ${err.message}`);
    }
  };
}

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
  aiCommand(STACK_SYSTEM, { wrapCode: false, usage: 'Usage: paste an error: `/stderr-stack <error text>`' })
);

(async () => {
  await app.start();
  console.log('STDerr is running (Socket Mode)');
})();
