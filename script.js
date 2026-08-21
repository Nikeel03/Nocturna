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

// 2. Secondary Bubweb Firebase Bridge (Realtime Database)
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
  
  // Realtime listener to Bubweb activities
  const activitiesRef = dbRef(bubwebDb, 'activities');
  onValue(activitiesRef, (snapshot) => {
    const data = snapshot.val();
    bubwebActivities = data ? (Array.isArray(data) ? data : Object.values(data)) : [];
    repaintAllVisibleCells();
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

  // Merges Nocturna Private Events + Recurring Events + Realtime Bubweb Adventures
  function getDayData(y, m, day) {
    const dKey = dateKey(y, m, day);
    const mKey = dKey.slice(0, 7);
    const dNum = pad(day);

    const baseEntry = (globalCalendar[mKey] && globalCalendar[mKey][dNum]) 
      ? JSON.parse(JSON.stringify(globalCalendar[mKey][dNum])) 
      : { events: [], complete: false };
    const directEvents = baseEntry.events || [];
    const recurringEvents = [];

    // 1. Process recurring Nocturna events
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

    // 2. Process real-time synced Bubweb activities
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

    return {
      ...baseEntry,
      events: [...directEvents, ...recurringEvents, ...bubwebEvents]
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
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(ch => ch + ch).join('') : clean;
    const int = parseInt(full, 16);
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
    const over = !!(entry && entry.complete) || isDayPast(ky, km - 1, kd);
    cell.classList.toggle('done', over);
    cell.innerHTML = '';

    const query = getSearchQuery();
    const events = (entry && entry.events) || [];
    const visibleEvents = query ? events.filter(ev => getEventMatchText(ev).includes(query)) : events;
    const shouldHide = !!query && visibleEvents.length === 0;
    cell.style.display = shouldHide ? 'none' : '';

    const dayColor = entry && entry.dayColor ? entry.dayColor : null;
    cell.style.background = dayColor ? withAlpha(dayColor, 0.22) : 'var(--surface)';
    cell.style.borderColor = dayColor || 'var(--border)';
    cell.style.boxShadow = dayColor ? 'inset 0 0 0 1px ' + withAlpha(dayColor, 0.35) : 'none';

    const num = document.createElement('div');
    num.className = 'daynum';
    num.textContent = day;
    cell.appendChild(num);

    const chips = document.createElement('div');
    chips.className = 'chips';
    visibleEvents.slice(0, 3).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      const colorObj = COLORS.find(c => c.id === ev.color) || COLORS[0];
      chip.style.background = colorObj.hex;
      const meta = ev.allDay ? 'All day' : (ev.time ? ev.time : '');
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

  const backdrop = document.getElementById('backdrop');
  const sheet = document.getElementById('sheet');
  const sheetDate = document.getElementById('sheet-date');
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

  async function openSheet(y, m, day) {
    activeDateKey = dateKey(y, m, day);
    resetForm();
    const dObj = new Date(y, m, day);
    sheetDate.textContent = dObj.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

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
    sheet.style.transition = '';
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

    eventList.innerHTML = '';
    const events = dayData.events || [];
    emptyHint.style.display = events.length ? 'none' : 'block';

    events.forEach(ev => {
      const row = document.createElement('div');
      row.className = 'event-row';
      const colorObj = COLORS.find(c => c.id === ev.color) || COLORS[0];

      const dot = document.createElement('div');
      dot.className = 'event-dot';
      dot.style.background = colorObj.hex;
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
        if (ev.allDay) detailParts.unshift('All day');
        if (ev.repeat === 'yearly') detailParts.push('🎂 Yearly Birthday');
        else if (ev.repeat && ev.repeat !== 'none') detailParts.push(`Repeats ${ev.repeat}`);
        if (ev.reminder && ev.reminder !== 'none') detailParts.push(`Alert ${ev.reminder}`);
        meta.textContent = detailParts.join(' · ');
        info.appendChild(meta);
      }

      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'event-actions';

      // Read-only actions for synced Bubweb items
      if (ev.isBubwebSynced) {
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
        editBtn.addEventListener('click', () => startEdit(ev));
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
    saveBtn.textContent = 'Add event';
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
    saveBtn.textContent = 'Update event';
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
    if (!globalCalendar[monthKey][dayNumber]) globalCalendar[monthKey][dayNumber] = { events: [], complete: false };

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
    if (!globalCalendar[monthKey][dayNumber]) globalCalendar[monthKey][dayNumber] = { events: [], complete: false };

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
      if (!globalCalendar[mKey][dNum]) globalCalendar[mKey][dNum] = { events: [], complete: false };

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
            console.log(`🔔 Reminder triggered for: ${event.title} (${event.reminder})`);
            triggeredReminders.add(reminderId);
            triggerNotification(event, eventDate);
          }
        });
      });
    });
  }

  setInterval(checkReminders, 15000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        swRegistration = await navigator.serviceWorker.register('./sw.js');
      } catch (e) {}
    });
  }

  setAuthMode('login');
})();