# STDerr

AI-powered developer utilities for Slack. Powered by **Hack Club AI** (free, no API key needed).

## Quick Start

```bash
cp .env.example .env   # fill in SLACK_BOT_TOKEN + SLACK_APP_TOKEN
npm install
npm start
```

That's it! Set `HACKCLUB_API_KEY` in your `.env` (get one free from [ai.hackclub.com](https://ai.hackclub.com)) and every user can immediately run `/stderr-ask` -- no per-user setup needed.

Want to use a different provider? Run `/stderr-connect`.

## Commands

| Command | Description |
|---------|-------------|
| `/stderr-ask <question>` | Ask anything -- free-form coding assistant |
| `/stderr-commit <describe>` | Generate a Conventional Commit message |
| `/stderr-regex <describe>` | Generate a regex from plain English |
| `/stderr-stack <error>` | Explain a stack trace or error |
| `/stderr-connect` | Pick an AI provider (modal UI) |
| `/stderr-switch <provider>` | Quick-switch provider |
| `/stderr-models` | List all available providers and models |
| `/stderr-whoami` | Show current provider connection |
| `/stderr-ping` | Check bot latency |
| `/stderr-timestamp` | Show Unix & ISO timestamp |
| `/stderr-help` | List all commands |

## Supported AI Providers

| Provider | Model | Notes |
|----------|-------|-------|
| **Hack Club AI** | `google/gemini-2.5-flash` | **Free** -- set `HACKCLUB_API_KEY` in `.env` |
| Claude (Anthropic) | `claude-opus-4-8` | Requires Anthropic API key |
| ChatGPT (OpenAI) | `gpt-4o` | Requires OpenAI API key |
| MiMo V2.5 (Xiaomi) | `mimo-v2.5` | Free tier available |
| DeepSeek | `deepseek-chat` | Requires DeepSeek API key |
| Groq | `llama-3.3-70b-versatile` | Requires Groq API key |
| Gemini (Google) | `gemini-2.0-flash` | Requires Google AI API key |
| Moonshot (Kimi) | `moonshot-v1-8k` | Requires Moonshot API key |

## Configuration

Copy `.env.example` to `.env` and fill in:

```
SLACK_BOT_TOKEN=xoxb-...      # Required -- from api.slack.com/apps
SLACK_APP_TOKEN=xapp-...      # Required -- Socket Mode token
HACKCLUB_API_KEY=...          # Recommended -- free key from ai.hackclub.com
```

Set `HACKCLUB_API_KEY` (free from [ai.hackclub.com](https://ai.hackclub.com)) for instant Hack Club AI access for all users. Without it, users must run `/stderr-connect` to add their own API key.

## Architecture

```
index.js      -- Main Slack bot (Socket Mode, command handlers)
ai.js         -- Unified AI chat interface (Anthropic + OpenAI-compatible)
providers.js  -- Provider registry (base URLs, models, flags)
store.js      -- Per-user config persistence (atomic writes, in-memory cache)
.env.example  -- Environment variable template
```

## License

ISC
