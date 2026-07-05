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
        'Not connected. Make sure `HACKCLUB_API_KEY` is set in `.env` on the server.'
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
      ? ' | Hack Club AI ready'
      : ' | WARNING: no HACKCLUB_API_KEY in .env — AI commands will not work';
    console.log('STDerr is running (Socket Mode)' + defaultNote);
  } catch (err) {
    console.error('Failed to start STDerr:', err.message);
    process.exit(1);
  }
})();
