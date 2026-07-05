#!/usr/bin/env bash
# STDerr — Interactive deploy script
# Run on server: bash deploy.sh
set -euo pipefail

HACKCLUB_KEY="sk-hc-v1-REPLACE-ME"

echo "=== STDerr Deploy ==="

# Prompt for tokens (Enter = use value in brackets)
read -rp "SLACK_BOT_TOKEN: " SLACK_BOT_TOKEN
read -rp "SLACK_APP_TOKEN: " SLACK_APP_TOKEN

echo ""
echo "==> 1. Pulling latest code..."
cd ~/STDerr
git fetch origin
git reset --hard origin/feat/hackclub-ai-integration

echo "==> 2. Installing deps..."
npm install

echo "==> 3. Writing .env..."
cat > ~/STDerr/.env << EOF
SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
SLACK_APP_TOKEN=${SLACK_APP_TOKEN}
HACKCLUB_API_KEY=${HACKCLUB_KEY}
EOF

echo "==> 4. Stopping old process..."
pkill -f 'node index.js' 2>/dev/null || true
sleep 1

echo "==> 5. Starting STDerr..."
cd ~/STDerr && nohup node index.js > /tmp/stderr.log 2>&1 &
sleep 2

echo "==> 6. Verifying..."
if pgrep -f 'node index.js' > /dev/null; then
  echo ""
  echo "SUCCESS — STDerr is running (PID $(pgrep -f 'node index.js'))"
  tail -2 /tmp/stderr.log
else
  echo ""
  echo "FAILED — check /tmp/stderr.log"
  cat /tmp/stderr.log
  exit 1
fi
