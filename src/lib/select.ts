import type { Project, Settings, Task, Tone, Entry } from './types';
import { addDays, elapsed, isDone, isoDate, isOverdue, outcome, parseDate, startOfDay, todayISO } from './time';

export function statusTone(name: string, list: { name: string; tone: Tone }[]): Tone {
  return list.find(s => s.name === name)?.tone ?? 'neutral';
}

/** Tasks that appear in My Day today */
export function myDayTasks(tasks: Task[], today = todayISO()) {
  return tasks.filter(t =>
    t.status !== 'Archived' &&
    ((t.myDayDate && t.myDayDate <= today && (!t.finishedAt || isoDate(new Date(t.finishedAt)) === today)) ||
     (t.runStartedAt && !t.finishedAt)));
}

/** The task shown in the "In progress" card: running, else the most recently paused in-progress task in My Day. */
export function activeTask(tasks: Task[]): Task | undefined {
  const running = tasks.find(t => t.runStartedAt && !t.finishedAt);
  if (running) return running;
  return tasks
    .filter(t => !t.finishedAt && t.status === 'In progress' && t.elapsedMs > 0)
    .sort((a, b) => (b.firstStartedAt ?? '').localeCompare(a.firstStartedAt ?? ''))[0];
}

export const needsReflection = (tasks: Task[], now = Date.now()) =>
  tasks.filter(t => t.reflection === 'needed' && (!t.snoozeUntil || new Date(t.snoozeUntil).getTime() <= now))
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));

