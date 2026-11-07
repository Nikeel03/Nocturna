#!/bin/bash
# Installs the Nocturna notifier as a macOS background job (launchd).
# Runs every 15 minutes while the Mac is awake; catches up after sleep.
# Usage:  bash notifier/mac/install.sh
set -euo pipefail

LABEL="com.nocturna.notifier"
CONFIG_DIR="$HOME/.nocturna"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
MAC_DIR="$(cd "$(dirname "$0")" && pwd)"
NOTIFIER_DIR="$(cd "$MAC_DIR/.." && pwd)"

# launchd has a bare PATH, so find node now and store its full path.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js not found. Install it with:  brew install node   then run this again."
  exit 1
fi
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node $NODE_MAJOR is too old (need 18+). Run: brew upgrade node"
  exit 1
fi
echo "✓ Using node at $NODE_BIN (v$("$NODE_BIN" -v | tr -d v))"

echo "• Installing notifier dependencies…"
(cd "$NOTIFIER_DIR" && PATH="$(dirname "$NODE_BIN"):$PATH" npm ci --omit=dev --no-audit --no-fund --silent)

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/notifier.env" ]; then
  cat > "$CONFIG_DIR/notifier.env" <<CONF
# Nocturna notifier settings. Keep this file private.
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
NOCTURNA_USERNAME=""
# Path to the Firebase service-account key you downloaded
FIREBASE_SERVICE_ACCOUNT_FILE="$CONFIG_DIR/firebase-key.json"
# Optional
NOCTURNA_APP_URL=""
DIGEST_TIME="06:30"
EVENING_TIME="20:00"
NODE_BIN="$NODE_BIN"
CONF
  chmod 600 "$CONFIG_DIR/notifier.env"
  echo "✓ Created $CONFIG_DIR/notifier.env"
else
  # keep NODE_BIN current
  if grep -q '^NODE_BIN=' "$CONFIG_DIR/notifier.env"; then
    sed -i '' "s|^NODE_BIN=.*|NODE_BIN=\"$NODE_BIN\"|" "$CONFIG_DIR/notifier.env"
  else
    echo "NODE_BIN=\"$NODE_BIN\"" >> "$CONFIG_DIR/notifier.env"
  fi
  echo "✓ Kept existing $CONFIG_DIR/notifier.env"
fi

chmod +x "$MAC_DIR/run.sh"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$MAC_DIR/run.sh</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardErrorPath</key><string>$CONFIG_DIR/launchd.err</string>
</dict>
</plist>
PL

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ Background job installed ($LABEL) — runs every 15 min while the Mac is awake"

missing=""
. "$CONFIG_DIR/notifier.env"
[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && missing="$missing TELEGRAM_BOT_TOKEN"
[ -z "${TELEGRAM_CHAT_ID:-}" ] && missing="$missing TELEGRAM_CHAT_ID"
[ -z "${NOCTURNA_USERNAME:-}" ] && missing="$missing NOCTURNA_USERNAME"
[ ! -f "${FIREBASE_SERVICE_ACCOUNT_FILE:-/nonexistent}" ] && missing="$missing firebase-key.json"
if [ -n "$missing" ]; then
  echo ""
  echo "Next: fill in$missing"
  echo "  open -e $CONFIG_DIR/notifier.env"
  echo "  mv ~/Downloads/<your-key>.json $CONFIG_DIR/firebase-key.json"
  echo "Then test with:  bash $MAC_DIR/test.sh"
else
  echo "Test it with:  bash $MAC_DIR/test.sh"
fi
