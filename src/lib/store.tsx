import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Entry, Notif, Project, Settings, Task, ID } from './types';
import { DEFAULT_SETTINGS } from './types';
import { checkinFromRow, checkinToRow, entryFromRow, entryToRow, notifFromRow, notifToRow, projectFromRow, projectToRow, taskFromRow, taskToRow } from './db';
import type { Checkin, TrackerValues } from './trackers';
import { buildSample } from './seed';
import { elapsed, outcome, todayISO, uid, type Outcome } from './time';
import { useToast } from '../ui/Toast';

export interface StoreState {
  loaded: boolean;
  projects: Project[];
  tasks: Task[];
  entries: Entry[];
  notifs: Notif[];
  checkins: Checkin[];
  settings: Settings;
  displayName: string;
  email: string;
  userId: string;
}

export interface Store extends StoreState {
  inbox: Project | undefined;
  projectById: (id: ID | null | undefined) => Project | undefined;
  taskById: (id: ID | null | undefined) => Task | undefined;
  addTask: (t: Partial<Task>) => Task;
  updateTask: (id: ID, patch: Partial<Task>) => void;
  deleteTask: (id: ID) => void;
  startTask: (id: ID) => void;
  pauseTask: (id: ID) => void;
  finishTask: (id: ID, finishedAt?: Date) => Outcome | null;
  reopenTask: (id: ID) => void;
  /** change the status label; leaving Done un-ticks a finished task. Never ticks. */
  setStatus: (id: ID, status: string) => void;
  /** remove locally now, delete on the server after the undo window; returns undo */
  removeTask: (id: ID) => () => void;
  removeEntry: (id: ID) => () => void;
  removeProject: (id: ID, mode: 'move' | 'delete') => () => void;
  reEstimate: (id: ID, addMin: number) => void;
  setFinishTime: (id: ID, at: Date) => void;
  addProject: (p: Partial<Project>) => Project;
  updateProject: (id: ID, patch: Partial<Project>) => void;
  deleteProject: (id: ID) => void;
  addEntry: (e: Partial<Entry>) => Entry;
  updateEntry: (id: ID, patch: Partial<Entry>) => void;
  deleteEntry: (id: ID) => void;
  addNotif: (n: Partial<Notif>) => void;
  markNotifsRead: (ids?: ID[]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setDisplayName: (name: string) => void;
  clearSample: () => Promise<void>;
  hasSample: boolean;
  checkinFor: (day: string) => Checkin | undefined;
  saveCheckin: (day: string, values: TrackerValues) => void;
  skipCheckin: (day: string, skipped?: boolean) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

type Table = 'projects' | 'tasks' | 'journal_entries' | 'notifications' | 'daily_checkins';

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const toast = useToast();
  const userId = session.user.id;
  const [state, setState] = useState<StoreState>({
    loaded: false, projects: [], tasks: [], entries: [], notifs: [], checkins: [], settings: DEFAULT_SETTINGS,
    displayName: '', email: session.user.email ?? '', userId,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const fail = useCallback((err: unknown) => {
    console.error(err);
    toast.show('Couldn’t save that change. Check your connection and try again.', { icon: 'warn' });
  }, [toast]);

  const write = useCallback(async (p: PromiseLike<{ error: any }>) => {
    try { const { error } = await p; if (error) fail(error); } catch (e) { fail(e); }
  }, [fail]);

  // ---------- load ----------
  const load = useCallback(async (initial: boolean) => {
    const [pr, tr, er, nr, sr, cr] = await Promise.all([
      supabase.from('projects').select('*').order('sort'),
      supabase.from('tasks').select('*').order('sort'),
      supabase.from('journal_entries').select('*').order('when_at', { ascending: false }),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_settings').select('*').maybeSingle(),
      supabase.from('daily_checkins').select('*').order('day', { ascending: false }).limit(400),
    ]);
    const err = pr.error || tr.error || er.error || nr.error || sr.error || cr.error;
    if (err) { fail(err); return; }
    let projects = (pr.data ?? []).map(projectFromRow);
    let tasks = (tr.data ?? []).map(taskFromRow);
    let entries = (er.data ?? []).map(entryFromRow);
    const notifs = (nr.data ?? []).map(notifFromRow);
    let checkins = (cr.data ?? []).map(checkinFromRow);
    let settingsRow = sr.data;

    // First run: settings row, Inbox, sample data
    if (initial && (!settingsRow || !settingsRow.seeded)) {
      let inbox = projects.find(p => p.isInbox);
      if (!inbox) {
        inbox = { id: uid(), name: 'Inbox', emoji: '📥', cover: 'grey', status: 'In progress', archived: false, startDate: null, dueDate: null, dueTime: null, tags: [], isInbox: true, sort: 0, isSample: false, createdAt: new Date().toISOString() };
        const { error } = await supabase.from('projects').insert({ ...projectToRow(inbox), user_id: userId });
        if (error) { fail(error); return; }
        projects = [inbox, ...projects];
      }
      if (!settingsRow) {
        const name = (session.user.email ?? '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const { data, error } = await supabase.from('user_settings').insert({ user_id: userId, display_name: name, data: DEFAULT_SETTINGS, seeded: false }).select().single();
        if (error) { fail(error); return; }
        settingsRow = data;
      }
      const sample = buildSample(inbox.id);
      const r1 = await supabase.from('projects').insert(sample.projects.map(p => ({ ...projectToRow(p), user_id: userId })));
      const r2 = r1.error ? r1 : await supabase.from('tasks').insert(sample.tasks.map(t => ({ ...taskToRow(t), user_id: userId })));
      const r3 = r2.error ? r2 : await supabase.from('journal_entries').insert(sample.entries.map(e => ({ ...entryToRow(e), user_id: userId })));
      const r4 = r3.error ? r3 : await supabase.from('daily_checkins').upsert(sample.checkins.map(c => ({ ...checkinToRow(c), user_id: userId })), { onConflict: 'user_id,day', ignoreDuplicates: true });
      if (r4.error) { fail(r4.error); }
      else {
        projects = [...projects, ...sample.projects];
        tasks = [...tasks, ...sample.tasks];
        entries = [...sample.entries, ...entries];
        checkins = [...sample.checkins.filter(c => !checkins.some(x => x.day === c.day)), ...checkins];
        await supabase.from('user_settings').update({ seeded: true }).eq('user_id', userId);
      }
    }
    const sd = settingsRow?.data ?? {};
    const jd = { ...DEFAULT_SETTINGS.journalDefaults, ...(sd.journalDefaults ?? {}) };
    // old defaults that framed every entry as a mistake: no tag by default now
    if (jd.manual === 'Mistake') jd.manual = '';
    if (jd.fromTask === 'Task delay') jd.fromTask = '';
    setState(s => ({
      ...s, loaded: true, projects, tasks, entries, notifs, checkins,
      settings: {
        ...DEFAULT_SETTINGS, ...sd, notif: { ...DEFAULT_SETTINGS.notif, ...(sd.notif ?? {}) }, journalDefaults: jd,
        // "Archived" is a flag for projects now, not a status
        projectStatuses: (sd.projectStatuses ?? DEFAULT_SETTINGS.projectStatuses).filter((x: { name: string }) => x.name !== 'Archived'),
        journalTags: sd.journalTags && !sd.journalTags.includes('Win') && sd.journalTags.join() === 'Task delay,Mistake,Lesson,Idea' ? [...sd.journalTags, 'Win'] : (sd.journalTags ?? DEFAULT_SETTINGS.journalTags),
      },
      displayName: settingsRow?.display_name ?? '',
    }));
  }, [fail, session.user.email, userId]);

  useEffect(() => { load(true); }, [load]);

  // refresh when returning to the app (other device may have changed data)
  useEffect(() => {
    let last = Date.now();
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last > 30000) { last = Date.now(); load(false); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  // realtime: merge changes from other devices
  useEffect(() => {
    const map: Record<Table, [keyof StoreState, (r: any) => any]> = {
      projects: ['projects', projectFromRow], tasks: ['tasks', taskFromRow], journal_entries: ['entries', entryFromRow], notifications: ['notifs', notifFromRow], daily_checkins: ['checkins', checkinFromRow],
    };
    const ch = supabase.channel('sync-' + userId);
    (Object.keys(map) as Table[]).forEach(table => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, (payload: any) => {
        const [key, from] = map[table];
        setState(s => {
          const list = s[key] as any[];
          if (payload.eventType === 'DELETE') return { ...s, [key]: list.filter(x => x.id !== payload.old.id) };
          const item = from(payload.new);
          const i = list.findIndex(x => x.id === item.id);
          if (i === -1) return { ...s, [key]: table === 'journal_entries' || table === 'notifications' ? [item, ...list] : [...list, item] };
          const next = list.slice(); next[i] = item; return { ...s, [key]: next };
        });
      });
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_settings', filter: `user_id=eq.${userId}` }, (payload: any) => {
      setState(s => ({ ...s, settings: { ...s.settings, ...(payload.new.data ?? {}) }, displayName: payload.new.display_name }));
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  // ---------- local mutation helpers ----------
  const patchList = <K extends 'projects' | 'tasks' | 'entries' | 'notifs' | 'checkins'>(key: K, id: ID, patch: any) =>
    setState(s => ({ ...s, [key]: (s[key] as any[]).map(x => (x.id === id ? { ...x, ...patch } : x)) }));

  // ---------- tasks ----------
  const updateTask = useCallback((id: ID, patch: Partial<Task>) => {
    patchList('tasks', id, patch);
    write(supabase.from('tasks').update(taskToRow(patch)).eq('id', id));
  }, [write]);

  const addTask = useCallback((t: Partial<Task>): Task => {
    const s = stateRef.current;
    const maxSort = s.tasks.reduce((m, x) => Math.max(m, x.sort), 0);
    const inbox = s.projects.find(p => p.isInbox);
    const task: Task = {
      id: uid(), projectId: inbox?.id ?? null, title: '', status: s.settings.taskStatuses.find(x => x.note?.startsWith('Default'))?.name ?? 'Not started',
      dueDate: null, dueTime: null, estimateMin: null, reEstimates: [], myDayDate: null, remindAt: null, remindedAt: null,
      steps: [], note: '', elapsedMs: 0, runStartedAt: null, pausedAt: null, firstStartedAt: null, finishedAt: null, reflection: 'none',
      snoozeUntil: null, sort: maxSort + 1, isSample: false, createdAt: new Date().toISOString(), ...t,
    };
    setState(st => ({ ...st, tasks: [...st.tasks, task] }));
    write(supabase.from('tasks').insert({ ...taskToRow(task), user_id: userId }));
    return task;
  }, [write, userId]);

  const deleteTask = useCallback((id: ID) => {
    setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id), entries: s.entries.map(e => e.taskIds.includes(id) ? { ...e, taskIds: e.taskIds.filter(x => x !== id) } : e) }));
    write(supabase.from('tasks').delete().eq('id', id));
    stateRef.current.entries.filter(e => e.taskIds.includes(id)).forEach(e =>
      write(supabase.from('journal_entries').update({ task_ids: e.taskIds.filter(x => x !== id) }).eq('id', e.id)));
  }, [write]);

  const pauseTask = useCallback((id: ID) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t || !t.runStartedAt) return;
    updateTask(id, { elapsedMs: elapsed(t), runStartedAt: null, pausedAt: new Date().toISOString() });
  }, [updateTask]);

  const startTask = useCallback((id: ID) => {
    const s = stateRef.current;
    s.tasks.filter(t => t.runStartedAt && t.id !== id).forEach(t => pauseTask(t.id));
    const t = s.tasks.find(x => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    const today = todayISO();
    updateTask(id, {
      runStartedAt: now, firstStartedAt: t.firstStartedAt ?? now, status: 'In progress', pausedAt: null,
      finishedAt: null, myDayDate: t.myDayDate && t.myDayDate <= today ? t.myDayDate : today,
    });
    // starting work moves a not-started project to In progress
    const p = s.projects.find(x => x.id === t.projectId);
    if (p && !p.isInbox && ['Not started', 'Backlog'].includes(p.status)) updateProject(p.id, { status: 'In progress' });
  }, [pauseTask, updateTask]);

  const finishTask = useCallback((id: ID, finishedAt = new Date()): Outcome | null => {
    const s = stateRef.current;
    const t = s.tasks.find(x => x.id === id);
    if (!t) return null;
    const ms = t.runStartedAt ? elapsed(t, finishedAt.getTime()) : t.elapsedMs;
    const done: Task = { ...t, elapsedMs: ms, runStartedAt: null, finishedAt: finishedAt.toISOString(), status: 'Done' };
    const o = outcome(done, s.settings);
    const needs = t.reflection === 'none' && ((o.diffMin ?? 0) > 0 || (o.lateMin ?? 0) > 0);
    updateTask(id, { elapsedMs: ms, runStartedAt: null, pausedAt: null, finishedAt: done.finishedAt, status: 'Done', reflection: needs ? 'needed' : t.reflection });
    return o;
  }, [updateTask]);

  const reopenTask = useCallback((id: ID) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t) return;
    updateTask(id, { finishedAt: null, status: t.elapsedMs > 0 ? 'In progress' : 'Not started', reflection: t.reflection === 'needed' ? 'none' : t.reflection });
  }, [updateTask]);

  const setStatus = useCallback((id: ID, status: string) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t || t.status === status) return;
    if (t.finishedAt && status !== 'Done') updateTask(id, { status, finishedAt: null, reflection: t.reflection === 'needed' ? 'none' : t.reflection });
    else updateTask(id, { status });
  }, [updateTask]);

  // ---------- deletes with an undo window ----------
  const pending = useRef(new Map<string, number>());
  const later = useCallback((key: string, run: () => void) => {
    const id = window.setTimeout(() => { pending.current.delete(key); run(); }, 6500);
    pending.current.set(key, id);
    return () => { window.clearTimeout(id); pending.current.delete(key); };
  }, []);
  const removeTask = useCallback((id: ID) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t) return () => {};
    setState(s => ({ ...s, tasks: s.tasks.filter(x => x.id !== id) }));
    const cancel = later('t' + id, () => deleteTask(id));
    return () => { cancel(); setState(s => ({ ...s, tasks: s.tasks.some(x => x.id === id) ? s.tasks : [...s.tasks, t] })); };
  }, [later]);
  const removeEntry = useCallback((id: ID) => {
    const e = stateRef.current.entries.find(x => x.id === id);
    if (!e) return () => {};
    setState(s => ({ ...s, entries: s.entries.filter(x => x.id !== id) }));
    const cancel = later('e' + id, () => write(supabase.from('journal_entries').delete().eq('id', id)));
    return () => { cancel(); setState(s => ({ ...s, entries: s.entries.some(x => x.id === id) ? s.entries : [e, ...s.entries] })); };
  }, [later, write]);
  // flush pending deletes if the tab closes during the undo window
  useEffect(() => {
    const flush = () => { pending.current.forEach(id => window.clearTimeout(id)); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const reEstimate = useCallback((id: ID, addMin: number) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t) return;
    updateTask(id, { reEstimates: [...t.reEstimates, { at: new Date().toISOString(), addMin }] });
  }, [updateTask]);

  const setFinishTime = useCallback((id: ID, at: Date) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t || !t.finishedAt) return;
    const delta = at.getTime() - new Date(t.finishedAt).getTime();
    updateTask(id, { finishedAt: at.toISOString(), elapsedMs: Math.max(0, t.elapsedMs + delta) });
  }, [updateTask]);

  // ---------- projects ----------
  const addProject = useCallback((p: Partial<Project>): Project => {
    const s = stateRef.current;
    const proj: Project = {
      id: uid(), name: 'Untitled project', emoji: '📁', cover: 'purple', status: 'Not started', archived: false, startDate: null, dueDate: null, dueTime: null,
      tags: [...s.settings.projectDefaultTags], isInbox: false, sort: s.projects.reduce((m, x) => Math.max(m, x.sort), 0) + 1,
      isSample: false, createdAt: new Date().toISOString(), ...p,
    };
    setState(st => ({ ...st, projects: [...st.projects, proj] }));
    write(supabase.from('projects').insert({ ...projectToRow(proj), user_id: userId }));
    return proj;
  }, [write, userId]);

  const updateProject = useCallback((id: ID, patch: Partial<Project>) => {
    patchList('projects', id, patch);
    write(supabase.from('projects').update(projectToRow(patch)).eq('id', id));
  }, [write]);

  const removeProject = useCallback((id: ID, mode: 'move' | 'delete') => {
    const s = stateRef.current;
    const inbox = s.projects.find(p => p.isInbox);
    const p = s.projects.find(x => x.id === id);
    if (!inbox || !p || id === inbox.id) return () => {};
    const own = s.tasks.filter(t => t.projectId === id);
    setState(st => ({
      ...st, projects: st.projects.filter(x => x.id !== id),
      tasks: mode === 'delete' ? st.tasks.filter(t => t.projectId !== id) : st.tasks.map(t => (t.projectId === id ? { ...t, projectId: inbox.id } : t)),
    }));
    const cancel = later('p' + id, async () => {
      if (mode === 'delete') await write(supabase.from('tasks').delete().eq('project_id', id));
      else await write(supabase.from('tasks').update({ project_id: inbox.id }).eq('project_id', id));
      await write(supabase.from('projects').delete().eq('id', id));
    });
    return () => {
      cancel();
      setState(st => ({ ...st, projects: [...st.projects.filter(x => x.id !== id), p], tasks: [...st.tasks.filter(t => !own.some(o => o.id === t.id)), ...own] }));
    };
  }, [later, write]);

  const deleteProject = useCallback((id: ID) => {
    const s = stateRef.current;
    const inbox = s.projects.find(p => p.isInbox);
    if (!inbox || id === inbox.id) return;
    setState(st => ({ ...st, projects: st.projects.filter(p => p.id !== id), tasks: st.tasks.map(t => (t.projectId === id ? { ...t, projectId: inbox.id } : t)) }));
    (async () => {
      await write(supabase.from('tasks').update({ project_id: inbox.id }).eq('project_id', id));
      await write(supabase.from('projects').delete().eq('id', id));
    })();
  }, [write]);

  // ---------- journal ----------
  const addEntry = useCallback((e: Partial<Entry>): Entry => {
    const entry: Entry = { id: uid(), body: '', whenAt: new Date().toISOString(), tags: [], taskIds: [], trackerValues: {}, isSample: false, createdAt: new Date().toISOString(), ...e };
    setState(st => ({ ...st, entries: [entry, ...st.entries] }));
    write(supabase.from('journal_entries').insert({ ...entryToRow(entry), user_id: userId }));
    return entry;
  }, [write, userId]);
  const updateEntry = useCallback((id: ID, patch: Partial<Entry>) => {
    patchList('entries', id, patch);
    write(supabase.from('journal_entries').update(entryToRow(patch)).eq('id', id));
  }, [write]);
  const deleteEntry = useCallback((id: ID) => {
    setState(st => ({ ...st, entries: st.entries.filter(e => e.id !== id) }));
    write(supabase.from('journal_entries').delete().eq('id', id));
  }, [write]);

  // ---------- notifications ----------
  const addNotif = useCallback((n: Partial<Notif>) => {
    const notif: Notif = { id: uid(), kind: 'info', title: '', body: '', taskId: null, readAt: null, createdAt: new Date().toISOString(), ...n };
    setState(st => ({ ...st, notifs: [notif, ...st.notifs] }));
    write(supabase.from('notifications').insert({ ...notifToRow(notif), user_id: userId }));
  }, [write, userId]);
  const markNotifsRead = useCallback((ids?: ID[]) => {
    const now = new Date().toISOString();
    const targets = stateRef.current.notifs.filter(n => !n.readAt && (!ids || ids.includes(n.id))).map(n => n.id);
    if (!targets.length) return;
    setState(st => ({ ...st, notifs: st.notifs.map(n => (targets.includes(n.id) ? { ...n, readAt: now } : n)) }));
    write(supabase.from('notifications').update({ read_at: now }).in('id', targets));
  }, [write]);

  // ---------- settings ----------
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...stateRef.current.settings, ...patch };
    setState(st => ({ ...st, settings: next }));
    write(supabase.from('user_settings').update({ data: next }).eq('user_id', userId));
  }, [write, userId]);
  const setDisplayName = useCallback((name: string) => {
    setState(st => ({ ...st, displayName: name }));
    write(supabase.from('user_settings').update({ display_name: name }).eq('user_id', userId));
  }, [write, userId]);

  const clearSample = useCallback(async () => {
    const s = stateRef.current;
    const inbox = s.projects.find(p => p.isInbox);
    // keep the user's own tasks that live in sample projects: move them to Inbox
    const sampleProjectIds = s.projects.filter(p => p.isSample).map(p => p.id);
    setState(st => ({
      ...st,
      projects: st.projects.filter(p => !p.isSample),
      tasks: st.tasks.filter(t => !t.isSample).map(t => (t.projectId && sampleProjectIds.includes(t.projectId) ? { ...t, projectId: inbox?.id ?? null } : t)),
      entries: st.entries.filter(e => !e.isSample),
      checkins: st.checkins.filter(c => !c.isSample),
    }));
    if (inbox && sampleProjectIds.length) await write(supabase.from('tasks').update({ project_id: inbox.id }).eq('is_sample', false).in('project_id', sampleProjectIds));
    await write(supabase.from('journal_entries').delete().eq('is_sample', true));
    await write(supabase.from('daily_checkins').delete().eq('is_sample', true));
    await write(supabase.from('tasks').delete().eq('is_sample', true));
    await write(supabase.from('projects').delete().eq('is_sample', true));
  }, [write]);

  // ---------- daily check-in ----------
  const saveCheckin = useCallback((day: string, values: TrackerValues) => {
    const existing = stateRef.current.checkins.find(c => c.day === day);
    if (existing) {
      patchList('checkins', existing.id, { values, skipped: false, isSample: false });
      write(supabase.from('daily_checkins').update({ values, skipped: false, is_sample: false }).eq('id', existing.id));
    } else {
      const c: Checkin = { id: uid(), day, values, skipped: false, isSample: false };
      setState(st => ({ ...st, checkins: [c, ...st.checkins] }));
      write(supabase.from('daily_checkins').insert({ ...checkinToRow(c), user_id: userId }));
    }
  }, [write, userId]);
  const skipCheckin = useCallback((day: string, skipped = true) => {
    const existing = stateRef.current.checkins.find(c => c.day === day);
    if (existing) {
      patchList('checkins', existing.id, { skipped });
      write(supabase.from('daily_checkins').update({ skipped }).eq('id', existing.id));
    } else {
      const c: Checkin = { id: uid(), day, values: {}, skipped, isSample: false };
      setState(st => ({ ...st, checkins: [c, ...st.checkins] }));
      write(supabase.from('daily_checkins').insert({ ...checkinToRow(c), user_id: userId }));
    }
  }, [write, userId]);

  const store = useMemo<Store>(() => {
    const pMap = new Map(state.projects.map(p => [p.id, p]));
    const tMap = new Map(state.tasks.map(t => [t.id, t]));
    return {
      ...state,
      inbox: state.projects.find(p => p.isInbox),
      projectById: id => (id ? pMap.get(id) : undefined),
      taskById: id => (id ? tMap.get(id) : undefined),
      addTask, updateTask, deleteTask, startTask, pauseTask, finishTask, reopenTask, reEstimate, setFinishTime, setStatus, removeTask, removeEntry, removeProject,
      addProject, updateProject, deleteProject, addEntry, updateEntry, deleteEntry, addNotif, markNotifsRead,
      updateSettings, setDisplayName, clearSample, saveCheckin, skipCheckin,
      checkinFor: (day: string) => state.checkins.find(c => c.day === day),
      hasSample: state.projects.some(p => p.isSample) || state.tasks.some(t => t.isSample) || state.entries.some(e => e.isSample) || state.checkins.some(c => c.isSample),
    };
  }, [state, setStatus, removeTask, removeEntry, removeProject, saveCheckin, skipCheckin, addTask, updateTask, deleteTask, startTask, pauseTask, finishTask, reopenTask, reEstimate, setFinishTime, addProject, updateProject, deleteProject, addEntry, updateEntry, deleteEntry, addNotif, markNotifsRead, updateSettings, setDisplayName, clearSample]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** re-render every `ms` (for live timers) */
export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}