export function projectProgress(tasks: Task[], p: Project) {
  const list = tasks.filter(t => t.projectId === p.id && t.status !== 'Archived');
  const done = list.filter(isDone).length;
  return { total: list.length, done, open: list.length - done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

export const coverColor: Record<string, [string, string]> = {
  blue: ['var(--primary-container)', 'var(--on-primary-container)'],
  teal: ['#cbe6ff', '#001e30'],
  green: ['var(--success-container)', 'var(--on-success-container)'],
  amber: ['var(--warning-container)', 'var(--on-warning-container)'],
  rose: ['#ffd9e2', '#3e001d'],
  purple: ['var(--tertiary-container)', 'var(--on-tertiary-container)'],
  grey: ['var(--surface-highest)', 'var(--on-surface-variant)'],
};

export function tagTone(tag: string): 'warn' | 'err' | 'ok' | 'ter' | undefined {
  const t = tag.toLowerCase();
  if (t.includes('delay')) return 'warn';
  if (t.includes('mistake')) return 'err';
  if (t.includes('lesson')) return 'ok';
  if (t.includes('idea')) return 'ter';
  return undefined;
}
export const tagChipTone = (tag: string): [string, string] | undefined => {
  const k = tagTone(tag);
  if (k === 'warn') return ['var(--warning-container)', 'var(--on-warning-container)'];
  if (k === 'err') return ['var(--error-container)', 'var(--on-error-container)'];
  if (k === 'ok') return ['var(--success-container)', 'var(--on-success-container)'];
  if (k === 'ter') return ['var(--tertiary-container)', 'var(--on-tertiary-container)'];
  return undefined;
};
export const tagDot = (tag: string) => ({ warn: 'var(--warning)', err: 'var(--error)', ok: 'var(--success)', ter: 'var(--tertiary)' } as Record<string, string>)[tagTone(tag) ?? ''] ?? 'var(--outline)';

// ---------- Insights ----------
export interface InsightRange { from: string; to: string; days: number }
export function rangeFor(kind: string, custom?: [string, string]): InsightRange {
  const to = todayISO();
  if (kind === 'custom' && custom) {
    const days = Math.round((parseDate(custom[1]).getTime() - parseDate(custom[0]).getTime()) / 86400000) + 1;
    return { from: custom[0], to: custom[1], days };
  }
  if (kind === 'month') { const n = new Date(); const from = isoDate(new Date(n.getFullYear(), n.getMonth(), 1)); return { from, to, days: n.getDate() }; }
  const days = kind === '7' ? 7 : kind === '14' ? 14 : 30;
  return { from: isoDate(addDays(new Date(), -(days - 1))), to, days };
}

export function insights(tasks: Task[], s: Settings, r: InsightRange) {
  const finishedIn = (from: string, to: string) => tasks.filter(t => t.finishedAt && t.estimateMin && isoDate(new Date(t.finishedAt)) >= from && isoDate(new Date(t.finishedAt)) <= to);
  const list = finishedIn(r.from, r.to);
  const within = list.filter(t => elapsed(t) <= t.estimateMin! * 60000 + 59999);
  const over = list.filter(t => !within.includes(t));
  const pct = list.length ? Math.round((within.length / list.length) * 100) : null;
  const prevTo = isoDate(addDays(parseDate(r.from), -1)), prevFrom = isoDate(addDays(parseDate(r.from), -r.days));
  const prev = finishedIn(prevFrom, prevTo);
  const prevPct = prev.length ? Math.round((prev.filter(t => elapsed(t) <= t.estimateMin! * 60000 + 59999).length / prev.length) * 100) : null;
  const avgOver = over.length ? Math.round(over.reduce((a, t) => a + (elapsed(t) / 60000 - t.estimateMin!), 0) / over.length) : 0;

  // by day (or by week beyond 31 days)
  const byWeek = r.days > 31;
  const buckets: { label: string; from: string; to: string; pct: number | null; n: number; within: number }[] = [];
  const start = parseDate(r.from);
  const step = byWeek ? 7 : 1;
  for (let i = 0; i < r.days; i += step) {
    const a = isoDate(addDays(start, i)), b = isoDate(addDays(start, Math.min(i + step - 1, r.days - 1)));
    const l = list.filter(t => { const d = isoDate(new Date(t.finishedAt!)); return d >= a && d <= b; });
    const w = l.filter(t => within.includes(t)).length;
    buckets.push({ label: a, from: a, to: b, n: l.length, within: w, pct: l.length ? Math.round((w / l.length) * 100) : null });
  }

  // streak: consecutive days (ending today/yesterday) where every finished task was within estimate
  const dayOk = (d: string) => { const l = tasks.filter(t => t.finishedAt && t.estimateMin && isoDate(new Date(t.finishedAt)) === d); return l.length ? l.every(t => elapsed(t) <= t.estimateMin! * 60000 + 59999) : null; };
  let streak = 0, best = 0, run = 0, broken = false;
  for (let i = 0; i < 120; i++) {
    const ok = dayOk(isoDate(addDays(new Date(), -i)));
    if (ok === null) continue;
    if (ok) { run++; if (!broken) streak = run; }
    else { broken = true; best = Math.max(best, run); run = 0; }
  }
  best = Math.max(best, run, streak);

  // due dates met
  const withDue = list.filter(t => t.dueDate);
  const met = withDue.filter(t => (outcome(t, s).lateMin ?? 0) === 0).length;
  const duePct = withDue.length ? Math.round((met / withDue.length) * 100) : null;

  const bucketLen = [
    { label: 'Under 30 min', test: (m: number) => m < 30 },
    { label: '30–60 min', test: (m: number) => m >= 30 && m <= 60 },
    { label: '1–2 hours', test: (m: number) => m > 60 && m <= 120 },
    { label: 'Over 2 hours', test: (m: number) => m > 120 },
  ].map(b => { const l = list.filter(t => b.test(t.estimateMin!)); const o = l.length ? Math.round(l.reduce((a, t) => a + Math.max(0, elapsed(t) / 60000 - t.estimateMin!), 0) / l.length) : null; return { label: b.label, over: o, n: l.length }; });

  return { list, pct, prevPct, avgOver, buckets, byWeek, streak, best, duePct, bucketLen, within: within.length, overCount: over.length };
}

export function overrunByProject(tasks: Task[], projects: Project[], r: InsightRange) {
  return projects.map(p => {
    const l = tasks.filter(t => t.projectId === p.id && t.finishedAt && t.estimateMin && isoDate(new Date(t.finishedAt)) >= r.from && isoDate(new Date(t.finishedAt)) <= r.to);
    const over = l.length ? Math.round(l.reduce((a, t) => a + (elapsed(t) / 60000 - t.estimateMin!), 0) / l.length) : null;
    return { p, over, n: l.length };
  }).filter(x => x.n > 0).sort((a, b) => (b.over ?? 0) - (a.over ?? 0));
}

export function avgOverrunMin(tasks: Task[]) {
  const from = isoDate(addDays(new Date(), -30));
  const l = tasks.filter(t => t.finishedAt && t.estimateMin && isoDate(new Date(t.finishedAt)) >= from && elapsed(t) > t.estimateMin * 60000 + 59999);
  if (l.length < 3) return null;
  return Math.round(l.reduce((a, t) => a + (elapsed(t) / 60000 - t.estimateMin!), 0) / l.length);
}

export function entriesOnDay(entries: Entry[], iso: string) {
  return entries.filter(e => isoDate(new Date(e.whenAt)) === iso);
}

export const isLateUnfinished = (t: Task, s: Settings) => isOverdue(t, s);
export const dayStart = (iso: string) => startOfDay(parseDate(iso));
