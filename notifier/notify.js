// Nocturna background notifier.
// Runs on a schedule (GitHub Actions, every ~15 min). It does NOT need the
// web app to be open. Each run it:
//   1. reads Telegram messages you sent the bot (quick-add + commands)
//   2. sends the morning briefing once a day
//   3. sends the evening "tomorrow" preview once a day
//   4. sends any event reminders that are now due (incl. recurring events)
// Sent-state lives in Firestore (collection `nocturna_notifier`) so nothing
// is sent twice.

import admin from 'firebase-admin';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  addDaysToKey, computeDay, daysBetween, dueReminders, formatTime, generateBirthdayWish,
  getExpiryItems, getExpiryStatus, isBirthdayEvent, nextPublicHoliday, pad, parseKey,
  sortEvents, upcomingBirthdays
} from '../calendar-core.js';
import { parseQuickAdd } from './parse.js';

const TZ = process.env.NOCTURNA_TZ || 'Africa/Johannesburg';
const DIGEST_TIME = process.env.DIGEST_TIME || '06:30';
const EVENING_TIME = process.env.EVENING_TIME || '20:00';
const BOT = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = String(process.env.TELEGRAM_CHAT_ID || '');
const USERNAME = (process.env.NOCTURNA_USERNAME || '').trim().toLowerCase();
const APP_URL = process.env.NOCTURNA_APP_URL || '';
const MODE = process.env.MODE || 'auto'; // auto | digest | evening | test
const BUBWEB_URL = 'https://guide-to-the-outside-default-rtdb.firebaseio.com/activities.json';

// ---------------------------------------------------------------- time ----

function zoneParts(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find(p => p.type === t).value;
  return { key: `${get('year')}-${get('month')}-${get('day')}`, hhmm: `${get('hour')}:${get('minute')}` };
}

/** Local (TZ) date + time -> epoch ms. */
function toEpoch(key, hhmm) {
  const { y, m, d } = parseKey(key);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m, d, h, mi);
  const local = zoneParts(guess);
  const lp = parseKey(local.key);
  const [lh, lmi] = local.hhmm.split(':').map(Number);
  const offset = Date.UTC(lp.y, lp.m, lp.d, lh, lmi) - guess;
  return guess - offset;
}

const weekday = (key) => {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m, d)).toLocaleDateString('en-ZA', { weekday: 'long', timeZone: 'UTC' });
};
const niceDate = (key) => {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m, d)).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const inDaysLabel = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

