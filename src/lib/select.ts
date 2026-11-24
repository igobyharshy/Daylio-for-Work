import type { Project, Settings, Task, Tone, Entry, StatusDef } from './types';
import { CORE_STATUSES } from './types';
import { addDays, elapsed, isDone, isoDate, isOverdue, outcome, parseDate, startOfDay, todayISO } from './time';

export function statusTone(name: string, list: { name: string; tone: Tone }[]): Tone {
  return list.find(s => s.name === name)?.tone ?? 'neutral';
}

/** ids of archived projects: their tasks leave My Day, reminders and the Now card */
export const archivedIds = (projects: Project[]) => new Set(projects.filter(p => p.archived).map(p => p.id));
export const isLive = (t: Task, archived: Set<string>) => t.status !== 'Archived' && !(t.projectId && archived.has(t.projectId));

/** once the user has 3 real finished tasks, sample data stops counting */
export const hideSample = (tasks: Task[]) => tasks.filter(t => !t.isSample && t.finishedAt).length >= 3;
export const realTasks = (tasks: Task[]) => (hideSample(tasks) ? tasks.filter(t => !t.isSample) : tasks);

export const inMyDay = (t: Task, today = todayISO()) => !!t.myDayDate && t.myDayDate <= today;

/** Tasks that appear in My Day today. A running task is always in My Day. */
export function myDayTasks(tasks: Task[], projects: Project[] = [], today = todayISO()) {
  const arch = archivedIds(projects);
  return tasks.filter(t => (t.runStartedAt && !t.finishedAt) || (isLive(t, arch) &&
    inMyDay(t, today) && (!t.finishedAt || isoDate(new Date(t.finishedAt)) === today)));
}

/**
 * The task in the "Now" card: the running one; otherwise the most recently paused task in My Day,
 * but only if the last timer action was a pause (after you tick something done, the card is empty).
 */
export function activeTask(tasks: Task[], projects: Project[] = []): Task | undefined {
  const running = tasks.find(t => t.runStartedAt && !t.finishedAt);
  if (running) return running;
  const arch = archivedIds(projects);
  const lastFinish = tasks.reduce((m, t) => (t.finishedAt && t.finishedAt > m ? t.finishedAt : m), '');
  const paused = tasks
    .filter(t => !t.finishedAt && t.pausedAt && t.elapsedMs > 0 && inMyDay(t) && isLive(t, arch))
    .sort((a, b) => (b.pausedAt ?? '').localeCompare(a.pausedAt ?? ''))[0];
  return paused && paused.pausedAt! > lastFinish ? paused : undefined;
}

/** One set of groups for every list and board: settings order, core three always, others only when used. */
export function statusGroups(statuses: StatusDef[], tasks: Task[]): { def: StatusDef; tasks: Task[] }[] {
  const names = statuses.map(s => s.name);
  const home = (t: Task) => (names.includes(t.status) && t.status !== 'Archived' ? t.status : t.finishedAt ? 'Done' : 'Not started');
  const present = new Set(tasks.map(home));
  const defs = statuses.filter(s => s.name !== 'Archived' && (CORE_STATUSES.includes(s.name) || present.has(s.name)));
  CORE_STATUSES.forEach(c => { if (!defs.some(d => d.name === c)) defs.push({ name: c, tone: c === 'In progress' ? 'blue' : c === 'Done' ? 'green' : 'neutral' }); });
  return defs.map(def => ({ def, tasks: tasks.filter(t => home(t) === def.name).sort((a, b) => a.sort - b.sort) }));
}

/** sort value that places a task between two neighbours */
export function sortBetween(before?: Task, after?: Task) {
  if (before && after) return (before.sort + after.sort) / 2;
  if (before) return before.sort + 1;
  if (after) return after.sort - 1;
  return Date.now() / 1e6;
}

