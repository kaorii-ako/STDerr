# STDerr

AI-powered developer utilities for Slack. Powered by **Hack Club AI** (free — [ai.hackclub.com](https://ai.hackclub.com)).

## Quick Start

```bash
cp .env.example .env   # fill in SLACK_BOT_TOKEN + SLACK_APP_TOKEN + HACKCLUB_API_KEY
npm install
npm start
```

Set `HACKCLUB_API_KEY` in your `.env` (free from [ai.hackclub.com/keys](https://ai.hackclub.com/keys)) and every user can immediately run `/stderr-ask` — no per-user setup, no API key needed on their end. Everyone shares the admin's key.

## Commands

| Command | Description |
|---------|-------------|
| `/stderr-ask <question>` | Ask anything — free-form coding assistant |
| `/stderr-commit <describe>` | Generate a Conventional Commit message |
| `/stderr-regex <describe>` | Generate a regex from plain English |
| `/stderr-stack <error>` | Explain a stack trace or error |
| `/stderr-health` | Check if Hack Club AI is up (service status + balance) |
| `/stderr-ping` | Check bot latency |
| `/stderr-timestamp` | Show Unix & ISO timestamp |
| `/stderr-help` | List all commands |

## How the AI works

All AI commands go through [Hack Club AI](https://ai.hackclub.com), an OpenAI-compatible proxy that is free for Hack Clubbers. The bot tries a chain of models automatically, so a rate-limited or out-of-credit model does not take the bot down:

1. `qwen/qwen3-32b` (primary)
2. `moonshotai/kimi-k2.6`
3. `google/gemini-2.5-flash`
4. `openai/gpt-oss-120b:free`
5. `qwen/qwen3-coder:free`
6. `meta-llama/llama-3.3-70b-instruct:free`

If every model fails, the bot checks `https://ai.hackclub.com/up` and tells you whether the whole service is out of upstream credits (service-wide, not your key). You can check that yourself anytime with `/stderr-health`.

## Configuration

Copy `.env.example` to `.env` and fill in:

```
SLACK_BOT_TOKEN=xoxb-...      # Required — from api.slack.com/apps
SLACK_APP_TOKEN=xapp-...      # Required — Socket Mode token
HACKCLUB_API_KEY=sk-hc-v1-... # Recommended — free key from ai.hackclub.com/keys
```

## Deploying 24/7

See [`deploy-nest.txt`](deploy-nest.txt) for running the bot on [Nest](https://hackclub.app) as a systemd service so it stays online after you close your terminal.

## Architecture

```
index.js      — Main Slack bot (Socket Mode, command handlers)
ai.js         — Unified AI chat interface with model fallback chain
providers.js  — Provider registry (base URLs, models, fallbacks)
store.js      — Shared HACKCLUB_API_KEY resolution from env
.env.example  — Environment variable template
```

## License

ISC
