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
  getDoc,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { 
  getDatabase, 
  ref as dbRef, 
  onValue 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import {
  computeDay, dueReminders, getExpiryItems as coreExpiryItems, getExpiryStatus as coreExpiryStatus,
  upcomingBirthdays, nextPublicHoliday, sortEvents, isBirthdayEvent, generateBirthdayWish,
  addDaysToKey as coreAddDays, daysBetween, REMINDER_MS
} from './calendar-core.js';

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
let onBubwebChange = () => {};

try {
  const bubwebApp = initializeApp(bubwebConfig, "bubwebBridge");
  const bubwebDb = getDatabase(bubwebApp);
  const activitiesRef = dbRef(bubwebDb, 'activities');
  onValue(activitiesRef, (snapshot) => {
    const data = snapshot.val();
    bubwebActivities = data ? (Array.isArray(data) ? data : Object.values(data)).filter(Boolean) : [];
    onBubwebChange();
  });
} catch (e) {
  console.warn("Bubweb bridge init warning:", e);
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
  let unsubscribeLiveSync = null;

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

  function getDayData(y, m, day) {
    return computeDay(globalCalendar, dateKey(y, m, day), bubwebActivities);
  }

  function todayKey() {
    const t = new Date();
    return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }

  // Re-render everything that depends on calendar data.
  function refreshAllViews() {
    repaintAllVisibleCells();
    renderExpiryOverview();
    renderAgenda();
    updateAppBadge();
    if (activeDateKey && sheet.classList.contains('open')) renderSheetContents();
  }

  // Keep this device in sync with changes from other devices and the
  // Telegram bot, so a stale tab never overwrites newer data.
  function startLiveSync() {
    if (unsubscribeLiveSync) { unsubscribeLiveSync(); unsubscribeLiveSync = null; }
    if (!auth.currentUser) return;
    unsubscribeLiveSync = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.metadata.hasPendingWrites || !snap.exists()) return;
      const remote = snap.data().calendar || {};
      if (JSON.stringify(remote) === JSON.stringify(globalCalendar)) return;
      globalCalendar = remote;
      localStorage.setItem(`nocturna:${currentUserKey()}:full_calendar`, JSON.stringify(globalCalendar));
      refreshAllViews();
    }, (err) => console.warn('Live sync error:', err));
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
    cell.classList.toggle('expiry-day', !!entry?.hasExpiry);
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
    const expiryDayColor = entry?.hasExpiry ? '#ef4444' : null;
    cell.style.background = expiryDayColor ? withAlpha(expiryDayColor, 0.28) : (dayColor ? withAlpha(dayColor, 0.22) : (isWeekend ? 'rgba(37, 29, 56, 0.7)' : 'var(--surface)'));
    cell.style.borderColor = expiryDayColor || dayColor || (isWeekend ? 'rgba(167, 139, 250, 0.28)' : 'var(--border)');
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
    renderExpiryOverview();
    renderAgenda();
    updateAppBadge();

    for (let i = 0; i < 6; i++) {
      await appendNextMonth();
    }
    startLiveSync();
  }

  onBubwebChange = () => { repaintAllVisibleCells(); renderAgenda(); };

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
  const hasExpiryInput = document.getElementById('f-has-expiry');
  const expiryDateInput = document.getElementById('f-expiry-date');
  const expiryDateWrap = document.getElementById('expiry-date-wrap');
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
      } else if (ev.isExpiryMarker) {
        const badge = document.createElement('span');
        badge.style.fontSize = '11px';
        badge.style.color = ev.expiryMarkerKind === 'expiry' ? '#f87171' : '#fb923c';
        badge.style.fontWeight = '800';
        badge.textContent = ev.expiryMarkerKind === 'expiry' ? 'Expiry' : 'Reminder';
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
    hasExpiryInput.checked = false;
    expiryDateInput.value = '';
    expiryDateWrap.style.display = 'none';
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
    hasExpiryInput.checked = !!ev.expiryDate;
    expiryDateInput.value = ev.expiryDate || '';
    expiryDateWrap.style.display = hasExpiryInput.checked ? 'block' : 'none';
    setSelectedColor(ev.color || 'violet');
    saveBtn.textContent = 'Update Event';
    cancelEditBtn.style.display = 'block';
    titleInput.focus();
  }

  cancelEditBtn.addEventListener('click', resetForm);

  hasExpiryInput.addEventListener('change', () => {
    expiryDateWrap.style.display = hasExpiryInput.checked ? 'block' : 'none';
    if (hasExpiryInput.checked && !expiryDateInput.value) expiryDateInput.focus();
  });

  async function deleteEvent(ev) {
    const targetDate = ev.originDate || activeDateKey;
    const targetMonth = targetDate.slice(0, 7);
    const targetDay = targetDate.slice(-2);

    if (globalCalendar[targetMonth] && globalCalendar[targetMonth][targetDay]) {
      globalCalendar[targetMonth][targetDay].events = (globalCalendar[targetMonth][targetDay].events || []).filter(e => e.id !== ev.id);
      await syncCalendarToCloud();
      renderExpiryOverview();
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

    if ((reminderInput.value !== 'none' || hasExpiryInput.checked) && 'Notification' in window) {
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
    const expiryDate = hasExpiryInput.checked ? expiryDateInput.value : '';

    if (hasExpiryInput.checked && !expiryDate) {
      formErr.textContent = 'Choose an expiry date first.';
      formErr.style.display = 'block';
      expiryDateInput.focus();
      return;
    }
    if (hasExpiryInput.checked && expiryDate < saveTargetDate) {
      formErr.textContent = 'Expiry date must be on or after the renewal date.';
      formErr.style.display = 'block';
      expiryDateInput.focus();
      return;
    }
    formErr.textContent = 'Give the event a name first.';

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
          expiryDate,
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
        expiryDate,
        location: locInput.value.trim(), 
        color: selectedColor
      });
    }

    await syncCalendarToCloud();
    renderExpiryOverview();
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
  const expirySummary = document.querySelector('.expiry-summary');
  const expirySummaryButton = document.getElementById('expiry-summary-button');
  const expiryOverview = document.getElementById('expiry-overview');
  const expiryOverviewList = document.getElementById('expiry-overview-list');
  const expiryStatusCount = document.getElementById('expiry-status-count');
  const expiryOverviewClose = document.getElementById('expiry-overview-close');

  function localDateFromKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatExpiryDate(key) {
    return localDateFromKey(key).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function getExpiryItems() {
    return coreExpiryItems(globalCalendar);
  }

  function getExpiryStatus(expiryDate) {
    return coreExpiryStatus(expiryDate, todayKey());
  }

  function renderExpiryOverview() {
    if (!expiryOverviewList || !expiryStatusCount) return;
    const items = getExpiryItems();
    const counts = { expired: 0, soon: 0, okay: 0 };

    expiryOverviewList.innerHTML = '';
    expiryStatusCount.textContent = `${items.length} tracked`;

    if (!items.length) {
      expiryOverviewList.innerHTML = '<p class="expiry-empty">No renewal dates tracked yet.</p>';
      return;
    }

    items.forEach(item => {
      const status = getExpiryStatus(item.expiryDate);
      counts[status.id] += 1;

      const row = document.createElement('div');
      row.className = 'expiry-overview-row';

      const dot = document.createElement('span');
      dot.className = `status-dot ${status.className}`;
      dot.setAttribute('aria-label', status.label);
      row.appendChild(dot);

      const info = document.createElement('div');
      info.className = 'expiry-overview-info';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const detail = document.createElement('span');
      detail.textContent = `${status.label} · Expires ${formatExpiryDate(item.expiryDate)}`;
      info.append(title, detail);
      row.appendChild(info);
      expiryOverviewList.appendChild(row);
    });

    expirySummary.querySelector('.status-dot-green').dataset.count = counts.okay;
    expirySummary.querySelector('.status-dot-orange').dataset.count = counts.soon;
    expirySummary.querySelector('.status-dot-red').dataset.count = counts.expired;
  }

  function setExpiryOverviewOpen(isOpen) {
    expiryOverview.hidden = !isOpen;
    expirySummaryButton.setAttribute('aria-expanded', String(isOpen));
  }

  expirySummaryButton.addEventListener('click', () => {
    renderExpiryOverview();
    setExpiryOverviewOpen(expiryOverview.hidden);
  });
  expiryOverviewClose.addEventListener('click', () => setExpiryOverviewOpen(false));
  document.addEventListener('click', event => {
    if (!expirySummary.contains(event.target)) setExpiryOverviewOpen(false);
  });

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
    expirySummary.style.display = isLoggedIn ? 'block' : 'none';
    renderExpiryOverview();
    if (isLoggedIn) hideAuth();
    else showAuth();
  }

  authButton.addEventListener('click', () => {
    if (auth.currentUser) hideAuth();
    else showAuth();
  });

  logoutButton.addEventListener('click', async () => {
    if (unsubscribeLiveSync) { unsubscribeLiveSync(); unsubscribeLiveSync = null; }
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


  // ======================================================================
  // "Up next" agenda — the first thing you see when you open the app
  // ======================================================================

  const agendaEl = document.getElementById('agenda');
  const AGENDA_COLLAPSE_KEY = 'nocturna:agendaCollapsed';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function colorHex(color) {
    if (!color) return '#8b5cf6';
    if (color.startsWith('#')) return color;
    const c = COLORS.find(x => x.id === color);
    return c ? c.hex : '#8b5cf6';
  }

  function openSheetForKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    openSheet(y, m - 1, d);
  }

  function inDaysText(n) {
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  }

  function shortDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const isUserEvent = (ev) => !ev.isHoliday && !ev.isExpiryMarker;

  // Open quests from today and the previous 7 days (so nothing slips).
  function getOpenQuests(fromKey) {
    const out = [];
    for (let i = 7; i >= 0; i--) {
      const key = coreAddDays(fromKey, -i);
      const entry = globalCalendar[key.slice(0, 7)]?.[key.slice(8)];
      (entry?.quests || []).filter(q => !q.done).forEach(q => out.push({ quest: q, key, carried: i > 0 }));
    }
    return out;
  }

  async function toggleQuestDone(key, questId) {
    const entry = globalCalendar[key.slice(0, 7)]?.[key.slice(8)];
    const quest = entry?.quests?.find(q => q.id === questId);
    if (!quest) return;
    quest.done = !quest.done;
    await syncCalendarToCloud();
    refreshAllViews();
  }

  function renderAgenda() {
    if (!agendaEl) return;
    if (!auth.currentUser) { agendaEl.hidden = true; return; }
    agendaEl.hidden = false;
    agendaEl.innerHTML = '';

    const today = todayKey();
    const day = computeDay(globalCalendar, today, bubwebActivities);
    const todaysEvents = sortEvents(day.events.filter(isUserEvent));
    const openQuests = getOpenQuests(today);
    const collapsed = localStorage.getItem(AGENDA_COLLAPSE_KEY) === '1';
    agendaEl.classList.toggle('collapsed', collapsed);

    // Header
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const head = el('div', 'agenda-head');
    const titleWrap = el('div');
    titleWrap.append(
      el('span', 'agenda-greet', greet),
      el('h2', 'agenda-date', new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }))
    );
    const summaryBits = [];
    summaryBits.push(`${todaysEvents.length} event${todaysEvents.length === 1 ? '' : 's'}`);
    summaryBits.push(`${openQuests.length} task${openQuests.length === 1 ? '' : 's'}`);
    const toggle = el('button', 'agenda-toggle', `${summaryBits.join(' · ')} ${collapsed ? '▾' : '▴'}`);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.addEventListener('click', () => {
      localStorage.setItem(AGENDA_COLLAPSE_KEY, collapsed ? '0' : '1');
      renderAgenda();
    });
    head.append(titleWrap, toggle);
    agendaEl.appendChild(head);
    if (collapsed) return;

    const body = el('div', 'agenda-body');

    // --- Today column ---
    const todayCol = el('div', 'agenda-card agenda-today');
    todayCol.appendChild(el('h3', 'agenda-label', 'Today'));
    const holiday = day.events.find(ev => ev.isHoliday);
    if (holiday) {
      const h = el('div', 'agenda-holiday', `${holiday.title}${holiday.isOff ? ' · day off' : ''}`);
      h.style.color = holiday.color;
      todayCol.appendChild(h);
    }
    day.events.filter(ev => ev.isExpiryMarker).forEach(ev => {
      todayCol.appendChild(el('div', 'agenda-warn', `⚠️ ${ev.title}`));
    });
    if (!todaysEvents.length && !openQuests.length) {
      const empty = el('button', 'agenda-empty', 'Nothing planned — tap to add something');
      empty.type = 'button';
      empty.addEventListener('click', () => openSheetForKey(today));
      todayCol.appendChild(empty);
    }
    const now = new Date();
    const nowHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    todaysEvents.forEach(ev => {
      const row = el('button', 'agenda-event');
      row.type = 'button';
      if (!ev.allDay && ev.time && ev.time < nowHHMM) row.classList.add('past');
      const dot = el('span', 'agenda-dot');
      dot.style.background = colorHex(ev.color);
      const time = el('span', 'agenda-time', ev.allDay || !ev.time ? 'All day' : formatTime(ev.time));
      const title = el('span', 'agenda-title', ev.title);
      row.append(dot, time, title);
      if (ev.location && !ev.isBubwebSynced) row.appendChild(el('span', 'agenda-loc', ev.location));
      row.addEventListener('click', () => openSheetForKey(ev.isBubwebSynced ? today : (ev.originDate && !ev.isRecurringInstance ? ev.originDate : today)));
      todayCol.appendChild(row);
    });
    openQuests.slice(0, 8).forEach(({ quest, key, carried }) => {
      const row = el('label', 'agenda-quest');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => toggleQuestDone(key, quest.id));
      row.append(box, el('span', 'agenda-title', quest.text));
      if (carried) row.appendChild(el('span', 'agenda-carried', `from ${shortDate(key)}`));
      todayCol.appendChild(row);
    });
    if (openQuests.length > 8) todayCol.appendChild(el('div', 'agenda-more', `+${openQuests.length - 8} more tasks`));
    body.appendChild(todayCol);

    // --- Next 7 days strip ---
    const week = el('div', 'agenda-card agenda-week');
    week.appendChild(el('h3', 'agenda-label', 'Next 7 days'));
    const strip = el('div', 'week-strip');
    for (let i = 1; i <= 7; i++) {
      const key = coreAddDays(today, i);
      const d = computeDay(globalCalendar, key, bubwebActivities);
      const evs = sortEvents(d.events.filter(isUserEvent).filter(ev => ev.repeat !== 'daily'));
      const quests = (d.quests || []).filter(q => !q.done);
      const hol = d.events.find(ev => ev.isHoliday && ev.isOff);
      const fest = d.events.find(ev => ev.isHoliday && !ev.isOff && !ev.isFuel);
      const [y, m, dd] = key.split('-').map(Number);
      const dateObj = new Date(y, m - 1, dd);
      const cell = el('button', 'week-day');
      cell.type = 'button';
      if (dateObj.getDay() === 0 || dateObj.getDay() === 6) cell.classList.add('weekend');
      if (hol) cell.classList.add('off');
      if (!evs.length && !quests.length) cell.classList.add('free');
      cell.append(
        el('span', 'week-dow', dateObj.toLocaleDateString('en-ZA', { weekday: 'short' })),
        el('span', 'week-num', String(dd))
      );
      const dots = el('span', 'week-dots');
      evs.slice(0, 4).forEach(ev => {
        const dot = el('i');
        dot.style.background = colorHex(ev.color);
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
      const first = evs[0];
      cell.appendChild(el('span', 'week-first', hol ? 'Day off' : first ? first.title.replace(/^🎂\s*/u, '🎂 ') : fest ? fest.title : (quests.length ? `${quests.length} task${quests.length > 1 ? 's' : ''}` : '—')));
      cell.title = [...(hol ? [hol.title] : []), ...evs.map(ev => `${ev.time && !ev.allDay ? formatTime(ev.time) + ' ' : ''}${ev.title}`)].join('\n') || 'Free';
      cell.addEventListener('click', () => openSheetForKey(key));
      strip.appendChild(cell);
    }
    week.appendChild(strip);

    // --- Countdown chips ---
    const chips = el('div', 'agenda-chips');
    const addChip = (text, tone, onClick) => {
      const chip = el(onClick ? 'button' : 'span', `agenda-chip ${tone || ''}`, text);
      if (onClick) { chip.type = 'button'; chip.addEventListener('click', onClick); }
      chips.appendChild(chip);
    };

    upcomingBirthdays(globalCalendar, today, 30).slice(0, 3).forEach(({ ev, key, inDays }) => {
      const name = ev.title.replace(/🎂\s*/u, '');
      if (inDays === 0) {
        addChip(`🎂 ${name} today — copy a wish`, 'pink', async (e) => {
          try {
            await navigator.clipboard.writeText(generateBirthdayWish(ev.title));
            e.target.textContent = '🎂 Wish copied ✓';
          } catch { showBirthdayBanner(ev.title, generateBirthdayWish(ev.title)); }
        });
      } else {
        addChip(`🎂 ${name} ${inDaysText(inDays)}`, 'pink', () => openSheetForKey(key));
      }
    });

    const ph = nextPublicHoliday(today, 120);
    if (ph) {
      const label = ph.inDays === 0 ? `🇿🇦 ${ph.holiday.name} today` : `🇿🇦 ${ph.holiday.name} ${inDaysText(ph.inDays)}`;
      addChip(`${label}${ph.longWeekend ? ' · long weekend 🏖️' : ''}`, 'amber', () => openSheetForKey(ph.key));
    }

    getExpiryItems().forEach(item => {
      const st = getExpiryStatus(item.expiryDate);
      if (st.id === 'expired') addChip(`🔴 ${item.title} expired`, 'red', () => openSheetForKey(item.renewalDate));
      else if (st.id === 'soon') addChip(`🟠 ${item.title} expires ${inDaysText(daysBetween(today, item.expiryDate))}`, 'orange', () => openSheetForKey(item.renewalDate));
    });

    for (let i = 0; i <= 6; i++) {
      const key = coreAddDays(today, i);
      if (computeDay(globalCalendar, key).events.some(ev => ev.isFuel)) {
        addChip(`⛽ Fuel price change ${inDaysText(i)}`, 'amber');
        break;
      }
    }

    if (chips.children.length) week.appendChild(chips);
    body.appendChild(week);
    agendaEl.appendChild(body);
  }

  // ======================================================================
  // Notifications on this device (while the app is open or in background
  // tab). Closed-app alerts come from the Telegram notifier in /notifier.
  // ======================================================================

  const NOTIFIED_KEY = 'nocturna:notified';
  const notifyStatusEl = document.getElementById('notify-status');
  const notifyEnableBtn = document.getElementById('btn-enable-notify');
  const notifyTestBtn = document.getElementById('btn-test-notify');

  function loadNotified() {
    try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); } catch { return {}; }
  }
  function markNotified(id) {
    const log = loadNotified();
    log[id] = Date.now();
    Object.entries(log).forEach(([k, ts]) => { if (Date.now() - ts > 10 * 86400e3) delete log[k]; });
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(log));
  }
  const wasNotified = (id) => !!loadNotified()[id];

  function localToEpoch(key, hhmm) {
    const [y, m, d] = key.split('-').map(Number);
    const [h, mi] = hhmm.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime();
  }

  function notificationsSupported() {
    return 'Notification' in window;
  }

  async function showLocalNotification(title, body, tag, key) {
    if (!notificationsSupported() || Notification.permission !== 'granted') return false;
    const options = {
      body,
      tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: key ? `./?date=${key}` : './' }
    };
    try {
      const reg = swRegistration || (navigator.serviceWorker && await navigator.serviceWorker.ready);
      if (reg && reg.showNotification) await reg.showNotification(title, options);
      else new Notification(title, options);
      return true;
    } catch (e) {
      console.warn('Notification failed:', e);
      return false;
    }
  }

  function checkReminders() {
    if (!auth.currentUser) return;
    const now = Date.now();
    dueReminders(globalCalendar, now, localToEpoch, bubwebActivities).forEach(r => {
      if (wasNotified(r.id)) return;
      // Only alert for reminders that came due in the last 30 minutes; older
      // ones were missed while the app was closed (Telegram covers those).
      const fireAt = r.start - REMINDER_MS[r.ev.reminder];
      if (now - fireAt > 30 * 60e3) { markNotified(r.id); return; }
      const mins = Math.round((r.start - now) / 60000);
      const lead = mins < 60 ? `in ${mins} min` : mins < 1440 ? `in ${Math.round(mins / 60)}h` : shortDate(r.key);
      const when = r.ev.allDay || !r.ev.time ? 'All day' : formatTime(r.ev.time);
      showLocalNotification(`${r.ev.title} — ${lead}`, `${when}${r.ev.location ? ' · ' + r.ev.location : ''}`, r.id, r.key)
        .then(ok => { if (ok) markNotified(r.id); });
    });
  }

  function checkExpiryReminders() {
    if (!auth.currentUser) return;
    const today = todayKey();
    computeDay(globalCalendar, today).events.filter(ev => ev.isExpiryMarker).forEach(ev => {
      const id = `expiry_${today}_${ev.id}`;
      if (wasNotified(id)) return;
      showLocalNotification(`⚠️ ${ev.title}`, 'Renewal reminder from Nocturna', id, ev.originDate)
        .then(ok => { if (ok) markNotified(id); });
    });
  }

  function renderNotifyStatus() {
    if (!notifyStatusEl) return;
    let text;
    if (!notificationsSupported()) {
      const ios = /iphone|ipad/i.test(navigator.userAgent);
      text = ios
        ? 'On iPhone, add Nocturna to your Home Screen (Share → Add to Home Screen) and open it from there to enable alerts.'
        : 'This browser does not support notifications.';
      if (notifyEnableBtn) notifyEnableBtn.style.display = 'none';
    } else if (Notification.permission === 'granted') {
      text = 'On for this device. Alerts show while Nocturna is open or in a background tab.';
      if (notifyEnableBtn) notifyEnableBtn.style.display = 'none';
    } else if (Notification.permission === 'denied') {
      text = 'Blocked. Allow notifications for this site in your browser settings, then reload.';
      if (notifyEnableBtn) notifyEnableBtn.style.display = 'none';
    } else {
      text = 'Off for this device.';
      if (notifyEnableBtn) notifyEnableBtn.style.display = '';
    }
    notifyStatusEl.textContent = text;
    if (notifyTestBtn) notifyTestBtn.style.display = notificationsSupported() && Notification.permission === 'granted' ? '' : 'none';
  }

  if (notifyEnableBtn) {
    notifyEnableBtn.addEventListener('click', async () => {
      try { await Notification.requestPermission(); } catch (e) { console.warn(e); }
      renderNotifyStatus();
      checkReminders();
    });
  }
  if (notifyTestBtn) {
    notifyTestBtn.addEventListener('click', async () => {
      const ok = await showLocalNotification('🦉 Nocturna test', 'Notifications are working on this device.', 'nocturna-test');
      notifyTestBtn.textContent = ok ? 'Sent ✓' : 'Failed — check browser settings';
      setTimeout(() => { notifyTestBtn.textContent = 'Send test notification'; }, 2500);
    });
  }
  renderNotifyStatus();

  // Home-screen icon badge = today's events + open tasks (installed PWA).
  function updateAppBadge() {
    if (!('setAppBadge' in navigator)) return;
    if (!auth.currentUser) { navigator.clearAppBadge?.().catch(() => {}); return; }
    const today = todayKey();
    const count = computeDay(globalCalendar, today, bubwebActivities).events.filter(isUserEvent).length
      + getOpenQuests(today).length;
    (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }

  // ======================================================================
  // Birthday banner (in-app, once per day per device)
  // ======================================================================

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

    banner.querySelector('.bday-reroll-btn').addEventListener('click', () => {
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
    if (!auth.currentUser) return;
    if (new Date().getHours() < 7) return;
    const today = todayKey();
    computeDay(globalCalendar, today, bubwebActivities).events.filter(isBirthdayEvent).forEach(ev => {
      const id = `bday_${today}_${ev.id || ev.title}`;
      if (triggeredReminders.has(id) || wasNotified(id)) return;
      triggeredReminders.add(id);
      markNotified(id);
      showBirthdayBanner(ev.title || 'Friend', generateBirthdayWish(ev.title || 'friend'));
    });
  }

  // ======================================================================
  // Timers, day rollover, deep links, service worker
  // ======================================================================

  let lastSeenDay = todayKey();
  function tick() {
    if (todayKey() !== lastSeenDay) {
      lastSeenDay = todayKey();
      reloadEntireCalendar(); // move the "today" ring and refresh the agenda
      return;
    }
    checkReminders();
    checkExpiryReminders();
    checkBirthdayReminders();
  }

  setInterval(tick, 30000);
  setTimeout(tick, 2500);
  setInterval(renderAgenda, 5 * 60e3); // keep greeting / past events fresh

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      renderAgenda();
      renderNotifyStatus();
    }
  });

  // Notification taps open "./?date=YYYY-MM-DD" -> jump straight to that day.
  let pendingDeepLink = new URLSearchParams(location.search).get('date');
  function consumeDeepLink() {
    if (!pendingDeepLink || !auth.currentUser || !/^\d{4}-\d{2}-\d{2}$/.test(pendingDeepLink)) return;
    const key = pendingDeepLink;
    pendingDeepLink = null;
    history.replaceState(null, '', location.pathname);
    openSheetForKey(key);
  }
  onAuthStateChanged(auth, (user) => { if (user) setTimeout(consumeDeepLink, 800); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => { swRegistration = reg; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'open-date') {
        pendingDeepLink = event.data.date;
        consumeDeepLink();
      }
    });
  }

  setAuthMode('login');
})();
