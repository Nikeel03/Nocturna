#!/bin/bash
# Removes the background job. Leaves ~/.nocturna (your settings) in place.
LABEL="com.nocturna.notifier"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "✓ Nocturna notifier stopped and removed"