export const needsReflection = (tasks: Task[], now = Date.now()) =>
  realTasks(tasks).filter(t => t.reflection === 'needed' && (!t.snoozeUntil || new Date(t.snoozeUntil).getTime() <= now))
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));

export function projectProgress(tasks: Task[], p: Project) {
  const list = tasks.filter(t => t.projectId === p.id && t.status !== 'Archived');
  const done = list.filter(isDone).length;
  return { total: list.length, done, open: list.length - done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

/** estimate vs actual for a project (finished tasks with an estimate) */
export function projectStats(tasks: Task[], p: Project) {
  const list = tasks.filter(t => t.projectId === p.id && t.status !== 'Archived');
  const estMin = list.reduce((a, t) => a + (t.estimateMin ?? 0), 0);
  const spentMs = list.reduce((a, t) => a + elapsed(t), 0);
  const scored = list.filter(t => t.finishedAt && t.estimateMin);
  const within = scored.filter(t => elapsed(t) <= t.estimateMin! * 60000 + 59999).length;
  return { estMin, spentMs, scored: scored.length, pct: scored.length ? Math.round((within / scored.length) * 100) : null };
}

/** project covers: seven distinct colours that carry no meaning (pink is reserved for "over estimate") */
export const coverColor: Record<string, [string, string]> = {
  purple: ['var(--c-purple-bg)', 'var(--c-purple-fg)'],
  blue: ['var(--c-blue-bg)', 'var(--c-blue-fg)'],
  teal: ['var(--c-teal-bg)', 'var(--c-teal-fg)'],
  green: ['var(--c-green-bg)', 'var(--c-green-fg)'],
  amber: ['var(--c-yellow-bg)', 'var(--c-yellow-fg)'],
  rose: ['var(--c-peach-bg)', 'var(--c-peach-fg)'],
  grey: ['var(--c-grey-bg)', 'var(--c-grey-fg)'],
};
export const COVER_NAMES: Record<string, string> = { purple: 'Lavender', blue: 'Blue', teal: 'Teal', green: 'Green', amber: 'Yellow', rose: 'Peach', grey: 'Grey' };

/** each journal tag gets its own colour; known tags have fixed ones, others take the next free colour */
const TAG_PALETTE: [string, string, string][] = [
  ['var(--c-blue-bg)', 'var(--c-blue-fg)', 'var(--c-blue-dot)'],
  ['var(--c-teal-bg)', 'var(--c-teal-fg)', 'var(--c-teal-dot)'],
  ['var(--c-yellow-bg)', 'var(--c-yellow-fg)', 'var(--c-yellow-dot)'],
  ['var(--c-peach-bg)', 'var(--c-peach-fg)', 'var(--c-peach-dot)'],
  ['var(--c-grey-bg)', 'var(--c-grey-fg)', 'var(--c-grey-dot)'],
];
const KNOWN_TAGS: Record<string, [string, string, string]> = {
  mistake: ['var(--error-container)', 'var(--on-error-container)', 'var(--error)'],
  'task delay': ['var(--tertiary-container)', 'var(--on-tertiary-container)', 'var(--tertiary)'],
  lesson: ['var(--primary-container)', 'var(--on-primary-container)', 'var(--primary)'],
  idea: ['var(--c-teal-bg)', 'var(--c-teal-fg)', 'var(--c-teal-dot)'],
  win: ['var(--c-green-bg)', 'var(--c-green-fg)', 'var(--c-green-dot)'],
};
function tagColors(tag: string): [string, string, string] {
  const k = tag.toLowerCase();
  if (KNOWN_TAGS[k]) return KNOWN_TAGS[k];
  let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
/** kept for callers that pass a Tag kind; colours now come from tagChipTone / tagDot */
export function tagTone(_tag: string): undefined { return undefined; }
export const tagChipTone = (tag: string): [string, string] => { const c = tagColors(tag); return [c[0], c[1]]; };
export const tagDot = (tag: string) => tagColors(tag)[2];

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
