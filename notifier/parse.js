// Quick-add parser for Telegram messages.
// "Dentist tomorrow 3pm @ Sandton"  -> event
// "Mom birthday 12 March"           -> yearly event
// "buy milk"                         -> quest (task) for today
import { addDaysToKey, dateKey, parseKey, pad } from '../calendar-core.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)';

function monthIndex(word) { return MONTHS.indexOf(word.slice(0, 3).toLowerCase()); }

/** Pick the next occurrence of month/day on or after today. */
function upcomingMonthDay(todayKey, m, d, explicitYear) {
  const t = parseKey(todayKey);
  if (explicitYear) return dateKey(explicitYear, m, d);
  let key = dateKey(t.y, m, d);
  if (key < todayKey) key = dateKey(t.y + 1, m, d);
  return key;
}

function validDay(y, m, d) {
  const dt = new Date(y, m, d);
  return dt.getMonth() === m && dt.getDate() === d;
}

export function parseQuickAdd(input, todayKey) {
  let text = ` ${input.trim()} `;
  const take = (re) => {
    const match = text.match(re);
    if (match) text = text.replace(match[0], ' ');
    return match;
  };

  // --- Repeat ------------------------------------------------------------
  let repeat = 'none';
  let mt;
  // "every mon" -> weekly, keep the weekday for the date parser below
  const everyDay = text.match(new RegExp(`\\severy\\s+${DAY_RE}\\s`, 'i'));
  if (everyDay) {
    repeat = 'weekly';
    text = text.replace(everyDay[0], ` ${everyDay[1]} `);
  } else if ((mt = take(/\s(every\s+day|daily)\s/i))) repeat = 'daily';
  else if ((mt = take(/\s(every\s+week|weekly)\s/i))) repeat = 'weekly';
  else if ((mt = take(/\s(every\s+month|monthly)\s/i))) repeat = 'monthly';
  else if ((mt = take(/\s(every\s+year|yearly|annually)\s/i))) repeat = 'yearly';
  const mentionsBirthday = /birthday|bday|🎂/i.test(text);

  // --- Reminder: "!15m", "!1h", "!1d", "!1w", "!none" ----------------------
  let reminder = null;
  if ((mt = take(/\s!(15m|1h|1d|1w|none)\s/i))) reminder = mt[1].toLowerCase();

  // --- Location: "@ somewhere" (runs to end of text) -----------------------
  let location = '';
  if ((mt = take(/\s@\s*([^@]+?)\s*$/))) location = mt[1].trim();

  // --- Date ---------------------------------------------------------------
  let date = null;
  const t = parseKey(todayKey);
  if ((mt = take(/\s(today|tonight|tn)\s/i))) date = todayKey;
  else if ((mt = take(/\s(tomorrow|tmrw|tmr|tomo)\s/i))) date = addDaysToKey(todayKey, 1);
  else if ((mt = take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)\s/i))) {
    const n = Number(mt[1]) * (/week/i.test(mt[2]) ? 7 : 1);
    date = addDaysToKey(todayKey, n);
  } else if ((mt = take(/\s(\d{4})-(\d{1,2})-(\d{1,2})\s/))) {
    const [y, m, d] = [Number(mt[1]), Number(mt[2]) - 1, Number(mt[3])];
    if (validDay(y, m, d)) date = dateKey(y, m, d);
  } else if ((mt = take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/))) {
    // South African order: dd/mm(/yyyy)
    const d = Number(mt[1]), m = Number(mt[2]) - 1;
    let y = mt[3] ? Number(mt[3]) : null;
    if (y && y < 100) y += 2000;
    if (validDay(y || t.y, m, d)) date = upcomingMonthDay(todayKey, m, d, y);
  } else if ((mt = take(new RegExp(`\\s(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:\\s+(\\d{4}))?\\s`, 'i')))) {
    const d = Number(mt[1]), m = monthIndex(mt[2]);
    if (validDay(mt[3] ? Number(mt[3]) : t.y, m, d)) date = upcomingMonthDay(todayKey, m, d, mt[3] ? Number(mt[3]) : null);
  } else if ((mt = take(new RegExp(`\\s${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\s`, 'i')))) {
    const m = monthIndex(mt[1]), d = Number(mt[2]);
    if (validDay(mt[3] ? Number(mt[3]) : t.y, m, d)) date = upcomingMonthDay(todayKey, m, d, mt[3] ? Number(mt[3]) : null);
  } else if ((mt = take(new RegExp(`\\s(?:(next|this)\\s+)?${DAY_RE}\\s`, 'i')))) {
    const target = DAYS.indexOf(mt[2].slice(0, 3).toLowerCase());
    const todayDow = new Date(t.y, t.m, t.d).getDay();
    let diff = (target - todayDow + 7) % 7;
    if (diff === 0) diff = 7; // "friday" said on a Friday means next week
    date = addDaysToKey(todayKey, diff);
  }

  // "Mom birthday 12 March" repeats yearly; "buy birthday gift" stays a task.
  if (mentionsBirthday && date && repeat === 'none') repeat = 'yearly';

  // --- Time ---------------------------------------------------------------
  let time = '';
  if ((mt = take(/\s(?:at\s+)?(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm)\s/i))) {
    let h = Number(mt[1]) % 12;
    if (mt[3].toLowerCase() === 'pm') h += 12;
    const min = Number(mt[2] || 0);
    if (h < 24 && min < 60) time = `${pad(h)}:${pad(min)}`;
  } else if ((mt = take(/\s(?:at\s+)?([01]?\d|2[0-3])[:h]([0-5]\d)\s/i))) {
    time = `${pad(Number(mt[1]))}:${mt[2]}`;
  } else if ((mt = take(/\s(?:at\s+)?noon\s/i))) {
    time = '12:00';
  } else if ((mt = take(/\sat\s+(\d{1,2})\s/i))) {
    // "at 3" — assume afternoon for 1–7, morning otherwise
    let h = Number(mt[1]);
    if (h >= 1 && h <= 7) h += 12;
    if (h < 24) time = `${pad(h)}:00`;
  }

  const title = text.replace(/\s+/g, ' ').trim().replace(/\s+(on|at|for)$/i, '').replace(/^(on|at)\s+/i, '').trim();
  if (!title) return null;

  // No date and no time -> it's a task for today.
  if (!date && !time && repeat === 'none') {
    return { kind: 'quest', date: todayKey, text: title };
  }

  if (!date) {
    date = todayKey;
  }

  const allDay = !time;
  if (reminder === null) {
    reminder = repeat === 'yearly' ? 'none' : (allDay ? '1d' : '1h');
  }

  return {
    kind: 'event',
    date,
    event: {
      title: repeat === 'yearly' && !/🎂/.test(title) ? `🎂 ${title}` : title,
      time,
      allDay,
      repeat,
      reminder,
      expiryDate: '',
      location,
      color: repeat === 'yearly' ? 'pink' : 'violet'
    }
  };
}
