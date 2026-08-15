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

const firebaseConfig = {
  apiKey: "AIzaSyAjzmlmjB73S60nUw0vPrEJXq-y3-xlrG0",
  authDomain: "nocturna-f83da.firebaseapp.com",
  projectId: "nocturna-f83da",
  storageBucket: "nocturna-f83da.firebasestorage.app",
  messagingSenderId: "768241227819",
  appId: "1:768241227819:web:69031db73951bb6dbc326e",
  measurementId: "G-RWFF29S6BE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
  
  let cache = {};
  let cellRefs = {};
  let selectedColor = 'violet';
  let editingId = null;
  let activeDateKey = null;
  let monthOffset = 0;
  let isLoading = false;

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

  function monthStorageKey(key) {
    return currentUserKey() + ':month:' + key;
  }

  async function loadUserCalendarFromFirestore() {
    if (!auth.currentUser) return {};
    try {
      const ref = doc(db, 'users', auth.currentUser.uid);
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data().calendar || {}) : {};
    } catch (e) {
      console.warn('Firestore load error:', e);
      return {};
    }
  }

  async function saveMonthToFirestore(key, data) {
    if (!auth.currentUser) return;
    try {
      const ref = doc(db, 'users', auth.currentUser.uid);
      const username = getSession()?.username || auth.currentUser.email?.split('@')[0] || 'Nocturna user';
      
      // Save directly using a nested field update for fast performance
      await setDoc(ref, {
        username,
        email: auth.currentUser.email || deriveNocturnaEmail(username),
        calendar: {
          [key]: data
        }
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore sync failed', e);
    }
  }

  function readLocal(key) {
    try {
      const raw = localStorage.getItem(monthStorageKey(key));
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function writeLocal(key, data) {
    try { localStorage.setItem(monthStorageKey(key), JSON.stringify(data)); } catch (e) {}
  }

  async function loadMonth(key) {
    if (cache[key]) return cache[key];
    let data = readLocal(key);

    if (auth.currentUser) {
      try {
        const cloudCalendar = await loadUserCalendarFromFirestore();
        if (cloudCalendar[key]) {
          data = cloudCalendar[key];
          writeLocal(key, data);
        }
      } catch (e) {
        data = readLocal(key);
      }
    }

    cache[key] = data || {};
    return cache[key];
  }

  function saveMonth(key) {
    const data = cache[key] || {};
    writeLocal(key, data);
    if (auth.currentUser) {
      saveMonthToFirestore(key, data); // Async background save
    }
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

  async function renderMonth(baseDate) {
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth();
    const key = monthKey(baseDate);
    const data = await loadMonth(key);

    const section = document.createElement('div');
    section.className = 'month-section';

    const sticky = document.createElement('div');
    sticky.className = 'month-sticky';
    const h2 = document.createElement('h2');
    h2.textContent = baseDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    sticky.appendChild(h2);
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
      paintCell(dKey, data[pad(day)]);
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
    const events = (entry && entry.events) || [];
    events.slice(0, 3).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      const colorObj = COLORS.find(c => c.id === ev.color) || COLORS[0];
      chip.style.background = colorObj.hex;
      chip.textContent = (ev.time ? ev.time + ' ' : '') + ev.title;
      chips.appendChild(chip);
    });

    if (events.length > 3) {
      const more = document.createElement('div');
      more.className = 'chip-more';
      more.textContent = '+' + (events.length - 3) + ' more';
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

      await renderMonth(targetDate);
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
    cache = {};
    cellRefs = {};
    monthOffset = 0;

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
  const colorRow = document.getElementById('color-row');
  const dayColorPicker = document.getElementById('f-day-color');
  const saveBtn = document.getElementById('save-btn');
  const cancelEditBtn = document.getElementById('cancel-edit');
  const formErr = document.getElementById('form-err');
  const doneSwitch = document.getElementById('done-switch');
  const doneLabel = document.getElementById('done-label');

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
    await renderSheetContents();
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }

  function closeSheet() {
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    resetForm();
  }

  backdrop.addEventListener('click', closeSheet);
  document.getElementById('sheet-close').addEventListener('click', closeSheet);

  function currentMonthKeyFromActive() {
    return activeDateKey.slice(0, 7);
  }
  function currentDayFromActive() {
    return activeDateKey.slice(-2);
  }

  async function renderSheetContents() {
    const monthKey = currentMonthKeyFromActive();
    const dayNumber = currentDayFromActive();
    const data = cache[monthKey] || {};
    const entry = data[dayNumber] || { events: [], complete: false };

    const [sy, sm, sd] = activeDateKey.split('-').map(Number);
    const pastAuto = isDayPast(sy, sm - 1, sd);
    const isOver = !!entry.complete || pastAuto;
    doneSwitch.classList.toggle('on', isOver);
    doneLabel.textContent = pastAuto ? 'This day has passed' : (entry.complete ? 'Day complete' : 'Mark day complete');
    dayColorPicker.value = entry.dayColor || '#8b5cf6';

    eventList.innerHTML = '';
    const events = entry.events || [];
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
      if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'event-meta';
        meta.textContent = metaParts.join(' · ');
        info.appendChild(meta);
      }

      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'event-actions';

      const editBtn = document.createElement('div');
      editBtn.className = 'icon-btn';
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
      editBtn.addEventListener('click', () => startEdit(ev));
      actions.appendChild(editBtn);

      const delBtn = document.createElement('div');
      delBtn.className = 'icon-btn';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
      delBtn.addEventListener('click', () => deleteEvent(ev.id));
      actions.appendChild(delBtn);

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
    titleInput.value = '';
    timeInput.value = '';
    locInput.value = '';
    formErr.style.display = 'none';
    setSelectedColor('violet');
    dayColorPicker.value = '#8b5cf6';
    saveBtn.textContent = 'Add event';
    cancelEditBtn.style.display = 'none';
  }

  function startEdit(ev) {
    editingId = ev.id;
    titleInput.value = ev.title;
    timeInput.value = ev.time || '';
    locInput.value = ev.location || '';
    setSelectedColor(ev.color || 'violet');
    saveBtn.textContent = 'Update event';
    cancelEditBtn.style.display = 'block';
    titleInput.focus();
  }

  cancelEditBtn.addEventListener('click', resetForm);

  async function deleteEvent(id) {
    const monthKey = currentMonthKeyFromActive();
    const dayNumber = currentDayFromActive();
    const data = cache[monthKey];
    if (!data || !data[dayNumber]) return;

    data[dayNumber].events = (data[dayNumber].events || []).filter(e => e.id !== id);
    saveMonth(monthKey);
    paintCell(activeDateKey, data[dayNumber]);
    await renderSheetContents();
  }

  // Instant local update + background cloud sync
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      formErr.style.display = 'block';
      titleInput.focus();
      return;
    }
    formErr.style.display = 'none';

    const monthKey = currentMonthKeyFromActive();
    const dayNumber = currentDayFromActive();
    if (!cache[monthKey]) cache[monthKey] = {};
    if (!cache[monthKey][dayNumber]) cache[monthKey][dayNumber] = { events: [], complete: false };

    const entry = cache[monthKey][dayNumber];
    if (dayColorPicker.value) entry.dayColor = dayColorPicker.value;

    if (editingId) {
      const idx = entry.events.findIndex(ev => ev.id === editingId);
      if (idx > -1) {
        entry.events[idx] = { ...entry.events[idx], title, time: timeInput.value, location: locInput.value.trim(), color: selectedColor };
      }
    } else {
      entry.events.push({
        id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
        title, time: timeInput.value, location: locInput.value.trim(), color: selectedColor
      });
    }

    saveMonth(monthKey);
    paintCell(activeDateKey, entry);
    resetForm();
    await renderSheetContents();
  });

  doneSwitch.addEventListener('click', async () => {
    const monthKey = currentMonthKeyFromActive();
    const dayNumber = currentDayFromActive();
    if (!cache[monthKey]) cache[monthKey] = {};
    if (!cache[monthKey][dayNumber]) cache[monthKey][dayNumber] = { events: [], complete: false };

    const entry = cache[monthKey][dayNumber];
    entry.complete = !entry.complete;
    saveMonth(monthKey);
    paintCell(activeDateKey, entry);
    doneSwitch.classList.toggle('on', entry.complete);
    doneLabel.textContent = entry.complete ? 'Day complete' : 'Mark day complete';
  });

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
      await reloadEntireCalendar(); // Reloads calendar from user's cloud account!
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

  async function initCalendar() {
    setAuthMode('login');
    updateAuthState();
    await reloadEntireCalendar();
  }

  initCalendar();
})();