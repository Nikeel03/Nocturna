#!/bin/bash
# Called by launchd every 15 minutes. Loads secrets and runs the notifier once.
set -u
CONFIG_DIR="$HOME/.nocturna"
LOG="$CONFIG_DIR/notifier.log"
NOTIFIER_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Keep the log small (last ~2000 lines).
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 4000 ]; then
  tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

{
  echo "---- $(date '+%Y-%m-%d %H:%M:%S')"
  if [ ! -f "$CONFIG_DIR/notifier.env" ]; then
    echo "Missing $CONFIG_DIR/notifier.env — run notifier/mac/install.sh"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1091
  . "$CONFIG_DIR/notifier.env"
  set +a
  cd "$NOTIFIER_DIR" || exit 1
  "${NODE_BIN:-node}" notify.js
} >> "$LOG" 2>&1
