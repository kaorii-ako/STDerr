// Unified chat call across providers. Routes to the Anthropic SDK for
// kind 'anthropic', otherwise to an OpenAI-compatible /chat/completions endpoint.

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const providers = require('./providers');

async function ask(providerKey, apiKey, system, user) {
  const def = providers[providerKey];
  if (!def) throw new Error(`Unknown provider: ${providerKey}`);

  if (def.kind === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: def.model,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
    });
    return res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }

  const client = new OpenAI({ apiKey, baseURL: def.baseURL });
  const res = await client.chat.completions.create({
    model: def.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return (res.choices[0]?.message?.content || '').trim();
}

module.exports = { ask };
