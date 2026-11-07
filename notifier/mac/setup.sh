#!/bin/bash
# One-shot setup: installs Node if needed, fills in settings from env.js,
# finds your Firebase key in Downloads, installs the background job, and
# sends a test message.  Usage:  bash notifier/mac/setup.sh
set -uo pipefail
MAC_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$MAC_DIR/../.." && pwd)"
CONFIG_DIR="$HOME/.nocturna"
ENV_FILE="$CONFIG_DIR/notifier.env"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# ---- 1. Node.js -------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  say "Installing Node.js…"
  if command -v brew >/dev/null 2>&1; then
    brew install node
  elif command -v conda >/dev/null 2>&1; then
    # Separate env so your conda base stays untouched
    conda create -y -q -n nocturna-node -c conda-forge "nodejs>=20" >/dev/null
    export PATH="$(conda info --base)/envs/nocturna-node/bin:$PATH"
  else
    echo "❌ Neither Homebrew nor conda found. Install Node from https://nodejs.org (LTS), then run this again."
    exit 1
  fi
fi
command -v node >/dev/null 2>&1 || { echo "❌ Node install failed"; exit 1; }
echo "✓ Node $(node -v) at $(command -v node)"

# ---- 2. Background job + settings file --------------------------------------
say "Installing background job…"
bash "$MAC_DIR/install.sh" >/dev/null || { echo "❌ install.sh failed — run it directly to see why"; exit 1; }
echo "✓ Installed"

setvar() { # setvar NAME VALUE  (only if currently empty)
  local name="$1" value="$2"
  if grep -qE "^$name=\"\"" "$ENV_FILE"; then
    /usr/bin/python3 - "$ENV_FILE" "$name" "$value" <<'PY'
import sys, re
path, name, value = sys.argv[1:]
s = open(path).read()
s = re.sub(rf'^{name}=""', f'{name}="{value}"', s, flags=re.M)
open(path, 'w').write(s)
PY
  fi
}

# ---- 3. Telegram details from env.js ----------------------------------------
if [ -f "$REPO_DIR/env.js" ]; then
  TOKEN="$(sed -nE "s/.*TELEGRAM_BOT_TOKEN[\"']?[[:space:]]*:[[:space:]]*[\"']([^\"']+)[\"'].*/\1/p" "$REPO_DIR/env.js" | head -1)"
  CHAT="$(sed -nE "s/.*TELEGRAM_CHAT_ID[\"']?[[:space:]]*:[[:space:]]*[\"']?([-0-9]+)[\"']?.*/\1/p" "$REPO_DIR/env.js" | head -1)"
  [ -n "$TOKEN" ] && setvar TELEGRAM_BOT_TOKEN "$TOKEN" && echo "✓ Bot token copied from env.js"
  [ -n "$CHAT" ] && setvar TELEGRAM_CHAT_ID "$CHAT" && echo "✓ Chat ID copied from env.js"
fi

# ---- 4. Nocturna username ---------------------------------------------------
if grep -qE '^NOCTURNA_USERNAME=""' "$ENV_FILE"; then
  read -r -p "Your Nocturna login username: " UNAME
  [ -n "$UNAME" ] && setvar NOCTURNA_USERNAME "$UNAME"
fi

# ---- 5. Firebase key --------------------------------------------------------
if [ ! -f "$CONFIG_DIR/firebase-key.json" ]; then
  KEY="$(ls -t "$HOME"/Downloads/*firebase-adminsdk*.json 2>/dev/null | head -1)"
  if [ -n "$KEY" ]; then
    mv "$KEY" "$CONFIG_DIR/firebase-key.json" && chmod 600 "$CONFIG_DIR/firebase-key.json"
    echo "✓ Moved Firebase key from Downloads"
  else
    say "Firebase key needed"
    echo "Opening the Firebase console. Go to: ⚙️ Project settings → Service accounts → Generate new private key."
    PROJECT="$(grep -oE "projectId:[[:space:]]*['\"][^'\"]+" "$REPO_DIR/script.js" | head -1 | sed -E "s/.*['\"]//")"
    open "https://console.firebase.google.com/project/${PROJECT:-_}/settings/serviceaccounts/adminsdk"
    echo "Waiting for the key to land in Downloads (Ctrl+C to stop)…"
    for _ in $(seq 1 180); do
      KEY="$(ls -t "$HOME"/Downloads/*firebase-adminsdk*.json 2>/dev/null | head -1)"
      [ -n "$KEY" ] && break
      sleep 2
    done
    if [ -z "$KEY" ]; then echo "❌ No key found. Download it, then run this script again."; exit 1; fi
    sleep 1
    mv "$KEY" "$CONFIG_DIR/firebase-key.json" && chmod 600 "$CONFIG_DIR/firebase-key.json"
    echo "✓ Firebase key saved"
  fi
fi

# ---- 6. Check + test --------------------------------------------------------
. "$ENV_FILE"
missing=""
[ -z "${TELEGRAM_BOT_TOKEN:-}" ] && missing="$missing TELEGRAM_BOT_TOKEN"
[ -z "${TELEGRAM_CHAT_ID:-}" ] && missing="$missing TELEGRAM_CHAT_ID"
if [ -n "$missing" ]; then
  echo "❌ Still missing:$missing — opening the settings file; fill it in and run this again."
  open -e "$ENV_FILE"; exit 1
fi

say "Sending a test to Telegram…"
if bash "$MAC_DIR/test.sh"; then
  say "🦉 All set. Nocturna will check every 15 minutes while your Mac is awake."
  echo "Log: tail -f ~/.nocturna/notifier.log"
else
  echo "❌ Test failed — copy the error above and send it to Claude."
fi
