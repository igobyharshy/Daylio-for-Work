import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ID } from '../lib/types';

export interface EntryDraft { taskIds?: ID[]; tags?: string[]; body?: string; whenAt?: string; source?: 'manual' | 'fromTask' | 'overEstimate' | 'late' | 'review' }

interface UI {
  taskId: ID | null; openTask: (id: ID | null) => void;
  entryId: ID | null; openEntry: (id: ID | null) => void;
  draft: EntryDraft | null; newEntry: (d?: EntryDraft) => void; closeDraft: () => void;
  whatHappened: ID | null; openWhatHappened: (id: ID | null) => void;
  searchOpen: boolean; setSearchOpen: (v: boolean) => void;
  newProject: boolean; setNewProject: (v: boolean) => void;
  closeSheetsIfStale: () => void;
}
const Ctx = createContext<UI | null>(null);
export const useUI = () => useContext(Ctx)!;

export function UIProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<ID | null>(null);
  const [entryId, setEntryId] = useState<ID | null>(null);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [whatHappened, openWhatHappened] = useState<ID | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const openedAt = useRef(0);
  const openTask = useCallback((id: ID | null) => { setTaskId(id); if (id) { setEntryId(null); openedAt.current = Date.now(); } }, []);
  const openEntry = useCallback((id: ID | null) => { setEntryId(id); if (id) { setTaskId(null); openedAt.current = Date.now(); } }, []);
  const closeSheetsIfStale = useCallback(() => { if (Date.now() - openedAt.current > 400) { setTaskId(null); setEntryId(null); } }, []);
  const newEntry = useCallback((d: EntryDraft = {}) => setDraft(d), []);
  const closeDraft = useCallback(() => setDraft(null), []);
  const v = useMemo(() => ({ taskId, openTask, entryId, openEntry, draft, newEntry, closeDraft, whatHappened, openWhatHappened, searchOpen, setSearchOpen, newProject, setNewProject, closeSheetsIfStale }),
    [taskId, openTask, entryId, openEntry, draft, newEntry, closeDraft, whatHappened, searchOpen, newProject, closeSheetsIfStale]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
