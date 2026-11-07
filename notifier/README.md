# Nocturna notifier (runs on your Mac)

Browser notifications only fire while the app is open. The notifier runs as a
background job on your Mac **every 15 minutes while it's awake**, so Telegram
pings you even when Nocturna is closed. After sleep it catches up: missed
reminders and the morning briefing go out as soon as the Mac wakes.

**What you get:**
- ☀️ **Morning briefing** at 06:30 (or whenever the Mac first wakes after that): today's events, open tasks (including unticked ones from earlier in the week), the next 6 days, birthdays, renewals, public holidays and fuel-price days.
- 🎂 **Birthday messages** with a ready-to-copy greeting.
- 🌙 **Evening preview** at 20:00, only if tomorrow has something on.
- ⏰ **Reminders** for events with a reminder set, including recurring ones.
- ✍️ **Quick-add.** Text the bot `Dentist tomorrow 3pm @ Sandton` and it lands in your calendar on the next run. Send `/help` for everything it understands.

## Install (one-time)
From the repo folder run:
```
bash notifier/mac/setup.sh
```
It installs Node if needed, copies the bot token and chat ID from `env.js`, asks for your username, finds (or helps you download) the Firebase key, installs the background job and sends a test. If the test fails right after creating a new key, wait a minute and run `bash notifier/mac/test.sh`.

Settings and the key live in `~/.nocturna/`, outside the repo, so they can't be committed by accident.

| Task | Command |
|---|---|
| See what it's doing | `tail -f ~/.nocturna/notifier.log` |
| Run once now | `launchctl kickstart gui/$(id -u)/com.nocturna.notifier` |
| Stop / remove | `bash notifier/mac/uninstall.sh` |
| After moving the repo folder | run `install.sh` again |

> ⚠️ If your bot token was ever in `env.js` on a public site, revoke it in BotFather (`/revoke`) and use the new one.

## Notes
- Nothing runs while the Mac is asleep or off, so a "15 min before" reminder can arrive late. The morning briefing waits until the Mac wakes.
- Times use `Africa/Johannesburg`.
- What's already been sent is stored in the Firestore collection `nocturna_notifier`, so nothing is sent twice.
- `.github/workflows/notify.yml` is still there for manual runs from GitHub. Add the `schedule:` lines back if you ever want GitHub to run it instead.
- Run tests with `cd notifier && npm install && npm test`.
