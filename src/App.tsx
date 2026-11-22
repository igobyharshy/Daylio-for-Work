import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider } from './ui/Toast';
import { TooltipLayer } from './ui/kit';
import { UIProvider, useUI } from './app/ui';
import { NavDrawer, SearchOverlay, TopBar } from './app/shell';
import { Engine } from './app/engine';
import { SignIn } from './app/SignIn';
import { MyDayPage } from './features/myday';
import { ProjectPage, ProjectsPage, NewProjectDialog } from './features/projects';
import { EntryDialog, EntryDrawer, JournalPage, ReviewPage, WhatHappenedDialog } from './features/journal';
import { InsightsPage } from './features/insights';
import { SettingsPage } from './features/settings';
import { TaskDrawer } from './features/drawer';
import { MiniTimerProvider } from './features/mini';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') setSignedOut(true); setSession(s); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!supabaseConfigured) return <div className="loading">Ontrack isn’t configured: missing Supabase environment variables.</div>;
  return (
    <ToastProvider>
      <TooltipLayer />
      {session === undefined ? <div className="loading"><div className="spinner" /></div>
        : !session ? <SignIn signedOut={signedOut} />
        : (
          <StoreProvider session={session} key={session.user.id}>
            <BrowserRouter>
              <UIProvider>
                <MiniTimerProvider>
                  <Shell />
                </MiniTimerProvider>
              </UIProvider>
            </BrowserRouter>
          </StoreProvider>
        )}
    </ToastProvider>
  );
}

function Shell() {
  const st = useStore();
  const ui = useUI();
  const loc = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [loc.pathname]);
  // close the side sheets when the page changes
  useEffect(() => { ui.closeSheetsIfStale(); }, [loc.pathname]); // eslint-disable-line
  if (!st.loaded) return <div className="loading"><div className="col gap-16" style={{ alignItems: 'center' }}><div className="spinner" /><span className="t-bm">Loading your day…</span></div></div>;
  const task = st.taskById(ui.taskId);
  const entry = st.entries.find(e => e.id === ui.entryId);
  const wh = st.taskById(ui.whatHappened);
  const wide = loc.pathname === '/projects' && st.settings.projectsView === 'board';
  return (
    <div className="app">
      <TopBar />
      <div className="body">
        <NavDrawer />
        <main className="main" ref={mainRef}>
          <div className={'content' + (wide ? ' wide' : '')}>
            <Routes>
              <Route path="/" element={<Navigate to="/my-day" replace />} />
              <Route path="/my-day" element={<MyDayPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectPage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/journal/review" element={<ReviewPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/settings" element={<Navigate to="/settings/work-day" replace />} />
              <Route path="/settings/:tab" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/my-day" replace />} />
            </Routes>
          </div>
        </main>
        {task && <TaskDrawer t={task} key={task.id} />}
        {!task && entry && <EntryDrawer e={entry} key={entry.id} />}
      </div>
      <Engine />
      {ui.searchOpen && <SearchOverlay onClose={() => ui.setSearchOpen(false)} />}
      {ui.draft && <EntryDialog draft={ui.draft} onClose={ui.closeDraft} />}
      {wh && <WhatHappenedDialog t={wh} onClose={() => ui.openWhatHappened(null)} />}
      {ui.newProject && <NewProjectDialog onClose={() => ui.setNewProject(false)} />}
    </div>
  );
}
