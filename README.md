# Nocturna
Your friendly neighbourhood calendar

## What's in here

| File | What it does |
|---|---|
| `index.html`, `style.css`, `script.js` | The web app |
| `calendar-core.js` | Shared calendar logic (holidays, recurring events, reminders), used by the app **and** the notifier |
| `sw.js` | Service worker: offline support + tapping a notification opens that day |
| `notifier/` | Background job that sends Telegram briefings and reminders, and lets you add events by texting the bot |
| `.github/workflows/notify.yml` | Runs the notifier every 15 minutes on GitHub Actions (free) |

## Telegram notifier setup (one-time, ~10 minutes)

Browser notifications only fire while the app is open. The notifier runs on
GitHub's servers, so your phone gets pinged even when Nocturna is closed.

**What you get:**
- ☀️ **Morning briefing** at 06:30. It lists today's events, open tasks (including unticked ones from earlier in the week), the next 6 days, upcoming birthdays, renewals, public holidays and fuel-price days.
- 🎂 **Birthday messages** with a ready-to-copy greeting.
- 🌙 **Evening preview** at 20:00, only if tomorrow has something on.
- ⏰ **Reminders** for events with a reminder set, including recurring ones.
- ✍️ **Quick-add.** Text the bot `Dentist tomorrow 3pm @ Sandton` and it lands in your calendar. Send `/help` for everything it understands.

### 1. Telegram bot
You probably already have a bot token and chat ID from the old `env.js`. If not:
1. Message **@BotFather** → `/newbot` → copy the token.
2. Send your new bot any message, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`.

> ⚠️ If your old token was ever put in `env.js` on a public site, revoke it in
> BotFather (`/revoke`) and use the new one. The browser no longer needs it.

### 2. Firebase service account
Firebase console → ⚙️ Project settings → **Service accounts** → **Generate new private key**.
This downloads a JSON file. Keep it private.

### 3. GitHub secrets & variables
Repo → **Settings → Secrets and variables → Actions**

**Secrets:**
| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | the whole contents of the JSON file |
| `TELEGRAM_BOT_TOKEN` | bot token |
| `TELEGRAM_CHAT_ID` | your chat ID |

**Variables** (Variables tab):
| Name | Value |
|---|---|
| `NOCTURNA_USERNAME` | your Nocturna login username |
| `NOCTURNA_APP_URL` | where the app is hosted (adds an "Open Nocturna →" link to messages) |
| `DIGEST_TIME` | optional, default `06:30` |
| `EVENING_TIME` | optional, default `20:00` |

### 4. Test it
Repo → **Actions → Nocturna notifier → Run workflow** (mode: `test`).
You should get a test message plus a briefing on Telegram within a minute.

### Notes
- GitHub can delay scheduled runs by a few minutes, so a "15 min before" reminder may arrive 5–15 minutes early or late. Use "1 hour before" for anything time-critical.
- Times use `Africa/Johannesburg`.
- The notifier stores what it has already sent in the Firestore collection `nocturna_notifier`, so nothing is sent twice.
- Run tests with `cd notifier && npm install && npm test`.