// ------------------------------------------------------------ telegram ----

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`);
  return data.result;
}

async function send(text) {
  const footer = APP_URL ? `\n\n<a href="${esc(APP_URL)}">Open Nocturna →</a>` : '';
  return tg('sendMessage', {
    chat_id: CHAT, text: text + footer, parse_mode: 'HTML', disable_web_page_preview: true
  });
}

// ------------------------------------------------------------- content ----

function eventLine(ev) {
  const when = ev.allDay || !ev.time ? '•' : `<b>${formatTime(ev.time)}</b>`;
  const where = ev.location && !ev.isHoliday ? ` <i>@ ${esc(ev.location)}</i>` : '';
  return `${when} ${esc(ev.title)}${where}`;
}

const userEvents = (day) => sortEvents(day.events.filter(e => !e.isHoliday && !e.isExpiryMarker));

function buildMorningDigest(calendar, bubweb, today) {
  const day = computeDay(calendar, today, bubweb);
  const lines = [`🦉 <b>Good morning — ${weekday(today)}, ${niceDate(today).split(', ').pop()}</b>`];

  const hol = day.events.find(e => e.isHoliday);
  if (hol) lines.push(`${esc(hol.title)}${hol.isOff ? ' — day off!' : ''}`);

  const evs = userEvents(day);
  lines.push('', evs.length ? '<b>Today</b>' : '<b>Today</b>\nNothing scheduled — a free day.');
  evs.forEach(ev => lines.push(eventLine(ev)));

  // Open tasks: today's + anything left unticked from the last 7 days.
  const open = [];
  for (let i = 7; i >= 0; i--) {
    const key = addDaysToKey(today, -i);
    const stored = calendar?.[key.slice(0, 7)]?.[key.slice(8)];
    (stored?.quests || []).filter(q => !q.done).forEach(q => open.push({ q, key, carried: i > 0 }));
  }
  if (open.length) {
    lines.push('', `<b>Tasks (${open.length})</b>`);
    open.slice(0, 10).forEach(({ q, key, carried }) =>
      lines.push(`☐ ${esc(q.text)}${carried ? ` <i>(from ${niceDate(key)})</i>` : ''}`));
    if (open.length > 10) lines.push(`…and ${open.length - 10} more`);
  }

  // Coming up: next 6 days, user events only.
  const ahead = [];
  for (let i = 1; i <= 6; i++) {
    const key = addDaysToKey(today, i);
    userEvents(computeDay(calendar, key, bubweb))
      .filter(ev => !(ev.repeat === 'daily'))
      .forEach(ev => ahead.push({ key, ev }));
  }
  if (ahead.length) {
    lines.push('', '<b>Coming up</b>');
    ahead.slice(0, 8).forEach(({ key, ev }) =>
      lines.push(`${niceDate(key)} — ${ev.time && !ev.allDay ? formatTime(ev.time) + ' ' : ''}${esc(ev.title)}`));
  }

  // Heads-ups: birthdays, renewals, holidays, fuel.
  const heads = [];
  upcomingBirthdays(calendar, today, 14).forEach(({ ev, inDays }) => {
    if (inDays > 0) heads.push(`🎂 ${esc(ev.title.replace(/🎂\s*/u, ''))} ${inDaysLabel(inDays)}`);
  });
  getExpiryItems(calendar).forEach(item => {
    const st = getExpiryStatus(item.expiryDate, today);
    if (st.id === 'expired') heads.push(`🔴 ${esc(item.title)} expired ${niceDate(item.expiryDate)}`);
    else if (st.id === 'soon') heads.push(`🟠 ${esc(item.title)} expires ${inDaysLabel(daysBetween(today, item.expiryDate))}`);
  });
  const ph = nextPublicHoliday(addDaysToKey(today, 1), 45);
  if (ph) heads.push(`🇿🇦 ${esc(ph.holiday.name)} ${inDaysLabel(ph.inDays + 1)}${ph.longWeekend ? ' — long weekend 🏖️' : ''}`);
  for (let i = 1; i <= 6; i++) {
    const key = addDaysToKey(today, i);
    if (computeDay(calendar, key).events.some(e => e.isFuel)) heads.push(`⛽ Fuel price changes ${weekday(key)}`);
  }
  if (heads.length) lines.push('', '<b>Heads-up</b>', ...heads);

  return lines.join('\n');
}

function buildEveningPreview(calendar, bubweb, today) {
  const tomorrow = addDaysToKey(today, 1);
  const day = computeDay(calendar, tomorrow, bubweb);
  const evs = userEvents(day);
  const quests = (day.quests || []).filter(q => !q.done);
  const hol = day.events.find(e => e.isHoliday && e.isOff);
  if (!evs.length && !quests.length && !hol) return null;

  const lines = [`🌙 <b>Tomorrow — ${weekday(tomorrow)}</b>`];
  if (hol) lines.push(`${esc(hol.title)} — day off!`);
  evs.forEach(ev => lines.push(eventLine(ev)));
  quests.forEach(q => lines.push(`☐ ${esc(q.text)}`));
  const first = evs.find(e => e.time && !e.allDay);
  if (first) lines.push('', `First thing: ${formatTime(first.time)}. Set an alarm?`);
  return lines.join('\n');
}

function buildDayList(calendar, bubweb, startKey, days, heading) {
  const lines = [heading];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(startKey, i);
    const day = computeDay(calendar, key, bubweb);
    const evs = sortEvents(day.events.filter(e => !e.isExpiryMarker));
    const quests = (day.quests || []).filter(q => !q.done);
    if (!evs.length && !quests.length && days > 1) continue;
    lines.push('', `<b>${niceDate(key)}</b>`);
    if (!evs.length && !quests.length) lines.push('Nothing planned.');
    evs.forEach(ev => lines.push(eventLine(ev)));
    quests.forEach(q => lines.push(`☐ ${esc(q.text)}`));
  }
  if (lines.length === 1) lines.push('', 'Nothing planned.');
  return lines.join('\n');
}

// ------------------------------------------------------------ firestore ----

function initFirebase() {
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const raw = file ? readFileSync(file, 'utf8') : process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_FILE (path to the key JSON) or FIREBASE_SERVICE_ACCOUNT');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  return admin.firestore();
}

async function findUser(db) {
  if (USERNAME) {
    const snap = await db.collection('users').where('username', '==', USERNAME).limit(1).get();
    if (!snap.empty) return snap.docs[0];
    // usernames are stored with original casing; fall back to the derived email
    const byEmail = await db.collection('users').where('email', '==', `${USERNAME.replace(/\s+/g, '')}@nocturna.com`).limit(1).get();
    if (!byEmail.empty) return byEmail.docs[0];
    throw new Error(`No Nocturna user found for NOCTURNA_USERNAME="${USERNAME}"`);
  }
  const all = await db.collection('users').limit(2).get();
  if (all.size !== 1) throw new Error('Set NOCTURNA_USERNAME so the notifier knows whose calendar to read');
  return all.docs[0];
}

async function fetchBubweb() {
  try {
    const res = await fetch(BUBWEB_URL);
    const data = await res.json();
    return data ? (Array.isArray(data) ? data : Object.values(data)).filter(Boolean) : [];
  } catch (e) {
    console.warn('Bubweb fetch failed:', e.message);
    return [];
  }
}

const newId = (p) => p + Date.now() + Math.random().toString(36).slice(2, 7);

async function addToCalendar(db, userRef, parsed) {
  const mKey = parsed.date.slice(0, 7);
  const dNum = parsed.date.slice(8, 10);
  const field = new admin.firestore.FieldPath('calendar', mKey, dNum);
  let added;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const entry = JSON.parse(JSON.stringify(snap.get(field) || { events: [], quests: [], complete: false }));
    entry.events ||= [];
    entry.quests ||= [];
    if (parsed.kind === 'quest') {
      added = { id: newId('q_'), text: parsed.text, done: false };
      entry.quests.push(added);
    } else {
      added = { id: newId('e'), ...parsed.event };
      entry.events.push(added);
    }
    tx.update(userRef, field, entry);
  });
  return { ...parsed, id: added.id };
}

async function removeFromCalendar(db, userRef, last) {
  const field = new admin.firestore.FieldPath('calendar', last.date.slice(0, 7), last.date.slice(8, 10));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const entry = snap.get(field);
    if (!entry) return;
    entry.events = (entry.events || []).filter(e => e.id !== last.id);
    entry.quests = (entry.quests || []).filter(q => q.id !== last.id);
    tx.update(userRef, field, entry);
  });
}

// ------------------------------------------------------------ commands ----

const HELP = [
  '🦉 <b>Nocturna bot</b>',
  'Just text me things and I\'ll add them:',
  '• <code>Dentist tomorrow 3pm @ Sandton</code>',
  '• <code>Gym every mon 06:00</code>',
  '• <code>Mom birthday 12 March</code>',
  '• <code>Car service 5/12 !1w</code> (reminder 1 week before)',
  '• <code>buy milk</code> → task for today',
  '',
  'Dates: today, tomorrow, fri, next fri, 12 March, 5/12, 2026-12-05, in 3 days',
  'Times: 3pm, 15:00, 15h30, noon. Reminders: !15m !1h !1d !1w !none',
  '',
  '/today /tomorrow /week — see what\'s on',
  '/undo — remove the last thing I added'
].join('\n');

async function handleMessages(db, userRef, state, ctx) {
  const updates = await tg('getUpdates', { offset: state.telegramOffset || 0, timeout: 0, allowed_updates: ['message'] });
  for (const u of updates) {
    state.telegramOffset = u.update_id + 1;
    const msg = u.message;
    if (!msg || String(msg.chat.id) !== CHAT || !msg.text) continue;
    // Ignore very old messages (e.g. first run after setup)
    if (ctx.nowMs / 1000 - msg.date > 3 * 86400) continue;

    const text = msg.text.trim();
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');
    try {
      if (cmd === '/start' || cmd === '/help') await send(HELP);
      else if (cmd === '/today') await send(buildDayList(ctx.calendar, ctx.bubweb, ctx.today, 1, '📅 <b>Today</b>'));
      else if (cmd === '/tomorrow') await send(buildDayList(ctx.calendar, ctx.bubweb, addDaysToKey(ctx.today, 1), 1, '📅 <b>Tomorrow</b>'));
      else if (cmd === '/week') await send(buildDayList(ctx.calendar, ctx.bubweb, ctx.today, 7, '📅 <b>Next 7 days</b>'));
      else if (cmd === '/brief') await send(buildMorningDigest(ctx.calendar, ctx.bubweb, ctx.today));
      else if (cmd === '/undo') {
        const last = state.lastAdded;
        if (!last) await send('Nothing to undo.');
        else {
          await removeFromCalendar(db, userRef, last);
          state.lastAdded = null;
          await send(`↩️ Removed <b>${esc(last.label)}</b>.`);
        }
      } else if (cmd.startsWith('/')) await send('Unknown command. /help shows what I can do.');
      else {
        const body = text.replace(/^\/add\s+/i, '');
        const parsed = parseQuickAdd(body, ctx.today);
        if (!parsed) { await send('Couldn\'t read that — try /help'); continue; }
        const saved = await addToCalendar(db, userRef, parsed);
        const label = parsed.kind === 'quest' ? parsed.text : parsed.event.title;
        state.lastAdded = { id: saved.id, date: saved.date, label };
        if (parsed.kind === 'quest') {
          await send(`☐ Task added for today: <b>${esc(label)}</b>\n/undo if that's wrong.`);
        } else {
          const ev = parsed.event;
          const bits = [niceDate(parsed.date), ev.allDay ? 'all day' : formatTime(ev.time)];
          if (ev.location) bits.push(`@ ${esc(ev.location)}`);
          if (ev.repeat !== 'none') bits.push(`repeats ${ev.repeat}`);
          if (ev.reminder !== 'none') bits.push(`reminder ${ev.reminder} before`);
          await send(`✅ <b>${esc(label)}</b>\n${bits.join(' · ')}\n/undo if that's wrong.`);
        }
      }
    } catch (e) {
      console.error('Message handling failed:', e);
      await send(`⚠️ Something went wrong: ${esc(e.message)}`).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------- main ----

async function main() {
  if (!BOT || !CHAT) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secrets are missing');
  const db = initFirebase();
  const userDoc = await findUser(db);
  const userRef = userDoc.ref;
  const stateRef = db.collection('nocturna_notifier').doc(userDoc.id);
  const state = (await stateRef.get()).data() || {};
  state.sent ||= {};

  const nowMs = Date.now();
  const { key: today, hhmm } = zoneParts(nowMs);
  const bubweb = await fetchBubweb();
  const ctx = { nowMs, today, bubweb, calendar: userDoc.get('calendar') || {} };
  console.log(`Run at ${today} ${hhmm} (${TZ}), mode=${MODE}`);

  if (MODE === 'test') {
    await send('🦉 <b>Nocturna test</b>\nBackground notifications are wired up and working.');
    await send(buildMorningDigest(ctx.calendar, bubweb, today));
    return;
  }

  // 1. Incoming Telegram messages (may change the calendar → re-read after)
  await handleMessages(db, userRef, state, ctx);
  ctx.calendar = (await userRef.get()).get('calendar') || {};

  // 2. Morning digest + birthday wishes
  if (MODE === 'digest' || (hhmm >= DIGEST_TIME && state.lastDigest !== today)) {
    await send(buildMorningDigest(ctx.calendar, bubweb, today));
    const bdays = computeDay(ctx.calendar, today, bubweb).events.filter(isBirthdayEvent);
    for (const ev of bdays) {
      await send(`🎂 <b>It's ${esc(ev.title.replace(/🎂\s*/u, ''))} today!</b>\nTap to copy a greeting:\n\n<code>${esc(generateBirthdayWish(ev.title))}</code>`);
    }
    state.lastDigest = today;
  }

  // 3. Evening preview of tomorrow
  if (MODE === 'evening' || (hhmm >= EVENING_TIME && state.lastEvening !== today)) {
    const preview = buildEveningPreview(ctx.calendar, bubweb, today);
    if (preview) await send(preview);
    state.lastEvening = today;
  }

  // 4. Event reminders
  for (const r of dueReminders(ctx.calendar, nowMs, toEpoch, bubweb)) {
    if (state.sent[r.id]) continue;
    const mins = Math.round((r.start - nowMs) / 60000);
    const lead = mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.round(mins / 60)}h` : inDaysLabel(daysBetween(today, r.key));
    const when = r.ev.allDay || !r.ev.time ? niceDate(r.key) : `${niceDate(r.key)}, ${formatTime(r.ev.time)}`;
    await send(`⏰ <b>${esc(r.ev.title)}</b> — ${lead}\n${when}${r.ev.location ? `\n📍 ${esc(r.ev.location)}` : ''}`);
    state.sent[r.id] = nowMs;
  }

  // Prune sent log (> 10 days old)
  for (const [id, ts] of Object.entries(state.sent)) if (nowMs - ts > 10 * 86400e3) delete state.sent[id];
  await stateRef.set(state);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { buildMorningDigest, buildEveningPreview, toEpoch, zoneParts };
