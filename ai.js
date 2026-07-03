// Unified chat call across providers. Routes to the Anthropic SDK for
// kind 'anthropic', otherwise to an OpenAI-compatible /chat/completions endpoint.
//
// apiKey resolution: callers should pass the resolved apiKey (from store.resolve()
// which falls back to HACKCLUB_API_KEY env var when no user-specific key exists).

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const providers = require('./providers');

async function ask(providerKey, apiKey, system, user) {
  const def = providers[providerKey];
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);
  if (!apiKey) throw new Error(`No API key for provider "${def.label}". Run /stderr-connect or set HACKCLUB_API_KEY.`);

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
  const res = await client.chat.completions.create({
    model: def.model,
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
