// AI provider registry. kind: 'anthropic' uses the Anthropic SDK; 'openai' uses
// any OpenAI-compatible /chat/completions endpoint via the openai SDK.
// Edit baseURL / model here if a provider's endpoint or default model changes.
// MiMo: verify the baseURL and model against your MiMo deployment before use.

module.exports = {
  claude: {
    label: 'Claude (Anthropic)',
    kind: 'anthropic',
    model: 'claude-opus-4-8',
    keyHint: 'sk-ant-...',
  },
  chatgpt: {
    label: 'ChatGPT (OpenAI)',
    kind: 'openai',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    keyHint: 'sk-...',
  },
  mimo: {
    label: 'MiMo V2.5 (Xiaomi, 限免)',
    kind: 'openai',
    baseURL: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5',
    keyHint: 'your MiMo API key',
  },
  deepseek: {
    label: 'DeepSeek',
    kind: 'openai',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyHint: 'sk-...',
  },
  groq: {
    label: 'Groq',
    kind: 'openai',
    baseURL: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyHint: 'gsk_...',
  },
  gemini: {
    label: 'Gemini (Google)',
    kind: 'openai',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    keyHint: 'AIza...',
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    kind: 'openai',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    keyHint: 'sk-...',
  },
};
