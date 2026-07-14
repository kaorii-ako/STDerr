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
  '• `/stderr-health` — Check if Hack Club AI is up',
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
// /stderr-health — check Hack Club AI service status
// ---------------------------------------------------------------------------
app.command('/stderr-health', async ({ ack, respond }) => {
  await ack();
  try {
    const h = await fetch('https://ai.hackclub.com/up').then((r) => r.json());
    const up = h.status === 'up';
    const emoji = up ? ':large_green_circle:' : ':red_circle:';
    const balance = typeof h.balanceRemaining === 'number' ? h.balanceRemaining.toFixed(2) : '?';
    await respond(
      `${emoji} Hack Club AI is *${h.status}*\n` +
        `Upstream balance: \`$${balance}\`` +
        (up ? '' : '\nAI commands will fail until Hack Club tops up credits. Not a bug in this bot.')
    );
  } catch (err) {
    await respond(`Could not reach https://ai.hackclub.com/up — ${err.message}`);
  }
});

// ---------------------------------------------------------------------------
// Friendly error messages for common API failures
// ---------------------------------------------------------------------------
function friendlyError(err) {
  const msg = err?.message || String(err);
  const status = err?.status || err?.response?.status;
  if (status === 401 || /authentication failed|invalid api key|401/i.test(msg)) {
    return 'The shared API key was rejected (401). This is on the bot admin — ask them to refresh HACKCLUB_API_KEY in .env.';
  }
  if (status === 402 || /insufficient credits|402/i.test(msg)) {
    return 'The shared key is out of credits (402). Hack Club AI is likely over capacity — try again later or check `/stderr-health`.';
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

    // Everyone shares the admin's HACKCLUB_API_KEY — no per-user key setup needed.
    const cfg = store.getDefault();
    if (!cfg) {
      await respond('AI commands are not configured. Ask the bot admin to set `HACKCLUB_API_KEY` in `.env`.');
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
    const def = store.getDefault();
    const defaultNote = def
      ? ' | Hack Club AI ready'
      : ' | WARNING: no HACKCLUB_API_KEY in .env — AI commands will not work';
    console.log('STDerr is running (Socket Mode)' + defaultNote);

    if (def) {
      try {
        await ask('hackclub', def.apiKey, 'Reply with the single word: ok', 'ping');
        console.log('Shared HACKCLUB_API_KEY verified live — good to go.');
      } catch (err) {
        const status = err?.status || err?.response?.status;
        if (status === 401) {
          console.error(
            'WARNING: shared HACKCLUB_API_KEY was rejected (401) at startup. ' +
              'Every user will hit this since everyone shares this one key. ' +
              'Get a fresh key at https://ai.hackclub.com/keys and update .env.'
          );
        } else {
          console.warn(
            `Shared HACKCLUB_API_KEY startup check failed (non-fatal, status ${status || 'unknown'}): ${err.message}`
          );
        }
      }
    }
  } catch (err) {
    console.error('Failed to start STDerr:', err.message);
    process.exit(1);
  }
})();
