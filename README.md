# STDerr

AI-powered developer utilities for Slack.

## Features

| Command | Description |
|---------|-------------|
| `/stderr-ping` | Latency check |
| `/stderr-timestamp` | Current Unix/ISO timestamp |
| `/stderr-commit` | Generate Conventional Commit messages |
| `/stderr-regex` | Generate regex from descriptions |
| `/stderr-stack` | Explain error messages/stack traces |

## Supported AI Providers

| Provider | Model |
|----------|-------|
| Claude (Anthropic) | claude-opus-4-8 |
| ChatGPT (OpenAI) | gpt-4o |
| MiMo V2.5 (Xiaomi) | mimo-v2.5 |
| DeepSeek | deepseek-chat |
| Groq | llama-3.3-70b-versatile |
| Gemini (Google) | gemini-2.0-flash |
| Moonshot (Kimi) | moonshot-v1-8k |

## Prerequisites

- Node.js v18+
- Slack workspace with Bot Token and App Token

## AI Usage

- Code completion
- Debugging

## Architecture

- `index.js` - Main Slack bot (Socket Mode)
- `ai.js` - Unified AI chat interface
- `providers.js` - Provider registry
- `store.js` - Per-user config persistence
