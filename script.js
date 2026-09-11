import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
  getDatabase, 
  ref as dbRef, 
  onValue 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// Telegram Alert Configuration
const TELEGRAM_CONFIG = {
  botToken: window.__ENV__?.TELEGRAM_BOT_TOKEN || '',
  chatId: window.__ENV__?.TELEGRAM_CHAT_ID || ''
};

async function sendTelegramAlert(message) {
  const hasPlaceholder = value => !value || value.startsWith('YOUR_');
  if (hasPlaceholder(TELEGRAM_CONFIG.botToken) || hasPlaceholder(TELEGRAM_CONFIG.chatId)) return false;

  const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CONFIG.chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    const data = await response.json();
    return data.ok;
  } catch (err) {
    console.error('Telegram notification failed:', err);
    return false;
  }
}

// 1. Primary Nocturna Firebase (Auth + Firestore)
const nocturnaConfig = {
  apiKey: "AIzaSyAjzmlmjB73S60nUw0vPrEJXq-y3-xlrG0",
  authDomain: "nocturna-f83da.firebaseapp.com",
  projectId: "nocturna-f83da",
  storageBucket: "nocturna-f83da.firebasestorage.app",
  messagingSenderId: "768241227819",
  appId: "1:768241227819:web:69031db73951bb6dbc326e",
  measurementId: "G-RWFF29S6BE"
};

const app = initializeApp(nocturnaConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. Secondary Bubweb Firebase Bridge
const bubwebConfig = {
  apiKey: "AIzaSyBxkrNYSVqVf2_7wyHl6sA7i6MQ_OY69cg",
  authDomain: "guide-to-the-outside.firebaseapp.com",
  databaseURL: "https://guide-to-the-outside-default-rtdb.firebaseio.com",
  projectId: "guide-to-the-outside",
  storageBucket: "guide-to-the-outside.firebasestorage.app",
  messagingSenderId: "242577301245",
  appId: "1:242577301245:web:17387fc6b1df7fa456e894"
};

let bubwebActivities = [];

try {
  const bubwebApp = initializeApp(bubwebConfig, "bubwebBridge");
  const bubwebDb = getDatabase(bubwebApp);
  const activitiesRef = dbRef(bubwebDb, 'activities');
  onValue(activitiesRef, (snapshot) => {
    const data = snapshot.val();
    bubwebActivities = data ? (Array.isArray(data) ? data : Object.values(data)) : [];
    repaintAllVisibleCells();
  });
} catch (e) {
  console.warn("Bubweb bridge init warning:", e);
}

// --- Future-Proofed Astronomical Calculations ---
function calculateEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function getNthWeekdayOfMonth(year, month, weekday, n) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const testDate = new Date(year, month, d);
    if (testDate.getMonth() !== month) break;
    if (testDate.getDay() === weekday) {
      count++;
      if (count === n) return d;
    }
  }
  return 1;
}

// Fixed: Added missing 1st Wednesday of the month function
function getFirstWednesdayOfMonth(year, month) {
  for (let d = 1; d <= 7; d++) {
    const testDate = new Date(year, month, d);
    if (testDate.getDay() === 3) { // 3 = Wednesday
      return d;
    }
  }
  return 1;
}

// Hindu Lunisolar Panchang Calendar (Lookup + Metonic Fallback)
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
  if (HINDU_FESTIVALS_TABLE[year]) {
    return HINDU_FESTIVALS_TABLE[year];
  }
  const baseYear = 2024 + ((year - 2024) % 19);
  return HINDU_FESTIVALS_TABLE[baseYear] || HINDU_FESTIVALS_TABLE[2026];
}

function getSouthAfricanHolidaysForYear(year) {
  const holidays = {};

  function addHoliday(m, d, name, color, isOff = true, note = '', isHindu = false) {
    const dStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, m - 1, d);
    holidays[dStr] = { name, color, isOff, note, dayColor: color, isHindu };

    if (isOff && dateObj.getDay() === 0) {
      const monDate = new Date(year, m - 1, d + 1);
      const monKey = `${monDate.getFullYear()}-${String(monDate.getMonth() + 1).padStart(2, '0')}-${String(monDate.getDate()).padStart(2, '0')}`;
      holidays[monKey] = {
        name: `${name} (Observed)`,
        color,
        isOff: true,
        note: 'Public Holiday (Sunday Roll-over)',
        dayColor: color,
        isHindu: false
      };
    }
  }

  // 1. Statutory National Public Holidays
  addHoliday(1, 1, "New Year's Day", "#ef4444", true);
  addHoliday(3, 21, "Human Rights Day", "#e11d48", true);
  addHoliday(4, 27, "Freedom Day", "#f59e0b", true);
  addHoliday(5, 1, "Workers' Day", "#e11d48", true);
  addHoliday(6, 16, "Youth Day", "#0284c7", true);
  addHoliday(8, 9, "National Women's Day", "#ec4899", true);
  addHoliday(9, 24, "Heritage Day", "#10b981", true);
  addHoliday(12, 16, "Day of Reconciliation", "#10b981", true);
  addHoliday(12, 25, "Christmas Day", "#ef4444", true);
  addHoliday(12, 26, "Day of Goodwill", "#ef4444", true);

  // 2. Computed Easter Holidays
  const easterSunday = calculateEasterSunday(year);
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(easterSunday.getDate() - 2);
  const familyDay = new Date(easterSunday);
  familyDay.setDate(easterSunday.getDate() + 1);

  addHoliday(goodFriday.getMonth() + 1, goodFriday.getDate(), "Good Friday", "#6366f1", true);
  addHoliday(familyDay.getMonth() + 1, familyDay.getDate(), "Family Day", "#6366f1", true);

  // 3. Hindu Sacred Festivals
  const hinduData = getHinduFestivalsForYear(year);

  if (hinduData.diwali) {
    const [dm, dd] = hinduData.diwali.split('-').map(Number);
    addHoliday(dm, dd, "Diwali (Deepavali)", "#f97316", false, "Festival of Lights", true);
  }
  if (hinduData.shivaratri) {
    const [sm, sd] = hinduData.shivaratri.split('-').map(Number);
    addHoliday(sm, sd, "Maha Shivaratri", "#8b5cf6", false, "Great Night of Shiva", true);
  }
  if (hinduData.janmashtami) {
    const [jm, jd] = hinduData.janmashtami.split('-').map(Number);
    addHoliday(jm, jd, "Krishna Janmashtami", "#06b6d4", false, "Birth of Lord Krishna", true);
  }
  if (hinduData.kavady) {
    const [km, kd] = hinduData.kavady.split('-').map(Number);
    addHoliday(km, kd, "Thaipoosam Kavady", "#eab308", false, "Murugan Devotion & Penance", true);
  }

  // 4. Cultural Observances
  const mothersDay = getNthWeekdayOfMonth(year, 4, 0, 2);
  const fathersDay = getNthWeekdayOfMonth(year, 5, 0, 3);
  addHoliday(5, mothersDay, "Mother's Day", "#a855f7", false, "Special Sunday");
  addHoliday(6, fathersDay, "Father's Day", "#3b82f6", false, "Special Sunday");
  addHoliday(12, 31, "New Year's Eve", "#facc15", false, "Celebration");

  // 5. Fuel Price Change Day (1st Wednesday of every month)
  for (let m = 1; m <= 12; m++) {
    const firstWedDay = getFirstWednesdayOfMonth(year, m - 1);
    const dStr = `${year}-${String(m).padStart(2, '0')}-${String(firstWedDay).padStart(2, '0')}`;
    
    if (!holidays[dStr]) {
      holidays[dStr] = {
        name: "Fuel Price Adjustment",
        color: "#f59e0b",
        isOff: false,
        note: "Official DMPR / CEF Fuel Price Adjustment Day",
        dayColor: null,
        isFuel: true
      };
    }
  } 

  return holidays;
}

