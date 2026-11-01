import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, dueReminders, upcomingBirthdays, nextPublicHoliday, getExpiryStatus } from '../calendar-core.js';
import { parseQuickAdd } from './parse.js';
import { buildMorningDigest, buildEveningPreview, toEpoch, zoneParts } from './notify.js';

const cal = {
  '2026-01': { '15': { events: [{ id: 'b1', title: 'Mom', repeat: 'yearly', reminder: 'none', allDay: true, color: 'pink' }] } },
  '2026-10': {
    '05': { events: [{ id: 'g1', title: 'Gym', time: '06:00', repeat: 'weekly', reminder: '1h', color: 'teal' }] },
    '31': { events: [{ id: 'r1', title: 'Rent', allDay: true, repeat: 'monthly', reminder: '1d', color: 'red' }] }
  },
  '2026-11': {
    '01': { events: [], quests: [{ id: 'q1', text: 'Laundry', done: false }, { id: 'q2', text: 'Done thing', done: true }] },
    '02': { events: [{ id: 'd1', title: 'Dentist', time: '15:00', location: 'Sandton', repeat: 'none', reminder: '1h', color: 'violet' }] },
    '10': { events: [{ id: 'p1', title: 'Passport', allDay: true, repeat: 'none', reminder: 'none', expiryDate: '2026-11-20', color: 'blue' }] },
    '12': { events: [{ id: 'b2', title: "Sam's birthday", allDay: true, repeat: 'yearly', reminder: 'none', color: 'pink' }] }
  }
};

test('weekly recurrence lands on same weekday', () => {
  assert.ok(computeDay(cal, '2026-11-02').events.some(e => e.id === 'g1')); // Monday
  assert.ok(!computeDay(cal, '2026-11-03').events.some(e => e.id === 'g1'));
});

test('monthly on the 31st clamps to 30 Nov', () => {
  assert.ok(computeDay(cal, '2026-11-30').events.some(e => e.id === 'r1'));
  assert.ok(computeDay(cal, '2026-12-31').events.some(e => e.id === 'r1'));
});

test('yearly shows in earlier and later years', () => {
  assert.ok(computeDay(cal, '2025-01-15').events.some(e => e.id === 'b1'));
  assert.ok(computeDay(cal, '2027-01-15').events.some(e => e.id === 'b1'));
});

test('expiry markers', () => {
  const ids = (k) => computeDay(cal, k).events.map(e => e.id);
  assert.ok(ids('2026-11-13').includes('p1-expiry-week'));
  assert.ok(ids('2026-11-20').includes('p1-expiry'));
  assert.equal(getExpiryStatus('2026-11-20', '2026-11-01').id, 'soon');
});

test('holidays', () => {
  assert.equal(computeDay(cal, '2026-12-16').events[0].isOff, true);
  const next = nextPublicHoliday('2026-11-01');
  assert.equal(next.key, '2026-12-16');
  assert.ok(computeDay(cal, '2026-11-04').events.some(e => e.isFuel)); // 1st Wed
});

test('upcoming birthdays', () => {
  const b = upcomingBirthdays(cal, '2026-11-01', 90);
  assert.equal(b[0].ev.id, 'b2');
  assert.equal(b[0].inDays, 11);
});

test('reminders fire for one-off and recurring events, in SAST', () => {
  const now = toEpoch('2026-11-02', '14:05');
  const due = dueReminders(cal, now, toEpoch).map(r => r.ev.id);
  assert.deepEqual(due, ['d1']);
  const gym = dueReminders(cal, toEpoch('2026-11-09', '05:10'), toEpoch).map(r => r.id);
  assert.deepEqual(gym, ['rem:g1:2026-11-09:1h']);
  // all-day rent: 09:00 on 29 Nov (1d before 30 Nov 09:00)
  assert.ok(dueReminders(cal, toEpoch('2026-11-29', '09:30'), toEpoch).some(r => r.ev.id === 'r1'));
  assert.ok(!dueReminders(cal, toEpoch('2026-11-29', '08:30'), toEpoch).some(r => r.ev.id === 'r1'));
});

test('timezone helpers', () => {
  assert.equal(toEpoch('2026-11-01', '09:00'), Date.UTC(2026, 10, 1, 7, 0));
  assert.deepEqual(zoneParts(Date.UTC(2026, 10, 1, 22, 30)), { key: '2026-11-02', hhmm: '00:30' });
});

const T = '2026-11-01'; // a Sunday
const p = (s) => parseQuickAdd(s, T);

test('parser: events', () => {
  let r = p('Dentist tomorrow 3pm @ Sandton City');
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.event.time, '15:00');
  assert.equal(r.event.title, 'Dentist');
  assert.equal(r.event.location, 'Sandton City');
  assert.equal(r.event.reminder, '1h');

  r = p('Gym every mon 06:00');
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.event.repeat, 'weekly');
  assert.equal(r.event.time, '06:00');
  assert.equal(r.event.title, 'Gym');

  r = p('Mom birthday 12 March');
  assert.equal(r.date, '2027-03-12');
  assert.equal(r.event.repeat, 'yearly');
  assert.equal(r.event.title, '🎂 Mom birthday');

  r = p('Car service 5/12 !1w');
  assert.equal(r.date, '2026-12-05');
  assert.equal(r.event.reminder, '1w');
  assert.equal(r.event.allDay, true);

  r = p('Meeting fri 15h30');
  assert.equal(r.date, '2026-11-06');
  assert.equal(r.event.time, '15:30');

  r = p('Lunch with Priya on Nov 20 at 1');
  assert.equal(r.date, '2026-11-20');
  assert.equal(r.event.time, '13:00');
  assert.equal(r.event.title, 'Lunch with Priya');

  r = p('Flight 2026-12-18 at 10:15am');
  assert.equal(r.date, '2026-12-18');
  assert.equal(r.event.time, '10:15');

  r = p('Call bank in 3 days');
  assert.equal(r.date, '2026-11-04');
  assert.equal(r.event.title, 'Call bank');

  r = p('sunday braai');
  assert.equal(r.date, '2026-11-08');
});

test('parser: tasks', () => {
  assert.deepEqual(p('buy milk'), { kind: 'quest', date: T, text: 'buy milk' });
  assert.equal(p('buy birthday gift').kind, 'quest');
});

test('digest + evening preview render', () => {
  const d = buildMorningDigest(cal, [], '2026-11-01');
  assert.match(d, /Laundry/);
  assert.doesNotMatch(d, /Done thing/);
  assert.match(d, /Dentist/);
  assert.match(d, /Sam's birthday in 11 days/);
  assert.match(d, /Passport expires in 19 days/);
  assert.match(d, /Fuel price changes Wednesday/);
  console.log('\n' + d + '\n');
  const e = buildEveningPreview(cal, [], '2026-11-01');
  assert.match(e, /3:00 PM/);
  console.log(e);
  assert.equal(buildEveningPreview({}, [], '2026-11-04'), null);
});
