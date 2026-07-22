// AI provider registry. kind: 'anthropic' uses the Anthropic SDK; 'openai' uses
// any OpenAI-compatible /chat/completions endpoint via the openai SDK.
// Edit baseURL / model here if a provider's endpoint or default model changes.
// MiMo: verify the baseURL and model against your MiMo deployment before use.

module.exports = {
  hackclub: {
    label: 'Hack Club AI (Free)',
    kind: 'openai',
    baseURL: 'https://ai.hackclub.com/proxy/v1',
    model: 'google/gemini-3-flash-preview',
    // Tried in order when the primary model fails with 402/429/404.
    fallbacks: [
      'qwen/qwen3-32b',
      'moonshotai/kimi-k2.6',
      'google/gemini-2.5-flash',
      'openai/gpt-oss-120b:free',
      'qwen/qwen3-coder:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ],
    healthURL: 'https://ai.hackclub.com/up',
    keyHint: 'your Hack Club API key (get from ai.hackclub.com)',
    default: true,
    free: true,
  },
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
