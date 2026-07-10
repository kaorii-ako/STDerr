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
  '• `/stderr-ask <question>` — Ask anything (free-form coding assistant)',
  '• `/stderr-commit <describe change>` — Generate a Conventional Commit message',
  '• `/stderr-regex <describe pattern>` — Generate a regular expression',
  '• `/stderr-stack <error text>` — Explain a stack trace or error',
  '• `/stderr-connect <api-key>` — Use your own Hack Club AI key (get one at https://ai.hackclub.com/keys)',
  '• `/stderr-disconnect` — Remove your saved key and go back to the shared default',
  '• `/stderr-status` — Show which key/provider you are using',
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
// /stderr-connect — save a personal Hack Club AI key (validated live)
// ---------------------------------------------------------------------------
app.command('/stderr-connect', async ({ ack, respond, command }) => {
  await ack(); // ack immediately so Slack never times out
  const apiKey = (command.text || '').trim();

  if (!apiKey) {
    await respond(
      'Usage: `/stderr-connect <api-key>`\n' +
        'Get a free Hack Club AI key at https://ai.hackclub.com/keys, then run:\n' +
        '`/stderr-connect sk-hc-v1-...`'
    );
    return;
  }

  await respond({ response_type: 'ephemeral', text: 'Validating your key…' });

  try {
    await ask('hackclub', apiKey, 'Reply with the single word: ok', 'ping');
  } catch (err) {
    await respond(
      `That key didn't work: ${friendlyError(err)}\n` +
        'Double-check it at https://ai.hackclub.com/keys and try again.'
    );
    return;
  }

  store.set(command.user_id, { provider: 'hackclub', apiKey });
  await respond(
    ':white_check_mark: Connected! Your personal Hack Club AI key is saved. ' +
      'All `/stderr-*` AI commands will now use it.'
  );
});

// ---------------------------------------------------------------------------
// /stderr-disconnect — remove personal key, fall back to shared default
// ---------------------------------------------------------------------------
app.command('/stderr-disconnect', async ({ ack, respond, command }) => {
  await ack();
  const removed = store.remove(command.user_id);
  if (removed) {
    const fallback = store.getDefault()
      ? 'You are now using the shared default key.'
      : 'No shared default key is configured, so AI commands will not work until you reconnect.';
    await respond(`Your personal key was removed. ${fallback}`);
  } else {
    await respond('You had no personal key saved. Nothing changed.');
  }
});

// ---------------------------------------------------------------------------
// /stderr-status — show what key/provider the user resolves to
// ---------------------------------------------------------------------------
app.command('/stderr-status', async ({ ack, respond, command }) => {
  await ack();
  const personal = store.get(command.user_id);
  const cfg = store.resolve(command.user_id);
  if (!cfg) {
    await respond(
      'Not connected. Run `/stderr-connect <api-key>` with a free key from https://ai.hackclub.com/keys.'
    );
    return;
  }
  const label = providers[cfg.provider]?.label || cfg.provider;
  const source = personal && personal.apiKey ? 'your personal key' : 'the shared default key';
  const masked = cfg.apiKey.slice(0, 12) + '…' + cfg.apiKey.slice(-4);
  await respond(`Provider: *${label}*\nKey source: ${source}\nKey: \`${masked}\``);
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
// Friendly error messages for common API failures
// ---------------------------------------------------------------------------
function friendlyError(err) {
  const msg = err?.message || String(err);
  const status = err?.status || err?.response?.status;
  if (status === 401 || /authentication failed|invalid api key|401/i.test(msg)) {
    return 'The API key was rejected (401). Grab a fresh free key at https://ai.hackclub.com/keys and run `/stderr-connect <key>`.';
  }
  if (status === 402 || /insufficient credits|402/i.test(msg)) {
    return 'The key is out of credits (402). Get your own free Hack Club AI key at https://ai.hackclub.com/keys and run `/stderr-connect <key>`.';
  }
  if (status === 429 || /rate limit|429/i.test(msg)) {
    return 'Rate limited (429). Wait a moment and try again.';
  }
  return msg;
}

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
        'Not connected. Get a free key at https://ai.hackclub.com/keys and run `/stderr-connect <key>`, ' +
          'or ask the server admin to set `HACKCLUB_API_KEY` in `.env`.'
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
      const errMsg = `Error from *${providers[cfg.provider]?.label || cfg.provider}*: ${friendlyError(err)}`;
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
      ? ' | Hack Club AI ready'
      : ' | WARNING: no HACKCLUB_API_KEY in .env — AI commands will not work';
    console.log('STDerr is running (Socket Mode)' + defaultNote);
  } catch (err) {
    console.error('Failed to start STDerr:', err.message);
    process.exit(1);
  }
})();
