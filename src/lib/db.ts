import type { Project, Task, Entry, Notif } from './types';

// snake_case rows <-> camelCase app objects
type Row = Record<string, any>;
const trimTime = (t: string | null) => (t ? t.slice(0, 5) : null);

export const projectFromRow = (r: Row): Project => ({
  id: r.id, name: r.name, emoji: r.emoji, cover: r.cover, status: r.status,
  startDate: r.start_date, dueDate: r.due_date, dueTime: trimTime(r.due_time), tags: r.tags ?? [],
  isInbox: r.is_inbox, sort: r.sort, isSample: r.is_sample, createdAt: r.created_at,
});
export const projectToRow = (p: Partial<Project>): Row => strip({
  id: p.id, name: p.name, emoji: p.emoji, cover: p.cover, status: p.status,
  start_date: p.startDate, due_date: p.dueDate, due_time: p.dueTime, tags: p.tags,
  is_inbox: p.isInbox, sort: p.sort, is_sample: p.isSample, created_at: p.createdAt,
});

export const taskFromRow = (r: Row): Task => ({
  id: r.id, projectId: r.project_id, title: r.title, status: r.status,
  dueDate: r.due_date, dueTime: trimTime(r.due_time), estimateMin: r.estimate_min,
  reEstimates: r.re_estimates ?? [], myDayDate: r.my_day_date, remindAt: r.remind_at, remindedAt: r.reminded_at,
  steps: r.steps ?? [], note: r.note ?? '', elapsedMs: Number(r.elapsed_ms ?? 0), runStartedAt: r.run_started_at,
  firstStartedAt: r.first_started_at, finishedAt: r.finished_at, reflection: r.reflection, snoozeUntil: r.snooze_until,
  sort: r.sort, isSample: r.is_sample, createdAt: r.created_at,
});
export const taskToRow = (t: Partial<Task>): Row => strip({
  id: t.id, project_id: t.projectId, title: t.title, status: t.status, due_date: t.dueDate, due_time: t.dueTime,
  estimate_min: t.estimateMin, re_estimates: t.reEstimates, my_day_date: t.myDayDate, remind_at: t.remindAt,
  reminded_at: t.remindedAt, steps: t.steps, note: t.note, elapsed_ms: t.elapsedMs, run_started_at: t.runStartedAt,
  first_started_at: t.firstStartedAt, finished_at: t.finishedAt, reflection: t.reflection, snooze_until: t.snoozeUntil,
  sort: t.sort, is_sample: t.isSample, created_at: t.createdAt,
});

export const entryFromRow = (r: Row): Entry => ({
  id: r.id, body: r.body, whenAt: r.when_at, tags: r.tags ?? [], taskIds: r.task_ids ?? [], isSample: r.is_sample, createdAt: r.created_at,
});
export const entryToRow = (e: Partial<Entry>): Row => strip({
  id: e.id, body: e.body, when_at: e.whenAt, tags: e.tags, task_ids: e.taskIds, is_sample: e.isSample, created_at: e.createdAt,
});

export const notifFromRow = (r: Row): Notif => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, taskId: r.task_id, readAt: r.read_at, createdAt: r.created_at,
});
export const notifToRow = (n: Partial<Notif>): Row => strip({
  id: n.id, kind: n.kind, title: n.title, body: n.body, task_id: n.taskId, read_at: n.readAt, created_at: n.createdAt,
});

function strip(o: Row): Row {
  const r: Row = {};
  for (const k in o) if (o[k] !== undefined) r[k] = o[k];
  return r;
}
