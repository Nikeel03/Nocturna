#!/bin/bash
# Sends a test message + today's briefing to Telegram right now.
CONFIG_DIR="$HOME/.nocturna"
set -a; . "$CONFIG_DIR/notifier.env"; set +a
cd "$(dirname "$0")/.." && MODE=test "${NODE_BIN:-node}" notify.js && echo "✓ Sent — check Telegram"
