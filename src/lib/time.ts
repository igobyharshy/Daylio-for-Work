import type { Task, Settings, WorkSession, Repeat } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO(now = new Date()): string { return isoDate(now); }
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function sameDay(a: Date, b: Date) { return isoDate(a) === isoDate(b); }
export function atTime(dateISO: string, hhmm: string): Date {
  const d = parseDate(dateISO);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m || 0, 0, 0);
  return d;
}
export function hhmm(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = MONTHS.map(m => m.slice(0, 3));

/** "7:00 pm" */
export function fmtClock(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  let h = x.getHours();
  const m = x.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}
export function fmtHHMM(s: string): string { const [h, m] = s.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return fmtClock(d); }
/** "Thu 12 Nov" */
export function fmtDayShort(d: Date | string) { const x = typeof d === 'string' ? (d.length === 10 ? parseDate(d) : new Date(d)) : d; return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`; }
/** "Thu, 12 Nov" */
export function fmtDayComma(d: Date | string) { const x = typeof d === 'string' ? (d.length === 10 ? parseDate(d) : new Date(d)) : d; return `${DOW[x.getDay()]}, ${x.getDate()} ${MON[x.getMonth()]}`; }
/** "Thursday, 12 November" */
export function fmtDayLong(d: Date) { return `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function fmtMonDay(s: string) { const d = parseDate(s); return `${MON[d.getMonth()]} ${d.getDate()}`; }
export const dowShort = (d: Date) => DOW[d.getDay()];

/** relative day word: Today / Tomorrow / Yesterday / Fri / 12 Nov */
export function relDay(dateISO: string, now = new Date()): string {
  const d = parseDate(dateISO);
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return DOW[d.getDay()];
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 1:29:45 or 29:45 */
export function fmtTimer(ms: number): string {
  const neg = ms < 0;
  let s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const body = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return neg ? `+${body}` : body;
}
/** 2h 5m · 45m · 2h */
export function fmtMin(min: number): string {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r}m`;
  if (!r) return `${h}h`;
  return `${h}h ${r}m`;
}
export const fmtMs = (ms: number) => (ms > 0 && ms < 60000 ? '<1m' : fmtMin(ms / 60000));

// ---------- task maths ----------
export const totalEstimateMin = (t: Task) => (t.estimateMin ?? 0) + t.reEstimates.reduce((a, r) => a + r.addMin, 0);
export function elapsed(t: Task, now = Date.now()): number {
  return t.elapsedMs + (t.runStartedAt ? Math.max(0, now - new Date(t.runStartedAt).getTime()) : 0);
}
export const isRunning = (t: Task) => !!t.runStartedAt;

/**
 * The stretches of real work on a task. Tasks timed since the Timeline release log every session.
 * Older tasks only know first start → finish (or → last pause / now), so they show as one stretch.
 */
export function workSessions(t: Task): WorkSession[] {
  if (t.sessions?.length) return t.sessions;
  if (!t.firstStartedAt) return [];
  if (t.finishedAt) return [{ s: t.firstStartedAt, e: t.finishedAt }];
  if (t.runStartedAt) return [{ s: t.firstStartedAt, e: null }];
  const end = t.pausedAt ?? new Date(new Date(t.firstStartedAt).getTime() + t.elapsedMs).toISOString();
  return [{ s: t.firstStartedAt, e: end < t.firstStartedAt ? t.firstStartedAt : end }];
}
/** planned slot: start → start + estimate (30 min when there's no estimate yet) */
export const PLAN_DEFAULT_MIN = 30;
export function plannedRange(t: Task): [Date, Date] | null {
  if (!t.plannedStart) return null;
  const s = new Date(t.plannedStart);
  const len = totalEstimateMin(t) || PLAN_DEFAULT_MIN;
  return [s, new Date(s.getTime() + len * 60000)];
}
export const isDone = (t: Task) => !!t.finishedAt;
/**
 * What a timer shows, in either direction. Down: time left, ring empties. Up: time worked, ring fills.
 * Without an estimate both just count up.
 */
export function timerView(t: Task, now: number, dir: 'down' | 'up' = 'down') {
  const el = elapsed(t, now);
  const total = totalEstimateMin(t) * 60000;
  if (!total) return { main: fmtTimer(el), sub: 'elapsed', over: false, pct: 0, line: `${fmtTimer(el)} elapsed` };
  const rem = total - el;
  const over = rem < 0;
  const est = fmtMin(total / 60000);
  if (dir === 'up') return {
    main: fmtTimer(el), sub: over ? `${fmtTimer(rem)} over` : `of ${est}`, over,
    pct: over ? 100 : (el / total) * 100, line: over ? `${fmtTimer(el)} · ${fmtTimer(rem)} over` : `${fmtTimer(el)} of ${est}`,
  };
  return {
    main: fmtTimer(rem), sub: over ? 'over estimate' : `left of ${est}`, over,
    pct: over ? 100 : (rem / total) * 100, line: over ? `${fmtTimer(rem)} over` : `${fmtTimer(rem)} left`,
  };
}

export function remainingMs(t: Task, now = Date.now()) {
  return totalEstimateMin(t) * 60000 - elapsed(t, now);
}
/** estimate ran out on an unfinished task that has been started */
export function isOverEstimate(t: Task, now = Date.now()) {
  if (isDone(t) || !t.estimateMin) return false;
  return elapsed(t, now) > 0 && remainingMs(t, now) <= 0;
}
export function dueAt(t: { dueDate: string | null; dueTime: string | null }, s: Settings): Date | null {
  if (!t.dueDate) return null;
  return atTime(t.dueDate, t.dueTime || s.workEnd);
}
export function startBy(t: Task, s: Settings): Date | null {
  const d = dueAt(t, s);
  if (!d || !t.estimateMin) return null;
  return new Date(d.getTime() - totalEstimateMin(t) * 60000);
}
export function isOverdue(t: Task, s: Settings, now = Date.now()) {
  if (isDone(t) || !t.dueDate) return false;
  const d = dueAt(t, s)!;
  if (!t.dueTime) return startOfDay(new Date(now)).getTime() > parseDate(t.dueDate).getTime();
  return now > d.getTime();
}
export interface Outcome { tookMs: number; diffMin: number | null; earlyMin: number | null; lateMin: number | null; /** repeating task: due date of the next one */ next?: string | null }
export function outcome(t: Task, s: Settings): Outcome {
  const tookMs = elapsed(t);
  const diffMin = t.estimateMin ? Math.round(tookMs / 60000 - t.estimateMin) : null;
  let earlyMin: number | null = null, lateMin: number | null = null;
  const d = dueAt(t, s);
  if (d && t.finishedAt) {
    const delta = Math.round((d.getTime() - new Date(t.finishedAt).getTime()) / 60000);
    if (delta >= 0) earlyMin = delta; else lateMin = -delta;
  }
  return { tookMs, diffMin, earlyMin, lateMin };
}
export function dueLabel(t: { dueDate: string | null; dueTime: string | null }, now = new Date()): string | null {
  if (!t.dueDate) return null;
  const r = relDay(t.dueDate, now);
  return `Due ${r}${t.dueTime ? ' ' + fmtHHMM(t.dueTime) : ''}`;
}
export function inWorkDay(s: Settings, now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = s.workStart.split(':').map(Number);
  const [eh, em] = s.workEnd.split(':').map(Number);
  return m >= sh * 60 + sm && m < eh * 60 + em;
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

/** Quick add: trailing "today / tomorrow / mon…sun" and "30m / 1h / 1h30 / 1h 30m" become chips. */
export function parseQuickAdd(raw: string, now = new Date()): { title: string; date?: string; estimate?: number; repeat?: Repeat } {
  let title = raw.trimEnd();
  const out: { title: string; date?: string; estimate?: number; repeat?: Repeat } = { title };
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  for (let i = 0; i < 3; i++) {
    const est = title.match(/\s(\d{1,2})h(?:\s?(\d{1,2})m?)?$|\s(\d{1,3})m(?:in)?$/i);
    if (est && out.estimate == null) {
      const min = est[3] ? Number(est[3]) : Number(est[1]) * 60 + Number(est[2] ?? 0);
      if (min > 0 && min <= 24 * 60) { out.estimate = min; title = title.slice(0, est.index).trimEnd(); continue; }
    }
    // "daily", "every day", "weekdays", "weekends", "every monday", "weekly", "monthly"
    const rep = out.repeat ? null : title.match(/\s(daily|every\s?day|weekdays|every\s?weekday|weekends|every\s?weekend|weekly|monthly|every\s(mon|tue|wed|thu|fri|sat|sun)(?:day)?)$/i);
    if (rep) {
      const w = rep[1].toLowerCase().replace(/\s+/g, ' ');
      if (/^(daily|every ?day)$/.test(w)) out.repeat = { freq: 'day', every: 1 };
      else if (/weekday/.test(w)) out.repeat = { freq: 'week', every: 1, days: [0, 1, 2, 3, 4] };
      else if (/weekend/.test(w)) out.repeat = { freq: 'week', every: 1, days: [5, 6] };
      else if (w === 'weekly') out.repeat = { freq: 'week', every: 1, days: [weekdayOf(isoDate(now))] };
      else if (w === 'monthly') out.repeat = { freq: 'month', every: 1 };
      else if (rep[2]) out.repeat = { freq: 'week', every: 1, days: [(days.indexOf(rep[2].toLowerCase()) + 6) % 7] };
      if (out.repeat) { title = title.slice(0, rep.index).trimEnd(); continue; }
    }
    const day = title.match(/\s(today|tomorrow|tmrw|mon|tue|wed|thu|fri|sat|sun)(?:day)?$/i);
    if (day && out.date == null) {
      const w = day[1].toLowerCase();
      let d = new Date(now);
      if (w === 'tomorrow' || w === 'tmrw') d = addDays(now, 1);
      else if (w !== 'today') { const target = days.indexOf(w.slice(0, 3)); let diff = (target - now.getDay() + 7) % 7; if (diff === 0) diff = 7; d = addDays(now, diff); }
      out.date = isoDate(d); title = title.slice(0, day.index).trimEnd(); continue;
    }
    break;
  }
  out.title = title;
  return out;
}

// ---------- repeating tasks ----------
/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (iso: string) => (parseDate(iso).getDay() + 6) % 7;
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const mondayOf = (iso: string) => { const d = parseDate(iso); return addDays(d, -((d.getDay() + 6) % 7)).getTime(); };
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

/** first date after `fromISO` that the rule lands on (for "every N weeks", weeks count from `fromISO`'s week) */
export function nextRepeatDate(r: Repeat, fromISO: string): string {
  const every = Math.max(1, r.every || 1);
  if (r.freq === 'day') return isoDate(addDays(parseDate(fromISO), every));
  if (r.freq === 'month') {
    const f = parseDate(fromISO), day = f.getDate();
    const m = new Date(f.getFullYear(), f.getMonth() + every, 1);
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return isoDate(new Date(m.getFullYear(), m.getMonth(), Math.min(day, last)));
  }
  const days = r.days?.length ? r.days : [weekdayOf(fromISO)];
  const w0 = mondayOf(fromISO);
  let d = addDays(parseDate(fromISO), 1);
  for (let i = 0; i < 7 * every * 2 + 7; i++, d = addDays(d, 1)) {
    const iso = isoDate(d);
    const weeks = Math.round((mondayOf(iso) - w0) / (7 * 864e5));
    if (weeks % every === 0 && days.includes(weekdayOf(iso))) return iso;
  }
  return isoDate(addDays(parseDate(fromISO), 7 * every));
}
/** `fromISO` itself if the rule lands on it, else the next date */
export function firstRepeatDate(r: Repeat, fromISO: string): string {
  if (r.freq === 'week' && r.days?.length && !r.days.includes(weekdayOf(fromISO))) return nextRepeatDate(r, fromISO);
  return fromISO;
}
/** the next occurrence after a finished one: never in the past, so a late finish doesn't leave a backlog */
export function nextOccurrence(r: Repeat, dueISO: string | null, today = todayISO()): string {
  let d = nextRepeatDate(r, dueISO ?? today);
  for (let i = 0; d < today && i < 400; i++) d = nextRepeatDate(r, d);
  return d;
}
export function repeatLabel(r: Repeat | null | undefined, dueISO?: string | null): string {
  if (!r) return 'Doesn’t repeat';
  const n = Math.max(1, r.every || 1);
  if (r.freq === 'day') return n === 1 ? 'Daily' : `Every ${n} days`;
  if (r.freq === 'month') { const d = dueISO ? parseDate(dueISO).getDate() : null; return (n === 1 ? 'Monthly' : `Every ${n} months`) + (d ? ` on the ${ordinal(d)}` : ''); }
  const days = [...(r.days ?? [])].sort();
  const key = days.join('');
  const base = key === '01234' ? 'Weekdays' : key === '56' ? 'Weekends' : key === '0123456' ? 'Every day' :
    days.length === 1 ? `Every ${WD_LONG[days[0]]}` : days.length ? `Every ${days.map(x => WD[x]).join(', ')}` : 'Weekly';
  return n === 1 ? base : `${base} · every ${n} weeks`;
}
export const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
