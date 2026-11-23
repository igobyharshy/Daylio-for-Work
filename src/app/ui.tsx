import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ID } from '../lib/types';

export interface EntryDraft { taskIds?: ID[]; tags?: string[]; body?: string; whenAt?: string; source?: 'manual' | 'fromTask' | 'overEstimate' | 'late' | 'review' }

/** The Journal day panel: one right-side panel for a day's check-in and entries. */
export interface DayState { iso: string; focusEntry?: ID | null; draft?: EntryDraft | null; focusCheckin?: boolean }

interface UI {
  taskId: ID | null; openTask: (id: ID | null) => void;
  /** entry currently highlighted in the day panel */
  entryId: ID | null; openEntry: (id: ID | null, iso?: string) => void;
  day: DayState | null; openDay: (d: DayState | null) => void;
  newEntry: (d?: EntryDraft) => void;
  whatHappened: ID | null; openWhatHappened: (id: ID | null) => void;
  /** ask for an estimate before starting a timer */
  estimateFirst: ID | null; askEstimate: (id: ID | null) => void;
  searchOpen: boolean; setSearchOpen: (v: boolean) => void;
  newProject: boolean; setNewProject: (v: boolean) => void;
  closeSheetsIfStale: () => void;
}
const Ctx = createContext<UI | null>(null);
export const useUI = () => useContext(Ctx)!;

const isoOf = (s?: string) => { const d = s ? new Date(s) : new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function UIProvider({ children, entryDay }: { children: ReactNode; entryDay: (id: ID) => string | undefined }) {
  const [taskId, setTaskId] = useState<ID | null>(null);
  const [day, setDay] = useState<DayState | null>(null);
  const [whatHappened, openWhatHappened] = useState<ID | null>(null);
  const [estimateFirst, askEstimate] = useState<ID | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const openedAt = useRef(0);
  const dayRef = useRef(entryDay); dayRef.current = entryDay;
  const openTask = useCallback((id: ID | null) => { setTaskId(id); if (id) { setDay(null); openedAt.current = Date.now(); } }, []);
  const openDay = useCallback((d: DayState | null) => { setDay(d); if (d) { setTaskId(null); openedAt.current = Date.now(); } }, []);
  const openEntry = useCallback((id: ID | null, iso?: string) => {
    if (!id) { setDay(null); return; }
    openDay({ iso: iso ?? dayRef.current(id) ?? isoOf(), focusEntry: id });
  }, [openDay]);
  const newEntry = useCallback((d: EntryDraft = {}) => openDay({ iso: isoOf(d.whenAt), draft: d }), [openDay]);
  const closeSheetsIfStale = useCallback(() => { if (Date.now() - openedAt.current > 400) { setTaskId(null); setDay(null); } }, []);
  const v = useMemo(() => ({
    taskId, openTask, entryId: day?.focusEntry ?? null, openEntry, day, openDay, newEntry, whatHappened, openWhatHappened,
    estimateFirst, askEstimate, searchOpen, setSearchOpen, newProject, setNewProject, closeSheetsIfStale,
  }), [taskId, openTask, day, openEntry, openDay, newEntry, whatHappened, estimateFirst, searchOpen, newProject, closeSheetsIfStale]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