(function () {
  const COLORS = [
    { id: 'violet', hex: '#8b5cf6' },
    { id: 'blue', hex: '#4f8ef7' },
    { id: 'pink', hex: '#f472b6' },
    { id: 'teal', hex: '#2dd4bf' },
    { id: 'amber', hex: '#fbbf24' },
    { id: 'red', hex: '#f87171' },
    { id: 'lime', hex: '#a3e635' },
    { id: 'sky', hex: '#38bdf8' },
    { id: 'mint', hex: '#34d399' },
    { id: 'rose', hex: '#fb7185' },
    { id: 'orange', hex: '#fb923c' },
    { id: 'cyan', hex: '#22d3ee' },
    { id: 'purple-2', hex: '#a78bfa' },
    { id: 'indigo', hex: '#6366f1' },
    { id: 'gold', hex: '#facc15' },
    { id: 'peach', hex: '#fdba74' },
    { id: 'lavender', hex: '#c084fc' },
    { id: 'emerald', hex: '#10b981' },
    { id: 'slate', hex: '#94a3b8' },
    { id: 'brown', hex: '#a16207' },
    { id: 'plum', hex: '#c026d3' },
    { id: 'coral', hex: '#ff7f7f' },
    { id: 'turquoise', hex: '#14b8a6' },
    { id: 'silver', hex: '#e2e8f0' }
  ];

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const listEl = document.getElementById('calendar-list');
  const sentinel = document.getElementById('sentinel');
  const loadingRow = document.querySelector('.loading-row');
  const searchInput = document.getElementById('search-input');
  const todayButton = document.getElementById('today-button');
  
  let globalCalendar = {}; 
  let cellRefs = {};
  let renderedMonths = new Set();
  let selectedColor = 'violet';
  let editingId = null;
  let editingOriginalDate = null;
  let activeDateKey = null;
  let monthOffset = 0;
  let isLoading = false;
  let triggeredReminders = new Set();
  let swRegistration = null;
  let holidayCacheByYear = {};

  function pad(n) { return String(n).padStart(2, '0'); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function dateKey(y, m, day) { return y + '-' + pad(m + 1) + '-' + pad(day); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('nocturna:session') || 'null'); } catch (e) { return null; }
  }

  function deriveNocturnaEmail(username) {
    return `${(username || '').trim().toLowerCase().replace(/\s+/g, '')}@nocturna.com`;
  }

  function currentUserKey() {
    if (auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;
    const session = getSession();
    return session && session.username ? session.username.toLowerCase() : 'guest';
  }

  async function fetchEntireCalendarFromCloud() {
    if (!auth.currentUser) {
      try {
        const raw = localStorage.getItem(`nocturna:${currentUserKey()}:full_calendar`);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    }

    try {
      const ref = doc(db, 'users', auth.currentUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().calendar) {
        return snap.data().calendar;
      }
    } catch (e) {
      console.warn('Firestore load failed:', e);
    }
    return {};
  }

  async function syncCalendarToCloud() {
    localStorage.setItem(`nocturna:${currentUserKey()}:full_calendar`, JSON.stringify(globalCalendar));

    if (auth.currentUser) {
      try {
        const ref = doc(db, 'users', auth.currentUser.uid);
        const username = getSession()?.username || auth.currentUser.email?.split('@')[0] || 'Nocturna user';
        await setDoc(ref, {
          username,
          email: auth.currentUser.email || deriveNocturnaEmail(username),
          calendar: globalCalendar
        }, { merge: true });
      } catch (e) {
        console.warn('Sync failed', e);
      }
    }
  }

  function getSAHoliday(y, m, day) {
    if (!holidayCacheByYear[y]) {
      holidayCacheByYear[y] = getSouthAfricanHolidaysForYear(y);
    }
    const dKey = dateKey(y, m, day);
    return holidayCacheByYear[y][dKey] || null;
  }

  function getDayData(y, m, day) {
    const dKey = dateKey(y, m, day);
    const mKey = dKey.slice(0, 7);
    const dNum = pad(day);

    const baseEntry = (globalCalendar[mKey] && globalCalendar[mKey][dNum]) 
      ? JSON.parse(JSON.stringify(globalCalendar[mKey][dNum])) 
      : { events: [], quests: [], complete: false };
    const directEvents = baseEntry.events || [];
    const recurringEvents = [];

    // Recurring Events
    Object.entries(globalCalendar).forEach(([srcMKey, monthData]) => {
      const [srcY, srcM] = srcMKey.split('-').map(Number);

      Object.entries(monthData).forEach(([srcDayNum, srcDayEntry]) => {
        if (!srcDayEntry.events) return;

        srcDayEntry.events.forEach(ev => {
          if (!ev.repeat || ev.repeat === 'none') return;
          const origDay = Number(srcDayNum);
          let isMatch = false;

          if (ev.repeat === 'yearly') {
            if (srcM === (m + 1) && origDay === day) isMatch = true;
          } else if (ev.repeat === 'monthly') {
            if (origDay === day) {
              const srcDate = new Date(srcY, srcM - 1, origDay);
              const targetDate = new Date(y, m, day);
              if (targetDate >= srcDate) isMatch = true;
            }
          } else if (ev.repeat === 'daily') {
            const srcDate = new Date(srcY, srcM - 1, origDay);
            const targetDate = new Date(y, m, day);
            if (targetDate >= srcDate) isMatch = true;
          } else if (ev.repeat === 'weekly') {
            const srcDate = new Date(srcY, srcM - 1, origDay);
            const targetDate = new Date(y, m, day);
            if (targetDate >= srcDate && targetDate.getDay() === srcDate.getDay()) isMatch = true;
          }

          if (isMatch) {
            if (srcMKey === mKey && origDay === day) return;
            recurringEvents.push({
              ...ev,
              isRecurringInstance: true,
              originDate: `${srcMKey}-${pad(origDay)}`
            });
          }
        });
      });
    });

    // Realtime Bubweb Activities
    const bubwebEvents = [];
    bubwebActivities.forEach(act => {
      if (act.date === dKey) {
        bubwebEvents.push({
          id: `bub-${act.id}`,
          title: `🎈 ${act.name}`,
          time: act.time || '',
          allDay: !act.time,
          location: 'BubAdventure',
          color: 'pink',
          isBubwebSynced: true,
          completed: !!act.completed
        });
      }
    });

    // Dynamic South African Public Holiday & Hindu Observance Injection
    const saHoliday = getSAHoliday(y, m, day);
    const holidayEvents = [];
    if (saHoliday) {
      const icon = saHoliday.isOff ? '🇿🇦 ' : (saHoliday.isHindu ? '🪔 ' : '✨ ');
      holidayEvents.push({
        id: `sa-holiday-${dKey}`,
        title: `${icon}${saHoliday.name}`,
        allDay: true,
        location: saHoliday.note || (saHoliday.isOff ? 'Public Holiday (Paid Off)' : 'Observance'),
        color: saHoliday.color,
        isHoliday: true,
        isOff: saHoliday.isOff,
        isHindu: !!saHoliday.isHindu
      });
    }

    const effectiveDayColor = baseEntry.dayColor || (saHoliday ? saHoliday.dayColor : null);

    return {
      ...baseEntry,
      dayColor: effectiveDayColor,
      events: [...holidayEvents, ...directEvents, ...recurringEvents, ...bubwebEvents],
      quests: baseEntry.quests || []
    };
  }

  function isToday(y, m, day) {
    const t = new Date();
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === day;
  }

  function isDayPast(y, m, day) {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(y, m, day);
    return target < todayMidnight;
  }

  function withAlpha(hex, alpha) {
    if (!hex) return 'transparent';
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
    const int = parseInt(full, 16);
    if (isNaN(int)) return 'transparent';
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getEventMatchText(event = {}) {
    return `${event.title || ''} ${event.location || ''} ${(event.color || '')}`.toLowerCase();
  }

  function getSearchQuery() {
    return (searchInput?.value || '').trim().toLowerCase();
  }

  function monthlyCompletionTotal(monthKeyValue) {
    const monthData = globalCalendar[monthKeyValue] || {};
    const days = Object.keys(monthData).filter(key => key !== 'meta');
    let doneCount = 0;
    days.forEach(dayKey => {
      const entry = monthData[dayKey] || {};
      if (entry.complete) doneCount += 1;
    });
    return doneCount;
  }

  function repaintAllVisibleCells() {
    Object.keys(cellRefs).forEach(dKey => {
      const [y, m, d] = dKey.split('-').map(Number);
      const computedData = getDayData(y, m - 1, d);
      paintCell(dKey, computedData);
    });
  }

  async function renderMonth(baseDate) {
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth();
    const key = monthKey(baseDate);

    const section = document.createElement('div');
    section.className = 'month-section';

    const sticky = document.createElement('div');
    sticky.className = 'month-sticky';
    const headerRow = document.createElement('div');
    headerRow.className = 'month-header-row';
    const h2 = document.createElement('h2');
    h2.textContent = baseDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    headerRow.appendChild(h2);

    const streak = document.createElement('span');
    streak.className = 'month-streak';
    const completion = monthlyCompletionTotal(key);
    streak.textContent = `${completion} done`;
    headerRow.appendChild(streak);

    sticky.appendChild(headerRow);
    section.appendChild(sticky);

    const weekdays = document.createElement('div');
    weekdays.className = 'weekdays';
    WEEKDAYS.forEach(w => {
      const s = document.createElement('span');
      s.textContent = w;
      weekdays.appendChild(s);
    });
    section.appendChild(weekdays);

    const grid = document.createElement('div');
    grid.className = 'grid';

    const firstWeekday = new Date(y, m, 1).getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const empty = document.createElement('div');
      empty.className = 'cell empty';
      grid.appendChild(empty);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dKey = dateKey(y, m, day);
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (isToday(y, m, day)) cell.classList.add('today');
      cellRefs[dKey] = cell;
      cell.addEventListener('click', () => openSheet(y, m, day));
      grid.appendChild(cell);

      const dayData = getDayData(y, m, day);
      paintCell(dKey, dayData);
    }

    section.appendChild(grid);
    listEl.appendChild(section);
  }

  function paintCell(dKey, entry) {
    const cell = cellRefs[dKey];
    if (!cell) return;

    const [ky, km, kd] = dKey.split('-').map(Number);
    const day = kd;
    const dateObj = new Date(ky, km - 1, kd);
    const dayOfWeek = dateObj.getDay();

    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    cell.classList.toggle('weekend', isWeekend);

    const over = !!(entry && entry.complete) || isDayPast(ky, km - 1, kd);
    cell.classList.toggle('done', over);
    cell.innerHTML = '';

    const query = getSearchQuery();
    const events = (entry && entry.events) || [];
    const visibleEvents = query ? events.filter(ev => getEventMatchText(ev).includes(query)) : events;
    const shouldHide = !!query && visibleEvents.length === 0;
    cell.style.display = shouldHide ? 'none' : '';

    const hasPublicOff = events.some(ev => ev.isOff);
    const isLongWeekend = hasPublicOff && (dayOfWeek === 1 || dayOfWeek === 5);
    cell.classList.toggle('long-weekend-part', isLongWeekend);

    const dayColor = entry && entry.dayColor ? entry.dayColor : null;
    cell.style.background = dayColor ? withAlpha(dayColor, 0.22) : (isWeekend ? 'rgba(37, 29, 56, 0.7)' : 'var(--surface)');
    cell.style.borderColor = dayColor || (isWeekend ? 'rgba(167, 139, 250, 0.28)' : 'var(--border)');
    cell.style.boxShadow = dayColor ? 'inset 0 0 0 1px ' + withAlpha(dayColor, 0.35) : (isLongWeekend ? '0 0 0 1.5px rgba(245, 158, 11, 0.5) inset' : 'none');

    const headRow = document.createElement('div');
    headRow.style.display = 'flex';
    headRow.style.justifyContent = 'space-between';
    headRow.style.alignItems = 'center';

    const num = document.createElement('div');
    num.className = 'daynum';
    num.textContent = day;
    headRow.appendChild(num);

    const hasHinduFest = events.some(ev => ev.isHindu);
    const fuelEvent = events.find(ev => ev.isFuel);

    if (hasPublicOff) {
      const offTag = document.createElement('span');
      offTag.style.fontSize = '9px';
      offTag.style.fontWeight = '800';
      offTag.style.color = '#ef4444';
      offTag.style.background = 'rgba(239, 68, 68, 0.18)';
      offTag.style.padding = '1px 4px';
      offTag.style.borderRadius = '4px';
      offTag.textContent = isLongWeekend ? '🏖️ LONG WKND' : 'OFF';
      headRow.appendChild(offTag);
    } else if (hasHinduFest) {
      const festTag = document.createElement('span');
      festTag.style.fontSize = '9px';
      festTag.style.fontWeight = '800';
      festTag.style.color = '#f97316';
      festTag.style.background = 'rgba(249, 115, 22, 0.18)';
      festTag.style.padding = '1px 4px';
      festTag.style.borderRadius = '4px';
      festTag.textContent = '🪔';
      headRow.appendChild(festTag);
    } else if (fuelEvent) {
      const fuelTag = document.createElement('span');
      fuelTag.style.fontSize = '9px';
      fuelTag.style.fontWeight = '800';
      fuelTag.style.color = '#f59e0b';
      fuelTag.style.background = 'rgba(245, 158, 11, 0.18)';
      fuelTag.style.padding = '1px 4px';
      fuelTag.style.borderRadius = '4px';
      fuelTag.textContent = '⛽ FUEL';
      headRow.appendChild(fuelTag);
    }

    cell.appendChild(headRow);

    const chips = document.createElement('div');
    chips.className = 'chips';
    visibleEvents.slice(0, 3).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      
      let hexColor = ev.color;
      if (!hexColor.startsWith('#')) {
        const cObj = COLORS.find(c => c.id === ev.color);
        hexColor = cObj ? cObj.hex : '#8b5cf6';
      }

      chip.style.background = hexColor;
      const meta = ev.allDay ? (ev.isHoliday ? '' : 'All day') : (ev.time ? ev.time : '');
      const repeatLabel = ev.repeat === 'yearly' ? ' 🎂' : (ev.repeat && ev.repeat !== 'none' ? ` · ${ev.repeat}` : '');
      chip.textContent = `${meta ? meta + ' ' : ''}${ev.title}${repeatLabel}`;
      chips.appendChild(chip);
    });

    if (visibleEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'chip-more';
      more.textContent = '+' + (visibleEvents.length - 3) + ' more';
      chips.appendChild(more);
    }

    cell.appendChild(chips);
  }

  async function appendNextMonth() {
    if (isLoading) return;
    isLoading = true;

    if (loadingRow) loadingRow.style.display = 'block';

    try {
      const targetDate = new Date();
      targetDate.setHours(0, 0, 0, 0);
      targetDate.setDate(1);
      targetDate.setMonth(targetDate.getMonth() + monthOffset);

      const mKey = monthKey(targetDate);
      if (!renderedMonths.has(mKey)) {
        renderedMonths.add(mKey);
        await renderMonth(targetDate);
      }
      monthOffset++;
    } catch (e) {
      console.error('Error rendering month:', e);
    } finally {
      if (loadingRow) loadingRow.style.display = 'none';
      isLoading = false;
    }
  }

  async function reloadEntireCalendar() {
    listEl.innerHTML = '';
    cellRefs = {};
    renderedMonths.clear();
    monthOffset = 0;

    globalCalendar = await fetchEntireCalendarFromCloud();

    for (let i = 0; i < 6; i++) {
      await appendNextMonth();
    }
  }

  if (typeof IntersectionObserver !== 'undefined' && sentinel) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isLoading) appendNextMonth();
      });
    }, { rootMargin: '400px' });
    observer.observe(sentinel);
  }

  // Drawer / Sheet Elements
  const backdrop = document.getElementById('backdrop');
  const sheet = document.getElementById('sheet');
  const sheetDate = document.getElementById('sheet-date');
  const happyCounter = document.getElementById('happy-counter');
  
  const sheetTabs = document.querySelectorAll('.sheet-tab');
  const sheetViews = document.querySelectorAll('.sheet-view');

  sheetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sheetTabs.forEach(t => t.classList.remove('active'));
      sheetViews.forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`view-${tab.dataset.tab}`).classList.add('active');
    });
  });

  const questList = document.getElementById('quest-list');
  const emptyQuestHint = document.getElementById('empty-quest-hint');
  const addQuestForm = document.getElementById('add-quest-form');
  const questInput = document.getElementById('quest-input');
  const pasteQuestBtn = document.getElementById('paste-quest-btn');

  const eventList = document.getElementById('event-list');
  const emptyHint = document.getElementById('empty-hint');
  const form = document.getElementById('event-form');
  const titleInput = document.getElementById('f-title');
  const timeInput = document.getElementById('f-time');
  const locInput = document.getElementById('f-location');
  const allDayInput = document.getElementById('f-all-day');
  const repeatInput = document.getElementById('f-repeat');
  const reminderInput = document.getElementById('f-reminder');
  const colorRow = document.getElementById('color-row');
  const dayColorPicker = document.getElementById('f-day-color');
  const saveBtn = document.getElementById('save-btn');
  const cancelEditBtn = document.getElementById('cancel-edit');
  const formErr = document.getElementById('form-err');
  const doneSwitch = document.getElementById('done-switch');
  const doneLabel = document.getElementById('done-label');

  const rangeStartInput = document.getElementById('range-start');
  const rangeEndInput = document.getElementById('range-end');
  const rangeColorInput = document.getElementById('range-color');
  const rangeApplyBtn = document.getElementById('range-apply-btn');
  const rangeClearBtn = document.getElementById('range-clear-btn');

  COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c.hex;
    sw.dataset.color = c.id;
    sw.addEventListener('click', () => {
      selectedColor = c.id;
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    colorRow.appendChild(sw);
  });

  function setSelectedColor(id) {
    selectedColor = id;
    document.querySelectorAll('.swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === id);
    });
  }

  function triggerHappySparkBump() {
    if (!happyCounter) return;
    happyCounter.classList.remove('bump');
    void happyCounter.offsetWidth;
    happyCounter.classList.add('bump');
  }

  function renderQuests() {
    if (!questList || !activeDateKey) return;
    const monthKey = activeDateKey.slice(0, 7);
    const dayNumber = activeDateKey.slice(-2);

    const dayData = (globalCalendar[monthKey] && globalCalendar[monthKey][dayNumber]) || {};
    const quests = dayData.quests || [];

    const completedCount = quests.filter(q => q.done).length;
    if (happyCounter) {
      happyCounter.textContent = `⚡ ${completedCount} Spark${completedCount === 1 ? '' : 's'}`;
    }

    questList.innerHTML = '';
    if (emptyQuestHint) emptyQuestHint.style.display = quests.length ? 'none' : 'block';

    quests.forEach(quest => {
      const item = document.createElement('div');
      item.className = `quest-item ${quest.done ? 'completed' : ''}`;

      const checkWrap = document.createElement('label');
      checkWrap.className = 'quest-check-wrap';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!quest.done;
      checkbox.addEventListener('change', async () => {
        quest.done = checkbox.checked;
        if (quest.done) triggerHappySparkBump();
        await syncCalendarToCloud();
        renderQuests();
      });

      const text = document.createElement('span');
      text.className = 'quest-text';
      text.textContent = quest.text;

      checkWrap.appendChild(checkbox);
      checkWrap.appendChild(text);
      item.appendChild(checkWrap);

      const delBtn = document.createElement('button');
      delBtn.className = 'quest-del-btn';
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', async () => {
        dayData.quests = dayData.quests.filter(q => q.id !== quest.id);
        await syncCalendarToCloud();
        renderQuests();
      });

      item.appendChild(delBtn);
      questList.appendChild(item);
    });
  }

  if (addQuestForm) {
    addQuestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = questInput.value.trim();
      if (!text || !activeDateKey) return;

      const monthKey = activeDateKey.slice(0, 7);
      const dayNumber = activeDateKey.slice(-2);

      if (!globalCalendar[monthKey]) globalCalendar[monthKey] = {};
      if (!globalCalendar[monthKey][dayNumber]) globalCalendar[monthKey][dayNumber] = { events: [], quests: [], complete: false };

      const dayData = globalCalendar[monthKey][dayNumber];
      if (!dayData.quests) dayData.quests = [];

      dayData.quests.push({
        id: 'q_' + Date.now() + Math.random().toString(36).slice(2, 6),
        text,
        done: false
      });

      await syncCalendarToCloud();
      questInput.value = '';
      renderQuests();
    });
  }

  if (pasteQuestBtn) {
    pasteQuestBtn.addEventListener('click', async () => {
      try {
        const clipText = await navigator.clipboard.readText();
        if (!clipText || !activeDateKey) return;

        const lines = clipText
          .split('\n')
          .map(l => l.replace(/^[-*•\d.)\]\s]+/, '').trim())
          .filter(l => l.length > 0);

        if (!lines.length) return;

        const monthKey = activeDateKey.slice(0, 7);
        const dayNumber = activeDateKey.slice(-2);

        if (!globalCalendar[monthKey]) globalCalendar[monthKey] = {};
        if (!globalCalendar[monthKey][dayNumber]) globalCalendar[monthKey][dayNumber] = { events: [], quests: [], complete: false };

        const dayData = globalCalendar[monthKey][dayNumber];
        if (!dayData.quests) dayData.quests = [];

        lines.forEach(lineText => {
          dayData.quests.push({
            id: 'q_' + Date.now() + Math.random().toString(36).slice(2, 6),
            text: lineText,
            done: false
          });
        });

        await syncCalendarToCloud();
        renderQuests();
      } catch (e) {
        const manual = prompt("Paste task lines below:");
        if (manual && activeDateKey) {
          const lines = manual.split('\n').map(l => l.trim()).filter(Boolean);
          const monthKey = activeDateKey.slice(0, 7);
          const dayNumber = activeDateKey.slice(-2);
          const dayData = globalCalendar[monthKey][dayNumber];
          if (!dayData.quests) dayData.quests = [];

          lines.forEach(lineText => {
            dayData.quests.push({
              id: 'q_' + Date.now() + Math.random().toString(36).slice(2, 6),
              text: lineText,
              done: false
            });
          });
          await syncCalendarToCloud();
          renderQuests();
        }
      }
    });
  }

  async function openSheet(y, m, day) {
    activeDateKey = dateKey(y, m, day);
    resetForm();
    const dObj = new Date(y, m, day);
    sheetDate.textContent = dObj.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    sheetTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'quests'));
    sheetViews.forEach(v => v.classList.toggle('active', v.id === 'view-quests'));

    if (rangeStartInput && rangeEndInput) {
      rangeStartInput.value = activeDateKey;
      const endDateObj = new Date(y, m, day + 6);
      rangeEndInput.value = dateKey(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
    }

    renderSheetContents();
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }

  function closeSheet() {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    sheet.style.transform = '';
    resetForm();
  }

  backdrop.addEventListener('click', closeSheet);
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sheet.classList.contains('open')) closeSheet();
  });

  function renderSheetContents() {
    const [sy, sm, sd] = activeDateKey.split('-').map(Number);
    const dayData = getDayData(sy, sm - 1, sd);

    const pastAuto = isDayPast(sy, sm - 1, sd);
    const isOver = !!dayData.complete || pastAuto;
    doneSwitch.classList.toggle('on', isOver);
    doneLabel.textContent = pastAuto ? 'This day has passed' : (dayData.complete ? 'Day complete' : 'Mark day complete');
    dayColorPicker.value = dayData.dayColor || '#8b5cf6';

    renderQuests();

    eventList.innerHTML = '';
    const events = dayData.events || [];
    emptyHint.style.display = events.length ? 'none' : 'block';

    events.forEach(ev => {
      const row = document.createElement('div');
      row.className = 'event-row';
      
      let hexColor = ev.color;
      if (!hexColor.startsWith('#')) {
        const cObj = COLORS.find(c => c.id === ev.color);
        hexColor = cObj ? cObj.hex : '#8b5cf6';
      }

      const dot = document.createElement('div');
      dot.className = 'event-dot';
      dot.style.background = hexColor;
      row.appendChild(dot);

      const info = document.createElement('div');
      info.className = 'event-info';
      const title = document.createElement('div');
      title.className = 'event-title';
      title.textContent = ev.title;
      info.appendChild(title);

      const metaParts = [];
      if (ev.time) metaParts.push(formatTime(ev.time));
      if (ev.location) metaParts.push(ev.location);
      if (metaParts.length || ev.allDay || ev.repeat || ev.reminder) {
        const meta = document.createElement('div');
        meta.className = 'event-meta';
        const detailParts = [...metaParts];
        if (ev.allDay && !ev.isHoliday) detailParts.unshift('All day');
        if (ev.repeat === 'yearly') detailParts.push('🎂 Yearly Birthday');
        else if (ev.repeat && ev.repeat !== 'none') detailParts.push(`Repeats ${ev.repeat}`);
        if (ev.reminder && ev.reminder !== 'none') detailParts.push(`Alert ${ev.reminder}`);
        meta.textContent = detailParts.join(' · ');
        info.appendChild(meta);
      }

      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'event-actions';

      if (ev.isHoliday) {
        const badge = document.createElement('span');
        badge.style.fontSize = '11px';
        badge.style.color = ev.color;
        badge.style.fontWeight = '800';
        badge.textContent = ev.isOff ? 'OFF' : (ev.isHindu ? 'Festival' : 'Observance');
        actions.appendChild(badge);
      } else if (ev.isBubwebSynced) {
        const badge = document.createElement('span');
        badge.style.fontSize = '11px';
        badge.style.color = 'var(--accent-purple)';
        badge.style.fontWeight = '700';
        badge.textContent = 'Bubweb';
        actions.appendChild(badge);
      } else {
        const editBtn = document.createElement('div');
        editBtn.className = 'icon-btn';
        editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        editBtn.addEventListener('click', () => {
          sheetTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'events'));
          sheetViews.forEach(v => v.classList.toggle('active', v.id === 'view-events'));
          startEdit(ev);
        });
        actions.appendChild(editBtn);

        const delBtn = document.createElement('div');
        delBtn.className = 'icon-btn';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
        delBtn.addEventListener('click', () => deleteEvent(ev));
        actions.appendChild(delBtn);
      }

      row.appendChild(actions);
      eventList.appendChild(row);
    });
  }

  function formatTime(t) {
    const [h, mm] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return h12 + ':' + pad(mm) + ' ' + period;
  }

  function resetForm() {
    editingId = null;
    editingOriginalDate = null;
    titleInput.value = '';
    timeInput.value = '';
    locInput.value = '';
    allDayInput.checked = false;
    repeatInput.value = 'none';
    reminderInput.value = 'none';
    formErr.style.display = 'none';
    setSelectedColor('violet');
    dayColorPicker.value = '#8b5cf6';
    saveBtn.textContent = 'Add Event';
    cancelEditBtn.style.display = 'none';
  }

  function startEdit(ev) {
    editingId = ev.id;
    editingOriginalDate = ev.originDate || activeDateKey;
    titleInput.value = ev.title;
    timeInput.value = ev.time || '';
    locInput.value = ev.location || '';
    allDayInput.checked = !!ev.allDay;
    repeatInput.value = ev.repeat || 'none';
    reminderInput.value = ev.reminder || 'none';
    setSelectedColor(ev.color || 'violet');
    saveBtn.textContent = 'Update Event';
    cancelEditBtn.style.display = 'block';
    titleInput.focus();
  }

  cancelEditBtn.addEventListener('click', resetForm);

  async function deleteEvent(ev) {
    const targetDate = ev.originDate || activeDateKey;
    const targetMonth = targetDate.slice(0, 7);
    const targetDay = targetDate.slice(-2);

    if (globalCalendar[targetMonth] && globalCalendar[targetMonth][targetDay]) {
      globalCalendar[targetMonth][targetDay].events = (globalCalendar[targetMonth][targetDay].events || []).filter(e => e.id !== ev.id);
      await syncCalendarToCloud();
      repaintAllVisibleCells();
      renderSheetContents();
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      formErr.style.display = 'block';
      titleInput.focus();
      return;
    }
    formErr.style.display = 'none';

    if (reminderInput.value !== 'none' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    const saveTargetDate = editingOriginalDate || activeDateKey;
    const monthKey = saveTargetDate.slice(0, 7);
    const dayNumber = saveTargetDate.slice(-2);

    if (!globalCalendar[monthKey]) globalCalendar[monthKey] = {};
    if (!globalCalendar[monthKey][dayNumber]) globalCalendar[monthKey][dayNumber] = { events: [], quests: [], complete: false };

    const entry = globalCalendar[monthKey][dayNumber];
    if (dayColorPicker.value) entry.dayColor = dayColorPicker.value;

    const normalizedRepeat = repeatInput.value || 'none';
    const allDay = !!allDayInput.checked;
    const reminder = reminderInput.value || 'none';

    if (editingId) {
      const idx = entry.events.findIndex(ev => ev.id === editingId);
      if (idx > -1) {
        entry.events[idx] = { 
          ...entry.events[idx], 
          title, 
          time: allDay ? '' : timeInput.value, 
          allDay, 
          repeat: normalizedRepeat, 
          reminder, 
          location: locInput.value.trim(), 
          color: selectedColor 
        };
      }
    } else {
      entry.events.push({
        id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
        title, 
        time: allDay ? '' : timeInput.value, 
        allDay, 
        repeat: normalizedRepeat, 
        reminder, 
        location: locInput.value.trim(), 
        color: selectedColor
      });
    }

    await syncCalendarToCloud();
    repaintAllVisibleCells();
    resetForm();
    renderSheetContents();
  });

  doneSwitch.addEventListener('click', async () => {
    const monthKey = activeDateKey.slice(0, 7);
    const dayNumber = activeDateKey.slice(-2);

    if (!globalCalendar[monthKey]) globalCalendar[monthKey] = {};
    if (!globalCalendar[monthKey][dayNumber]) globalCalendar[monthKey][dayNumber] = { events: [], quests: [], complete: false };

    const entry = globalCalendar[monthKey][dayNumber];
    entry.complete = !entry.complete;

    await syncCalendarToCloud();
    repaintAllVisibleCells();
    doneSwitch.classList.toggle('on', entry.complete);
    doneLabel.textContent = entry.complete ? 'Day complete' : 'Mark day complete';
  });

  async function applyDateRangeHighlight(colorToSet) {
    const startStr = rangeStartInput.value;
    const endStr = rangeEndInput.value;
    if (!startStr || !endStr) return;

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);

    const startDate = new Date(sy, sm - 1, sd);
    const endDate = new Date(ey, em - 1, ed);

    if (startDate > endDate) {
      alert('Start date must be before end date.');
      return;
    }

    const cur = new Date(startDate);
    while (cur <= endDate) {
      const y = cur.getFullYear();
      const m = cur.getMonth();
      const d = cur.getDate();
      const mKey = `${y}-${pad(m + 1)}`;
      const dNum = pad(d);

      if (!globalCalendar[mKey]) globalCalendar[mKey] = {};
      if (!globalCalendar[mKey][dNum]) globalCalendar[mKey][dNum] = { events: [], quests: [], complete: false };

      globalCalendar[mKey][dNum].dayColor = colorToSet;
      cur.setDate(cur.getDate() + 1);
    }

    await syncCalendarToCloud();
    repaintAllVisibleCells();
    renderSheetContents();
  }

  if (rangeApplyBtn) {
    rangeApplyBtn.addEventListener('click', () => {
      applyDateRangeHighlight(rangeColorInput.value);
    });
  }

  if (rangeClearBtn) {
    rangeClearBtn.addEventListener('click', () => {
      applyDateRangeHighlight(null);
    });
  }

  function setSession(username) {
    localStorage.setItem('nocturna:session', JSON.stringify({ username }));
  }

  function clearSession() {
    localStorage.removeItem('nocturna:session');
  }

  const authOverlay = document.getElementById('auth-overlay');
  const authForm = document.getElementById('auth-form');
  const authTabs = document.querySelectorAll('[data-mode]');
  const authModeInput = document.getElementById('auth-mode');
  const authNameInput = document.getElementById('auth-name');
  const authPasswordInput = document.getElementById('auth-password');
  const authConfirmInput = document.getElementById('auth-confirm');
  const authSubmit = document.getElementById('auth-submit');
  const authError = document.getElementById('auth-error');
  const authButton = document.getElementById('auth-button');
  const logoutButton = document.getElementById('logout-button');

  function setAuthMode(mode) {
    authModeInput.value = mode;
    authTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
    document.getElementById('auth-confirm-wrap').style.display = mode === 'register' ? 'block' : 'none';
    authSubmit.textContent = mode === 'register' ? 'Create account' : 'Log in';
    authError.textContent = '';
    authError.style.display = 'none';
  }

  authTabs.forEach(tab => tab.addEventListener('click', () => setAuthMode(tab.dataset.mode)));

  document.querySelectorAll('.password-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.target);
      if (!target) return;
      const show = target.type === 'password';
      target.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
      button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  function showAuth() {
    authOverlay.classList.add('visible');
    authNameInput.focus();
  }

  function hideAuth() {
    authOverlay.classList.remove('visible');
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const mode = authModeInput.value;
    const username = authNameInput.value.trim();
    const password = authPasswordInput.value;
    const confirm = authConfirmInput.value;

    if (!username || !password) {
      authError.textContent = 'Please fill in your username and password.';
      authError.style.display = 'block';
      return;
    }

    if (mode === 'register' && password.length < 6) {
      authError.textContent = 'Password must be at least 6 characters.';
      authError.style.display = 'block';
      return;
    }

    if (mode === 'register' && password !== confirm) {
      authError.textContent = 'Passwords do not match.';
      authError.style.display = 'block';
      return;
    }

    const normalizedUsername = username.toLowerCase().replace(/\s+/g, '');
    const email = deriveNocturnaEmail(normalizedUsername);

    authSubmit.disabled = true;
    authSubmit.textContent = mode === 'register' ? 'Creating...' : 'Logging in...';

    try {
      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
          username,
          email,
          calendar: {}
        }, { merge: true });
        setSession(username);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setSession(username);
      }

      hideAuth();
      authForm.reset();
      updateAuthState();
      await reloadEntireCalendar();
    } catch (error) {
      console.error("Firebase Auth Error:", error.code, error.message);
      let message = 'Something went wrong. Please try again.';

      if (error.code === 'auth/email-already-in-use') {
        message = 'That username is already taken.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password must be at least 6 characters.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'That username contains invalid characters.';
      } else if (
        error.code === 'auth/invalid-credential' || 
        error.code === 'auth/user-not-found' || 
        error.code === 'auth/wrong-password'
      ) {
        message = 'Incorrect username or password.';
      } else if (error.code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is disabled in Firebase Console.';
      } else if (error.code === 'permission-denied') {
        message = 'Database permission denied. Check your Firestore security rules.';
      }

      authError.textContent = message;
      authError.style.display = 'block';
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = mode === 'register' ? 'Create account' : 'Log in';
    }
  }

  function updateAuthState() {
    const session = getSession();
    const isLoggedIn = !!auth.currentUser;
    const displayName = (session && session.username) || (auth.currentUser && auth.currentUser.email ? auth.currentUser.email.split('@')[0] : null);
    authButton.textContent = isLoggedIn ? (displayName || 'User') : 'Log in';
    authButton.classList.toggle('is-user', isLoggedIn);
    logoutButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
    if (!isLoggedIn) showAuth();
  }

  authButton.addEventListener('click', () => {
    if (auth.currentUser) hideAuth();
    else showAuth();
  });

  logoutButton.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out failed', e);
    }
    clearSession();
    updateAuthState();
    authForm.reset();
    setAuthMode('login');
    await reloadEntireCalendar();
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const session = getSession();
      if (!session) {
        const username = user.email ? user.email.split('@')[0] : 'User';
        setSession(username);
      }
    } else {
      clearSession();
    }
    updateAuthState();
    await reloadEntireCalendar();
  });

  authForm.addEventListener('submit', handleAuthSubmit);
  authOverlay.addEventListener('click', event => {
    if (event.target === authOverlay && getSession()) hideAuth();
  });

  if (searchInput) {
    searchInput.addEventListener('input', repaintAllVisibleCells);
  }

  if (todayButton) {
    todayButton.addEventListener('click', () => {
      const today = new Date();
      const section = [...document.querySelectorAll('.month-section')].find((monthSection) => {
        const heading = monthSection.querySelector('h2');
        return heading && heading.textContent.includes(today.toLocaleString('en-US', { month: 'long' })) && heading.textContent.includes(String(today.getFullYear()));
      });
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  const testTeleBtn = document.getElementById('btn-test-telegram');
  if (testTeleBtn) {
    testTeleBtn.addEventListener('click', async () => {
      testTeleBtn.textContent = 'Sending...';
      testTeleBtn.disabled = true;
      const success = await sendTelegramAlert('🦉 <b>Nocturna Test</b>\nYour Telegram alerts are fully wired and working!');
      testTeleBtn.textContent = success ? 'Sent to Telegram ✓' : 'Failed (Check Console)';
      setTimeout(() => {
        testTeleBtn.textContent = '✈️ Test Telegram Alert';
        testTeleBtn.disabled = false;
      }, 3000);
    });
  }

  function getReminderMilliseconds(reminderStr) {
    const match = reminderStr.match(/(\d+)([mhd\w])/);
    if (!match) return 0;
    const [, num, unit] = match;
    const n = parseInt(num);
    if (unit === 'm') return n * 60 * 1000;
    if (unit === 'h') return n * 60 * 60 * 1000;
    if (unit === 'd') return n * 24 * 60 * 60 * 1000;
    if (unit === 'w') return n * 7 * 24 * 60 * 60 * 1000;
    return 0;
  }

  function triggerNotification(event, dateObj) {
    const title = `Reminder: ${event.title}`;
    const locationStr = event.location ? `\n📍 ${event.location}` : '';
    const timeStr = event.time ? `\n⏰ ${formatTime(event.time)}` : '';

    const telegramMessage = `🦉 <b>Nocturna Alert</b>\n<b>${event.title}</b>${timeStr}${locationStr}`;
    sendTelegramAlert(telegramMessage);

    const options = {
      body: `${event.time ? formatTime(event.time) + ' · ' : ''}${event.location || 'Upcoming event'}`,
      tag: `nocturna-${event.id}`,
      icon: 'data:image/svg+xml,<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="%238b5cf6"/></svg>'
    };

    if (swRegistration && swRegistration.showNotification) {
      swRegistration.showNotification(title, options);
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }

  // Birthday Wishes Mix-and-Mash Engine
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

  function generateBirthdayWish(rawTitle) {
    const cleanName = rawTitle
      .replace(/🎂|🎉|🎈/g, '')
      .replace(/[’']s?\s*birthday/gi, '')
      .replace(/birthday[:\s-]*/gi, '')
      .trim() || 'friend';

    const opener = BDAY_OPENERS[Math.floor(Math.random() * BDAY_OPENERS.length)].replace('[Name]', cleanName);
    const body = BDAY_BODIES[Math.floor(Math.random() * BDAY_BODIES.length)];
    const closer = BDAY_CLOSERS[Math.floor(Math.random() * BDAY_CLOSERS.length)];
    return `${opener} ${body} ${closer}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showBirthdayBanner(title, wishText) {
    let bannerStack = document.getElementById('nocturna-bday-banners');
    if (!bannerStack) {
      bannerStack = document.createElement('div');
      bannerStack.id = 'nocturna-bday-banners';
      bannerStack.className = 'bday-prompt-stack';
      document.body.appendChild(bannerStack);
    }

    const banner = document.createElement('div');
    banner.className = 'bday-prompt-banner';
    bannerStack.appendChild(banner);

    banner.innerHTML = `
      <div class="bday-prompt-content">
        <div class="bday-prompt-head">
          <span>🎂 <strong>${escapeHtml(title)} Today!</strong></span>
          <button type="button" class="bday-close-btn" aria-label="Close birthday greeting">&times;</button>
        </div>
        <p class="bday-wish-preview">"${escapeHtml(wishText)}"</p>
        <div class="bday-prompt-actions">
          <button type="button" class="btn-micro bday-copy-btn">📋 Copy Message</button>
          <button type="button" class="btn-micro bday-reroll-btn">🎲 Reroll Wish</button>
        </div>
      </div>
    `;

    banner.classList.add('visible');

    const copyBtn = banner.querySelector('.bday-copy-btn');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(wishText);
        copyBtn.textContent = 'Copied to Clipboard! ✓';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Message'; }, 2000);
      } catch (err) {
        copyBtn.textContent = 'Copy Failed';
      }
    });

    const rerollBtn = banner.querySelector('.bday-reroll-btn');
    rerollBtn.addEventListener('click', () => {
      wishText = generateBirthdayWish(title);
      banner.querySelector('.bday-wish-preview').textContent = `"${wishText}"`;
    });

    banner.querySelector('.bday-close-btn').addEventListener('click', () => {
      banner.classList.remove('visible');
      setTimeout(() => {
        banner.remove();
        if (!bannerStack.children.length) bannerStack.remove();
      }, 250);
    });
  }

  function checkBirthdayReminders() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const sevenAmToday = new Date(year, month, day, 7, 0, 0);

    // A birthday is eligible any time after 7:00 AM, including when the app
    // is opened later in the morning or afternoon.
    if (now < sevenAmToday) return;

    const todayKey = dateKey(year, month, day);
    const events = getDayData(year, month, day).events || [];

    events.forEach(event => {
      const isBirthday = event.repeat === 'yearly' || /birthday|🎂/i.test(event.title || '');
      if (!isBirthday) return;

      const reminderId = `bday_7am_${todayKey}_${event.id || event.title}`;
      if (triggeredReminders.has(reminderId)) return;
      triggeredReminders.add(reminderId);

      const generatedWish = generateBirthdayWish(event.title || 'friend');
      const safeTitle = escapeHtml(event.title || 'Friend');
      const safeWish = escapeHtml(generatedWish);
      const telegramMessage = `🎂 <b>Birthday Today!</b>\nIt's <b>${safeTitle}</b> today.\n\n<i>Suggested greeting to copy:</i>\n"${safeWish}"`;
      sendTelegramAlert(telegramMessage);
      showBirthdayBanner(event.title || 'Friend', generatedWish);
    });
  }

  function checkReminders() {
    const now = new Date();

    Object.entries(globalCalendar).forEach(([monthKey, monthData]) => {
      Object.entries(monthData).forEach(([dayKey, dayEntry]) => {
        if (!dayEntry.events) return;

        dayEntry.events.forEach(event => {
          if (!event.reminder || event.reminder === 'none') return;
          const reminderId = `${event.id}_${monthKey}_${dayKey}`;
          if (triggeredReminders.has(reminderId)) return;

          const reminderMs = getReminderMilliseconds(event.reminder);
          const [y, m] = monthKey.split('-').map(Number);
          const d = Number(dayKey);
          const eventDate = new Date(y, m - 1, d);

          if (event.time) {
            const [h, mm] = event.time.split(':').map(Number);
            eventDate.setHours(h, mm, 0, 0);
          } else {
            eventDate.setHours(9, 0, 0, 0);
          }

          const reminderTime = new Date(eventDate.getTime() - reminderMs);
          const diff = now.getTime() - reminderTime.getTime();

          if (diff >= 0 && diff < 180000 && now < eventDate) {
            triggeredReminders.add(reminderId);
            triggerNotification(event, eventDate);
          }
        });
      });
    });
  }

  setInterval(checkReminders, 15000);
  setInterval(checkBirthdayReminders, 60000);
  setTimeout(checkBirthdayReminders, 2500);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        swRegistration = await navigator.serviceWorker.register('./sw.js');
      } catch (e) {}
    });
  }

  setAuthMode('login');
})();