// Unified chat call across providers. Routes to the Anthropic SDK for
// kind 'anthropic', otherwise to an OpenAI-compatible /chat/completions endpoint.
//
// apiKey resolution: callers should pass the resolved apiKey (from store.getDefault(),
// the shared HACKCLUB_API_KEY env var — every user shares this one key).

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const providers = require('./providers');

async function ask(providerKey, apiKey, system, user) {
  const def = providers[providerKey];
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);
  if (!apiKey) throw new Error(`No API key for provider "${def.label}". Set HACKCLUB_API_KEY in .env.`);

  if (def.kind === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: def.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) {
      throw new Error('The AI returned an empty response. Try rephrasing your request.');
    }
    return text;
  }

  const client = new OpenAI({ apiKey, baseURL: def.baseURL });

  // Try the primary model, then any configured fallbacks. Free upstream
  // capacity comes and goes (402 = pool out of credits, 429 = model
  // rate-limited), so cycling models makes the bot much more resilient.
  const models = [def.model, ...(def.fallbacks || [])];
  let lastErr;
  for (const model of models) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const text = (res.choices[0]?.message?.content || '').trim();
      if (!text) {
        throw new Error('The AI returned an empty response. Try rephrasing your request.');
      }
      return text;
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      // Only fall through to the next model for capacity-type failures.
      if (![402, 404, 429, 502, 503].includes(status)) throw err;
    }
  }

  // All models failed on capacity errors. If the provider exposes a health
  // endpoint, check whether the whole service is down and say so clearly.
  if (def.healthURL) {
    try {
      const health = await fetch(def.healthURL).then((r) => r.json());
      if (health?.status === 'down' || (typeof health?.balanceRemaining === 'number' && health.balanceRemaining <= 0)) {
        throw new Error(
          'Hack Club AI is currently out of upstream credits (service-wide, not your key). ' +
            'Check https://ai.hackclub.com/up and try again later.'
        );
      }
    } catch (e) {
      if (e.message.startsWith('Hack Club AI is currently')) throw e;
      // health check itself failed — fall through to the original error
    }
  }
  throw lastErr;
}

/**
 * Apply basic Slack mrkdwn formatting to AI output.
 * - Normalises Markdown code fences for Slack compatibility
 * - Wraps bare one-liner code in ``` fences when it looks like code
 * - Ensures blank lines before opening fences for readability
 */
function formatForSlack(text) {
  if (!text) return '';
  let out = text;
  // Ensure blank line before opening ``` fences for readability
  out = out.replace(/([^\n])```/g, '$1\n```');
  // If the entire response is a single line that looks like code, wrap it
  if (!out.includes('\n') && /[;{}()[\]=<>]/.test(out) && !out.startsWith('`')) {
    out = '```\n' + out + '\n```';
  }
  return out;
}

module.exports = { ask, formatForSlack };
