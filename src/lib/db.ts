import type { Project, Task, Entry, Notif, TimeBlock } from './types';
import type { Checkin } from './trackers';

// snake_case rows <-> camelCase app objects
type Row = Record<string, any>;
const trimTime = (t: string | null) => (t ? t.slice(0, 5) : null);

export const projectFromRow = (r: Row): Project => ({
  id: r.id, name: r.name, emoji: r.emoji, cover: r.cover,
  // "Archived" used to be a status; it is now a separate flag
  status: r.status === 'Archived' ? 'Done' : r.status,
  archived: !!r.archived || r.status === 'Archived',
  startDate: r.start_date, dueDate: r.due_date, dueTime: trimTime(r.due_time), tags: r.tags ?? [],
  isInbox: r.is_inbox, sort: r.sort, isSample: r.is_sample, createdAt: r.created_at,
});
export const projectToRow = (p: Partial<Project>): Row => strip({
  id: p.id, name: p.name, emoji: p.emoji, cover: p.cover, status: p.status,
  start_date: p.startDate, due_date: p.dueDate, due_time: p.dueTime, tags: p.tags,
  is_inbox: p.isInbox, archived: p.archived, sort: p.sort, is_sample: p.isSample, created_at: p.createdAt,
});

export const taskFromRow = (r: Row): Task => ({
  id: r.id, projectId: r.project_id, title: r.title, status: r.status,
  dueDate: r.due_date, dueTime: trimTime(r.due_time), estimateMin: r.estimate_min,
  reEstimates: r.re_estimates ?? [], myDayDate: r.my_day_date, remindAt: r.remind_at, remindedAt: r.reminded_at,
  steps: r.steps ?? [], note: r.note ?? '', elapsedMs: Number(r.elapsed_ms ?? 0), runStartedAt: r.run_started_at, pausedAt: r.paused_at ?? null,
  firstStartedAt: r.first_started_at, finishedAt: r.finished_at, plannedStart: r.planned_start ?? null, sessions: Array.isArray(r.sessions) ? r.sessions : [],
  reflection: r.reflection, snoozeUntil: r.snooze_until,
  sort: r.sort, isSample: r.is_sample, createdAt: r.created_at,
});
export const taskToRow = (t: Partial<Task>): Row => strip({
  id: t.id, project_id: t.projectId, title: t.title, status: t.status, due_date: t.dueDate, due_time: t.dueTime,
  estimate_min: t.estimateMin, re_estimates: t.reEstimates, my_day_date: t.myDayDate, remind_at: t.remindAt,
  reminded_at: t.remindedAt, steps: t.steps, note: t.note, elapsed_ms: t.elapsedMs, run_started_at: t.runStartedAt, paused_at: t.pausedAt,
  first_started_at: t.firstStartedAt, finished_at: t.finishedAt, planned_start: t.plannedStart, sessions: t.sessions, reflection: t.reflection, snooze_until: t.snoozeUntil,
  sort: t.sort, is_sample: t.isSample, created_at: t.createdAt,
});

export const entryFromRow = (r: Row): Entry => ({
  id: r.id, body: r.body, whenAt: r.when_at, tags: r.tags ?? [], taskIds: r.task_ids ?? [], trackerValues: r.tracker_values ?? {}, isSample: r.is_sample, createdAt: r.created_at,
});
export const entryToRow = (e: Partial<Entry>): Row => strip({
  id: e.id, body: e.body, when_at: e.whenAt, tags: e.tags, task_ids: e.taskIds, tracker_values: e.trackerValues, is_sample: e.isSample, created_at: e.createdAt,
});

export const notifFromRow = (r: Row): Notif => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, taskId: r.task_id, readAt: r.read_at, createdAt: r.created_at,
});
export const notifToRow = (n: Partial<Notif>): Row => strip({
  id: n.id, kind: n.kind, title: n.title, body: n.body, task_id: n.taskId, read_at: n.readAt, created_at: n.createdAt,
});

export const blockFromRow = (r: Row): TimeBlock => ({
  id: r.id, title: r.title ?? '', kind: r.kind ?? 'other', startAt: r.start_at, endAt: r.end_at, note: r.note ?? '', createdAt: r.created_at,
});
export const blockToRow = (b: Partial<TimeBlock>): Row => strip({
  id: b.id, title: b.title, kind: b.kind, start_at: b.startAt, end_at: b.endAt, note: b.note, created_at: b.createdAt,
});

export const checkinFromRow = (r: Row): Checkin => ({ id: r.id, day: r.day, values: r.values ?? {}, skipped: r.skipped, isSample: r.is_sample });
export const checkinToRow = (c: Partial<Checkin>): Row => strip({ id: c.id, day: c.day, values: c.values, skipped: c.skipped, is_sample: c.isSample });

function strip(o: Row): Row {
  const r: Row = {};
  for (const k in o) if (o[k] !== undefined) r[k] = o[k];
  return r;
}
