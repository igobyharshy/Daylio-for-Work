import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Entry, Notif, Project, Settings, Task, ID } from './types';
import { DEFAULT_SETTINGS } from './types';
import { entryFromRow, entryToRow, notifFromRow, notifToRow, projectFromRow, projectToRow, taskFromRow, taskToRow } from './db';
import { buildSample } from './seed';
import { elapsed, outcome, todayISO, uid, type Outcome } from './time';
import { useToast } from '../ui/Toast';

export interface StoreState {
  loaded: boolean;
  projects: Project[];
  tasks: Task[];
  entries: Entry[];
  notifs: Notif[];
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
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

type Table = 'projects' | 'tasks' | 'journal_entries' | 'notifications';

export function StoreProvider({ session, children }: { session: Session; children: ReactNode }) {
  const toast = useToast();
  const userId = session.user.id;
  const [state, setState] = useState<StoreState>({
    loaded: false, projects: [], tasks: [], entries: [], notifs: [], settings: DEFAULT_SETTINGS,
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
    const [pr, tr, er, nr, sr] = await Promise.all([
      supabase.from('projects').select('*').order('sort'),
      supabase.from('tasks').select('*').order('sort'),
      supabase.from('journal_entries').select('*').order('when_at', { ascending: false }),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_settings').select('*').maybeSingle(),
    ]);
    const err = pr.error || tr.error || er.error || nr.error || sr.error;
    if (err) { fail(err); return; }
    let projects = (pr.data ?? []).map(projectFromRow);
    let tasks = (tr.data ?? []).map(taskFromRow);
    let entries = (er.data ?? []).map(entryFromRow);
    const notifs = (nr.data ?? []).map(notifFromRow);
    let settingsRow = sr.data;

    // First run: settings row, Inbox, sample data
    if (initial && (!settingsRow || !settingsRow.seeded)) {
      let inbox = projects.find(p => p.isInbox);
      if (!inbox) {
        inbox = { id: uid(), name: 'Inbox', emoji: '📥', cover: 'grey', status: 'In progress', startDate: null, dueDate: null, dueTime: null, tags: [], isInbox: true, sort: 0, isSample: false, createdAt: new Date().toISOString() };
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
      if (r3.error) { fail(r3.error); }
      else {
        projects = [...projects, ...sample.projects];
        tasks = [...tasks, ...sample.tasks];
        entries = [...sample.entries, ...entries];
        await supabase.from('user_settings').update({ seeded: true }).eq('user_id', userId);
      }
    }
    setState(s => ({
      ...s, loaded: true, projects, tasks, entries, notifs,
      settings: { ...DEFAULT_SETTINGS, ...(settingsRow?.data ?? {}), notif: { ...DEFAULT_SETTINGS.notif, ...(settingsRow?.data?.notif ?? {}) }, journalDefaults: { ...DEFAULT_SETTINGS.journalDefaults, ...(settingsRow?.data?.journalDefaults ?? {}) } },
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
      projects: ['projects', projectFromRow], tasks: ['tasks', taskFromRow], journal_entries: ['entries', entryFromRow], notifications: ['notifs', notifFromRow],
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
  const patchList = <K extends 'projects' | 'tasks' | 'entries' | 'notifs'>(key: K, id: ID, patch: any) =>
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
      steps: [], note: '', elapsedMs: 0, runStartedAt: null, firstStartedAt: null, finishedAt: null, reflection: 'none',
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
    updateTask(id, { elapsedMs: elapsed(t), runStartedAt: null });
  }, [updateTask]);

  const startTask = useCallback((id: ID) => {
    const s = stateRef.current;
    s.tasks.filter(t => t.runStartedAt && t.id !== id).forEach(t => pauseTask(t.id));
    const t = s.tasks.find(x => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    updateTask(id, {
      runStartedAt: now, firstStartedAt: t.firstStartedAt ?? now, status: 'In progress',
      finishedAt: null, myDayDate: t.myDayDate ?? todayISO(),
    });
  }, [pauseTask, updateTask]);

  const finishTask = useCallback((id: ID, finishedAt = new Date()): Outcome | null => {
    const s = stateRef.current;
    const t = s.tasks.find(x => x.id === id);
    if (!t) return null;
    const ms = t.runStartedAt ? elapsed(t, finishedAt.getTime()) : t.elapsedMs;
    const done: Task = { ...t, elapsedMs: ms, runStartedAt: null, finishedAt: finishedAt.toISOString(), status: 'Done' };
    const o = outcome(done, s.settings);
    const needs = t.reflection === 'none' && ((o.diffMin ?? 0) > 0 || (o.lateMin ?? 0) > 0);
    updateTask(id, { elapsedMs: ms, runStartedAt: null, finishedAt: done.finishedAt, status: 'Done', reflection: needs ? 'needed' : t.reflection });
    return o;
  }, [updateTask]);

  const reopenTask = useCallback((id: ID) => {
    const t = stateRef.current.tasks.find(x => x.id === id);
    if (!t) return;
    updateTask(id, { finishedAt: null, status: t.elapsedMs > 0 ? 'In progress' : 'Not started', reflection: t.reflection === 'needed' ? 'none' : t.reflection });
  }, [updateTask]);

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
      id: uid(), name: 'Untitled project', emoji: '📁', cover: 'blue', status: 'Not started', startDate: null, dueDate: null, dueTime: null,
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
    const entry: Entry = { id: uid(), body: '', whenAt: new Date().toISOString(), tags: [], taskIds: [], isSample: false, createdAt: new Date().toISOString(), ...e };
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
    }));
    if (inbox && sampleProjectIds.length) await write(supabase.from('tasks').update({ project_id: inbox.id }).eq('is_sample', false).in('project_id', sampleProjectIds));
    await write(supabase.from('journal_entries').delete().eq('is_sample', true));
    await write(supabase.from('tasks').delete().eq('is_sample', true));
    await write(supabase.from('projects').delete().eq('is_sample', true));
  }, [write]);

  const store = useMemo<Store>(() => {
    const pMap = new Map(state.projects.map(p => [p.id, p]));
    const tMap = new Map(state.tasks.map(t => [t.id, t]));
    return {
      ...state,
      inbox: state.projects.find(p => p.isInbox),
      projectById: id => (id ? pMap.get(id) : undefined),
      taskById: id => (id ? tMap.get(id) : undefined),
      addTask, updateTask, deleteTask, startTask, pauseTask, finishTask, reopenTask, reEstimate, setFinishTime,
      addProject, updateProject, deleteProject, addEntry, updateEntry, deleteEntry, addNotif, markNotifsRead,
      updateSettings, setDisplayName, clearSample,
      hasSample: state.projects.some(p => p.isSample) || state.tasks.some(t => t.isSample) || state.entries.some(e => e.isSample),
    };
  }, [state, addTask, updateTask, deleteTask, startTask, pauseTask, finishTask, reopenTask, reEstimate, setFinishTime, addProject, updateProject, deleteProject, addEntry, updateEntry, deleteEntry, addNotif, markNotifsRead, updateSettings, setDisplayName, clearSample]);

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
