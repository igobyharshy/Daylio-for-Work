import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider } from './ui/Toast';
import { TooltipLayer, cx } from './ui/kit';
import { UIProvider, useUI } from './app/ui';
import { SearchOverlay, Sidebar, useApplyAccent, useApplyTheme } from './app/shell';
import { BottomNav, MiniPlayer, MobileTopBar, NativeBridge } from './app/mobile';
import { isNative, useIsMobile } from './lib/native';
import { Engine } from './app/engine';
import { SignIn } from './app/SignIn';
import { MyDayPage } from './features/myday';
import { ProjectPage, ProjectsPage, NewProjectDialog } from './features/projects';
import { DayPanel, JournalPage, ReviewPage, WhatHappenedDialog } from './features/journal';
import { EstimateFirstHost } from './features/tasks';
import { InsightsPage } from './features/insights';
import { PasswordDialog, SettingsPage } from './features/settings';
import { TaskDrawer } from './features/drawer';
import { MiniTimerProvider } from './features/mini';
import { OnboardingGate } from './features/onboarding';
import { useAutoUpdate } from './app/update';
import { useUndoKeys } from './app/undo';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [signedOut, setSignedOut] = useState(false);
  // opened from a "reset password" email: ask for the new password right away
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === 'SIGNED_OUT') setSignedOut(true); if (ev === 'PASSWORD_RECOVERY') setRecovery(true); setSession(s); });
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
              <UIWithStore>
                <MiniTimerProvider>
                  <Shell />
                  {recovery && <PasswordDialog title="Set a new password" onClose={() => setRecovery(false)} />}
                </MiniTimerProvider>
              </UIWithStore>
            </BrowserRouter>
          </StoreProvider>
        )}
    </ToastProvider>
  );
}

function UIWithStore({ children }: { children: React.ReactNode }) {
  const st = useStore();
  const ref = useRef(st); ref.current = st;
  const entryDay = useCallback((id: string) => {
    const e = ref.current.entries.find(x => x.id === id);
    if (!e) return undefined;
    const d = new Date(e.whenAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  return <UIProvider entryDay={entryDay}>{children}</UIProvider>;
}

function Shell() {
  const st = useStore();
  const ui = useUI();
  const loc = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const mobile = useIsMobile();
  useApplyTheme(st.settings.theme ?? 'light');
  useApplyAccent(st.settings.accent ?? 'purple');
  useAutoUpdate();
  useUndoKeys();
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [loc.pathname]);
  // close the side sheets when the page changes
  useEffect(() => { ui.closeSheetsIfStale(); }, [loc.pathname]); // eslint-disable-line
  if (!st.loaded) return <div className="loading"><div className="col gap-16" style={{ alignItems: 'center' }}><div className="spinner" /><span className="t-bm">Loading your day…</span></div></div>;
  const task = st.taskById(ui.taskId);
  const wh = st.taskById(ui.whatHappened);
  return (
    <div className={cx('app', mobile && 'm-app')}>
      {mobile && <MobileTopBar />}
      <div className="body">
        {!mobile && <Sidebar />}
        <main className="main" ref={mainRef}>
          <div className="content">
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
        {!task && ui.day && <DayPanel />}
      </div>
      {mobile && <MiniPlayer />}
      {mobile && <BottomNav />}
      {isNative && <NativeBridge />}
      <Engine />
      {ui.searchOpen && <SearchOverlay onClose={() => ui.setSearchOpen(false)} />}
      <EstimateFirstHost />
      {wh && <WhatHappenedDialog t={wh} onClose={() => ui.openWhatHappened(null)} />}
      {ui.newProject && <NewProjectDialog onClose={() => ui.setNewProject(false)} />}
      {st.loaded && <OnboardingGate />}
    </div>
  );
}
