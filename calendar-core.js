// calendar-core.js
// Pure calendar logic shared by the web app (script.js) and the
// background notifier (notifier/notify.js). No DOM, no Firebase here.

export const pad = (n) => String(n).padStart(2, '0');

/** m is 0-based (JS month). */
export const dateKey = (y, m, day) => `${y}-${pad(m + 1)}-${pad(day)}`;

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m: m - 1, d };
}

export function addDaysToKey(key, days) {
  const { y, m, d } = parseKey(key);
  const r = new Date(y, m, d + days);
  return dateKey(r.getFullYear(), r.getMonth(), r.getDate());
}

export function addMonthsClamped(key, monthDelta) {
  const { y, m, d } = parseKey(key);
  const target = m + monthDelta;
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  const last = new Date(ty, tm + 1, 0).getDate();
  return dateKey(ty, tm, Math.min(d, last));
}

/** Whole days from key a to key b (b - a). */
export function daysBetween(a, b) {
  const pa = parseKey(a), pb = parseKey(b);
  return Math.round((Date.UTC(pb.y, pb.m, pb.d) - Date.UTC(pa.y, pa.m, pa.d)) / 86400000);
}

export function formatTime(t) {
  if (!t) return '';
  const [h, mm] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(mm)} ${period}`;
}

// ---------------------------------------------------------------------------
// Holidays & observances (South Africa + Hindu festivals + fuel day)
// ---------------------------------------------------------------------------

function calculateEasterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function getNthWeekdayOfMonth(year, month, weekday, n) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const t = new Date(year, month, d);
    if (t.getMonth() !== month) break;
    if (t.getDay() === weekday && ++count === n) return d;
  }
  return 1;
}

const HINDU_FESTIVALS_TABLE = {
  2024: { diwali: '10-31', shivaratri: '03-08', janmashtami: '08-26', kavady: '01-25' },
  2025: { diwali: '10-20', shivaratri: '02-26', janmashtami: '08-16', kavady: '02-10' },
  2026: { diwali: '11-08', shivaratri: '02-15', janmashtami: '09-04', kavady: '02-01' },
  2027: { diwali: '10-28', shivaratri: '03-06', janmashtami: '08-25', kavady: '01-22' },
  2028: { diwali: '10-17', shivaratri: '02-23', janmashtami: '08-13', kavady: '02-09' },
  2029: { diwali: '11-05', shivaratri: '02-11', janmashtami: '08-31', kavady: '01-29' },
  2030: { diwali: '10-26', shivaratri: '03-02', janmashtami: '08-21', kavady: '01-18' },
  2031: { diwali: '11-14', shivaratri: '02-20', janmashtami: '08-10', kavady: '02-06' },
  2032: { diwali: '11-02', shivaratri: '03-09', janmashtami: '08-28', kavady: '01-26' },
  2033: { diwali: '10-22', shivaratri: '02-27', janmashtami: '08-17', kavady: '02-14' },
  2034: { diwali: '11-10', shivaratri: '02-17', janmashtami: '09-05', kavady: '02-03' },
  2035: { diwali: '10-30', shivaratri: '03-07', janmashtami: '08-26', kavady: '01-24' }
};

function getHinduFestivalsForYear(year) {
  if (HINDU_FESTIVALS_TABLE[year]) return HINDU_FESTIVALS_TABLE[year];
  const base = 2024 + ((((year - 2024) % 19) + 19) % 19);
  return HINDU_FESTIVALS_TABLE[base] || HINDU_FESTIVALS_TABLE[2026];
}

function buildHolidaysForYear(year) {
  const holidays = {};

  function add(m, d, name, color, isOff = true, note = '', isHindu = false) {
    const key = dateKey(year, m - 1, d);
    holidays[key] = { name, color, isOff, note, dayColor: color, isHindu };
    if (isOff && new Date(year, m - 1, d).getDay() === 0) {
      const mon = new Date(year, m - 1, d + 1);
      holidays[dateKey(mon.getFullYear(), mon.getMonth(), mon.getDate())] = {
        name: `${name} (Observed)`, color, isOff: true,
        note: 'Public Holiday (Sunday Roll-over)', dayColor: color, isHindu: false
      };
    }
  }

  add(1, 1, "New Year's Day", '#ef4444');
  add(3, 21, 'Human Rights Day', '#e11d48');
  add(4, 27, 'Freedom Day', '#f59e0b');
  add(5, 1, "Workers' Day", '#e11d48');
  add(6, 16, 'Youth Day', '#0284c7');
  add(8, 9, "National Women's Day", '#ec4899');
  add(9, 24, 'Heritage Day', '#10b981');
  add(12, 16, 'Day of Reconciliation', '#10b981');
  add(12, 25, 'Christmas Day', '#ef4444');
  add(12, 26, 'Day of Goodwill', '#ef4444');

  const easter = calculateEasterSunday(year);
  const gf = new Date(easter); gf.setDate(easter.getDate() - 2);
  const fd = new Date(easter); fd.setDate(easter.getDate() + 1);
  add(gf.getMonth() + 1, gf.getDate(), 'Good Friday', '#6366f1');
  add(fd.getMonth() + 1, fd.getDate(), 'Family Day', '#6366f1');

  const hindu = getHinduFestivalsForYear(year);
  const addHindu = (val, name, color, note) => {
    if (!val) return;
    const [m, d] = val.split('-').map(Number);
    add(m, d, name, color, false, note, true);
  };
  addHindu(hindu.diwali, 'Diwali (Deepavali)', '#f97316', 'Festival of Lights');
  addHindu(hindu.shivaratri, 'Maha Shivaratri', '#8b5cf6', 'Great Night of Shiva');
  addHindu(hindu.janmashtami, 'Krishna Janmashtami', '#06b6d4', 'Birth of Lord Krishna');
  addHindu(hindu.kavady, 'Thaipoosam Kavady', '#eab308', 'Murugan Devotion & Penance');

  add(5, getNthWeekdayOfMonth(year, 4, 0, 2), "Mother's Day", '#a855f7', false, 'Special Sunday');
  add(6, getNthWeekdayOfMonth(year, 5, 0, 3), "Father's Day", '#3b82f6', false, 'Special Sunday');
  add(12, 31, "New Year's Eve", '#facc15', false, 'Celebration');

  for (let m = 0; m < 12; m++) {
    const key = dateKey(year, m, getNthWeekdayOfMonth(year, m, 3, 1));
    if (!holidays[key]) {
      holidays[key] = {
        name: 'Fuel Price Adjustment', color: '#f59e0b', isOff: false,
        note: 'Official DMPR / CEF Fuel Price Adjustment Day', dayColor: null, isFuel: true
      };
    }
  }
  return holidays;
}

const holidayCache = {};
export function getHoliday(key) {
  const y = Number(key.slice(0, 4));
  if (!holidayCache[y]) holidayCache[y] = buildHolidaysForYear(y);
  return holidayCache[y][key] || null;
}

// ---------------------------------------------------------------------------
// Day computation
// ---------------------------------------------------------------------------

export function isBirthdayEvent(ev) {
  return !ev.isHoliday && !ev.isExpiryMarker &&
    (ev.repeat === 'yearly' || /birthday|🎂/i.test(ev.title || ''));
}

function recursOn(ev, srcKey, targetKey) {
  if (!ev.repeat || ev.repeat === 'none' || srcKey === targetKey) return false;
  if (targetKey < srcKey) return ev.repeat === 'yearly' ? sameMonthDay(srcKey, targetKey) : false;
  const src = parseKey(srcKey), tgt = parseKey(targetKey);
  switch (ev.repeat) {
    case 'daily': return true;
    case 'weekly': return daysBetween(srcKey, targetKey) % 7 === 0;
    case 'monthly': {
      // An event on the 31st lands on the last day of shorter months.
      const last = new Date(tgt.y, tgt.m + 1, 0).getDate();
      return tgt.d === Math.min(src.d, last);
    }
    case 'yearly': return sameMonthDay(srcKey, targetKey);
    default: return false;
  }
}

function sameMonthDay(srcKey, targetKey) {
  const src = parseKey(srcKey), tgt = parseKey(targetKey);
  if (src.m !== tgt.m) return false;
  if (src.d === tgt.d) return true;
  // 29 Feb birthdays show on 28 Feb in non-leap years.
  const leap = new Date(tgt.y, 1, 29).getMonth() === 1;
  return src.m === 1 && src.d === 29 && tgt.d === 28 && !leap;
}

/** Iterate every stored event: cb(event, sourceDateKey). */
export function forEachStoredEvent(calendar, cb) {
  Object.entries(calendar || {}).forEach(([mKey, monthData]) => {
    if (!monthData || typeof monthData !== 'object') return;
    Object.entries(monthData).forEach(([dNum, entry]) => {
      if (!/^\d+$/.test(dNum)) return;
      (entry?.events || []).forEach(ev => cb(ev, `${mKey}-${pad(Number(dNum))}`));
    });
  });
}

/**
 * Everything that happens on a given date.
 * @param calendar  the user's stored calendar object
 * @param key       'YYYY-MM-DD'
 * @param bubweb    optional array of Bubweb activities
 */
export function computeDay(calendar, key, bubweb = []) {
  const mKey = key.slice(0, 7);
  const dNum = key.slice(8, 10);
  const stored = calendar?.[mKey]?.[dNum];
  const base = stored ? JSON.parse(JSON.stringify(stored)) : { events: [], quests: [], complete: false };

  const direct = (base.events || []).map(ev => ({ ...ev, originDate: key }));
  const expiry = [];
  const recurring = [];

  forEachStoredEvent(calendar, (ev, srcKey) => {
    if (ev.expiryDate) {
      const markers = [
        { date: ev.expiryDate, kind: 'expiry', label: 'expires today' },
        { date: addMonthsClamped(ev.expiryDate, -1), kind: 'expiry-month', label: 'expires in 1 month' },
        { date: addDaysToKey(ev.expiryDate, -7), kind: 'expiry-week', label: 'expires in 1 week' }
      ];
      markers.filter(mk => mk.date === key).forEach(mk => expiry.push({
        ...ev,
        id: `${ev.id}-${mk.kind}`,
        title: `${ev.title} ${mk.label}`,
        allDay: true,
        time: '',
        reminder: 'none',
        color: mk.kind === 'expiry' ? '#ef4444' : '#f97316',
        isExpiryMarker: true,
        expiryMarkerKind: mk.kind,
        originDate: srcKey
      }));
    }
    if (recursOn(ev, srcKey, key)) {
      recurring.push({ ...ev, isRecurringInstance: true, originDate: srcKey });
    }
  });

  const bub = (bubweb || []).filter(a => a && a.date === key).map(a => ({
    id: `bub-${a.id}`,
    title: `🎈 ${a.name}`,
    time: a.time || '',
    allDay: !a.time,
    location: 'BubAdventure',
    color: 'pink',
    isBubwebSynced: true,
    completed: !!a.completed
  }));

  const hol = getHoliday(key);
  const holidayEvents = hol ? [{
    id: `sa-holiday-${key}`,
    title: `${hol.isOff ? '🇿🇦 ' : (hol.isHindu ? '🪔 ' : (hol.isFuel ? '⛽ ' : '✨ '))}${hol.name}`,
    allDay: true,
    location: hol.note || (hol.isOff ? 'Public Holiday (Paid Off)' : 'Observance'),
    color: hol.color,
    isHoliday: true,
    isOff: hol.isOff,
    isHindu: !!hol.isHindu,
    isFuel: !!hol.isFuel
  }] : [];

  return {
    ...base,
    dayColor: base.dayColor || (hol ? hol.dayColor : null),
    events: [...holidayEvents, ...direct, ...expiry, ...recurring, ...bub],
    hasExpiry: expiry.some(e => e.expiryMarkerKind === 'expiry'),
    quests: base.quests || []
  };
}

/** Sort: all-day first, then by time. */
export function sortEvents(events) {
  return [...events].sort((a, b) => {
    const ta = a.allDay || !a.time ? '' : a.time;
    const tb = b.allDay || !b.time ? '' : b.time;
    return ta.localeCompare(tb);
  });
}

/** [{ key, events }] for `days` days starting at startKey. */
export function getRange(calendar, startKey, days, bubweb = []) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(startKey, i);
    out.push({ key, day: computeDay(calendar, key, bubweb) });
  }
  return out;
}

/** Next occurrence (on/after fromKey) of each birthday, sorted. */
export function upcomingBirthdays(calendar, fromKey, withinDays = 60) {
  const seen = new Map();
  forEachStoredEvent(calendar, (ev, srcKey) => {
    if (!isBirthdayEvent(ev) || ev.repeat !== 'yearly') return;
    const src = parseKey(srcKey);
    const from = parseKey(fromKey);
    for (const y of [from.y, from.y + 1]) {
      const last = new Date(y, src.m + 1, 0).getDate();
      const key = dateKey(y, src.m, Math.min(src.d, last));
      const inDays = daysBetween(fromKey, key);
      if (inDays >= 0) {
        if (inDays <= withinDays && !seen.has(ev.id)) seen.set(ev.id, { ev, key, inDays });
        break;
      }
    }
  });
  return [...seen.values()].sort((a, b) => a.inDays - b.inDays);
}

/** Next public holiday (day off) on/after fromKey. */
export function nextPublicHoliday(fromKey, maxDays = 370) {
  for (let i = 0; i < maxDays; i++) {
    const key = addDaysToKey(fromKey, i);
    const h = getHoliday(key);
    if (h && h.isOff) {
      const dow = new Date(...Object.values(parseKey(key))).getDay();
      return { key, inDays: i, holiday: h, longWeekend: dow === 1 || dow === 5 };
    }
  }
  return null;
}

export function getExpiryItems(calendar) {
  const items = [];
  forEachStoredEvent(calendar, (ev, srcKey) => {
    if (ev.expiryDate) items.push({ id: ev.id, title: ev.title, renewalDate: srcKey, expiryDate: ev.expiryDate });
  });
  return items.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

export function getExpiryStatus(expiryDate, todayKey) {
  if (expiryDate < todayKey) return { id: 'expired', label: 'Expired', className: 'status-red' };
  if (expiryDate <= addMonthsClamped(todayKey, 1)) return { id: 'soon', label: 'About to expire', className: 'status-orange' };
  return { id: 'okay', label: 'Renewed', className: 'status-green' };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const REMINDER_MS = { '15m': 15 * 60e3, '1h': 3600e3, '1d': 86400e3, '1w': 7 * 86400e3 };

/**
 * Reminders that are due: reminder time <= now < event start.
 * `toEpoch(key, 'HH:MM')` converts a local date/time to epoch ms, so the
 * caller decides the timezone (browser local time vs Africa/Johannesburg).
 * Events without a time are treated as starting at 09:00.
 */
export function dueReminders(calendar, nowMs, toEpoch, bubweb = []) {
  const due = [];
  // Look ahead 8 days so "1 week before" reminders are covered.
  const today = toKeyFromEpoch(nowMs, toEpoch);
  for (let i = 0; i <= 8; i++) {
    const key = addDaysToKey(today, i);
    computeDay(calendar, key, bubweb).events.forEach(ev => {
      if (!ev.reminder || !REMINDER_MS[ev.reminder]) return;
      const start = toEpoch(key, ev.allDay || !ev.time ? '09:00' : ev.time);
      const fireAt = start - REMINDER_MS[ev.reminder];
      if (fireAt <= nowMs && nowMs < start) {
        due.push({ id: `rem:${ev.id}:${key}:${ev.reminder}`, ev, key, start });
      }
    });
  }
  return due;
}

// Find today's key for a given toEpoch() mapping (binary-free: walk from UTC date).
function toKeyFromEpoch(nowMs, toEpoch) {
  const d = new Date(nowMs);
  let key = dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (toEpoch(key, '00:00') > nowMs) key = addDaysToKey(key, -1);
  else if (toEpoch(addDaysToKey(key, 1), '00:00') <= nowMs) key = addDaysToKey(key, 1);
  return key;
}

// ---------------------------------------------------------------------------
// Birthday wishes
// ---------------------------------------------------------------------------

const BDAY_OPENERS = [
  'Happy Birthday [Name]! 🎉',
  'Wishing you the happiest of birthdays, [Name]! 🎂',
  'Happy, happy birthday [Name]! ✨',
  'Have a wonderful birthday, [Name]! 🥳',
  'Warmest birthday wishes to you, [Name]! 🎈'
];
const BDAY_BODIES = [
  'I hope you have an incredibly special day filled with love and laughter.',
  'May your day be filled with happiness, good food, and great company.',
  'Hope your year ahead is bright, blessed, and full of exciting adventures.',
  'Wishing you a relaxing day and a year full of wonderful surprises.',
  'I hope today brings you as much joy as you give to everyone around you.'
];
const BDAY_CLOSERS = [
  'Enjoy every minute of it! 🥂',
  'Have the absolute best celebration! 🎁',
  'Sending you huge love and big hugs today! 💛',
  'Cheers to another fantastic trip around the sun! ☀️'
];

export function birthdayName(rawTitle) {
  return (rawTitle || '')
    .replace(/🎂|🎉|🎈/gu, '')
    .replace(/[’']s?\s*birthday/gi, '')
    .replace(/birthday[:\s-]*/gi, '')
    .trim() || 'friend';
}

export function generateBirthdayWish(rawTitle) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(BDAY_OPENERS).replace('[Name]', birthdayName(rawTitle))} ${pick(BDAY_BODIES)} ${pick(BDAY_CLOSERS)}`;
}
