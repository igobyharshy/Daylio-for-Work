// Phone layout (top app bar, bottom navigation, mini player) and the Android-app glue
// (back button, system bars, timer notifications). Desktop never renders these.
import { useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useStore, useNow } from '../lib/store';
import { useUI } from './ui';
import { Icon } from '../ui/Icon';
import { IBtn, Ring, cx, useAnchor } from '../ui/kit';
import { activeTask, myDayTasks, needsReflection } from '../lib/select';
import { fmtClock, fmtMin, isDone, isOverEstimate, remainingMs, timerView, totalEstimateMin } from '../lib/time';
import { useTaskActions } from '../features/tasks';
import { useMiniTimer } from '../features/mini';
import { NotificationsPanel, ProfileMenu } from './shell';
import { isNative, setSystemBars } from '../lib/native';

/** M3 small top app bar: brand, search, notifications, account. Page titles stay in the page. */
export function MobileTopBar() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const ba = useAnchor(), pa = useAnchor();
  const unread = st.notifs.filter(n => !n.readAt).length;
  const initial = (st.displayName || st.email || '?').charAt(0).toUpperCase();
  return (
    <header className="m-top">
      <button className="m-brand state" onClick={() => nav('/my-day')} aria-label="Ontrack home">
        <span className="brand-logo"><Icon name="timer" /></span><span>Ontrack</span>
      </button>
      <span className="grow" />
      <IBtn icon="search" label="Search" tip={false} onClick={() => ui.setSearchOpen(true)} />
      <IBtn icon="bell" label="Notifications" tip={false} badge={st.settings.notif.bellBadge && unread ? unread : null} onClick={e => ba.open(e)} />
      <button className="m-avatar state" aria-label="Account menu" onClick={e => pa.open(e)}><span className="avatar">{initial}</span></button>
      {ba.isOpen && <NotificationsPanel anchor={ba.el} onClose={ba.close} />}
      {pa.isOpen && <ProfileMenu anchor={pa.el} onClose={pa.close} placement="below-end" />}
    </header>
  );
}

/** M3 navigation bar: the four pages, with My Day's to-do count and Journal's reflections. */
export function BottomNav() {
  const st = useStore();
  const loc = useLocation();
  const left = myDayTasks(st.tasks, st.projects).filter(t => !isDone(t)).length;
  const reflect = needsReflection(st.tasks).length;
  const items = [
    { to: '/my-day', label: 'My Day', icon: 'sun', on: 'sunFill', badge: left },
    { to: '/projects', label: 'Projects', icon: 'folder', on: 'folderFill', badge: 0 },
    { to: '/journal', label: 'Journal', icon: 'book', on: 'bookFill', badge: reflect },
    { to: '/insights', label: 'Insights', icon: 'insights', on: 'insights', badge: 0 },
  ] as const;
  return (
    <nav className="m-nav" aria-label="Main">
      {items.map(it => {
        const active = loc.pathname.startsWith(it.to);
        return (
          <NavLink key={it.to} to={it.to} className={cx('m-nav-item', active && 'on')} aria-current={active ? 'page' : undefined}>
            <span className="m-ind state"><Icon name={active ? it.on : it.icon} />{it.badge > 0 && <span className="m-badge">{it.badge > 99 ? '99+' : it.badge}</span>}</span>
            <span className="m-label">{it.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Mini player above the navigation bar while a timer runs (My Day has the big Now card instead).
 *  Tap it for the full-screen focus timer. */
export function MiniPlayer() {
  const st = useStore();
  const act = useTaskActions();
  const mini = useMiniTimer();
  const loc = useLocation();
  const t = activeTask(st.tasks, st.projects);
  const running = !!t?.runStartedAt;
  const now = useNow(1000, running);
  if (!t || loc.pathname.startsWith('/my-day') || mini.focusOpen) return null;
  const amber = isOverEstimate(t, now);
  const v = timerView(t, now, st.settings.timerDirection ?? 'down');
  const accent = amber ? 'var(--warning)' : 'var(--primary)';
  return (
    <div className={cx('m-player', amber && 'amber', !running && 'paused')}>
      <button className="m-player-main state" onClick={mini.openFocus} aria-label="Open focus timer">
        <Ring pct={v.pct} size={36} stroke={3} color={accent} track="color-mix(in srgb, currentColor 14%, transparent)">
          <Icon name={amber ? 'warn' : running ? 'hourglass' : 'pause'} size={18} style={{ color: accent }} />
        </Ring>
        <span className="col grow" style={{ minWidth: 0 }}>
          <span className="t-ts ellipsis">{t.title}</span>
          <span className="t-bs tnum">{v.main} {t.estimateMin ? v.sub : 'elapsed'}{running ? '' : ' · paused'}</span>
        </span>
      </button>
      {running ? <IBtn icon="pause" label="Pause" tip={false} onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" tip={false} onClick={() => act.start(t)} />}
      <IBtn icon="check" label="Done" tip={false} onClick={() => act.finish(t)} />
    </div>
  );
}

/** Android app only: back button, status-bar colours, refresh on resume, timer notifications. */
export function NativeBridge() {
  const st = useStore();
  const ui = useUI();
  const mini = useMiniTimer();
  const nav = useNavigate();
  const loc = useLocation();
  const ref = useRef({ ui, mini, nav, path: loc.pathname });
  ref.current = { ui, mini, nav, path: loc.pathname };

  // status bar icons follow the app theme
  useEffect(() => {
    if (!isNative) return;
    const sync = () => setSystemBars(document.documentElement.dataset.theme === 'dark');
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  // hardware back: close the top-most layer, then the open sheet, then go back a page, then leave the app
  useEffect(() => {
    if (!isNative) return;
    const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const back = CapApp.addListener('backButton', ({ canGoBack }) => {
      const { ui: u, mini: m, nav: n, path } = ref.current;
      if (m.focusOpen) { m.closeFocus(); return; }
      if (document.querySelector('.popover, .scrim')) { esc(); return; }
      if (u.taskId) { u.openTask(null); return; }
      if (u.day) { u.openDay(null); return; }
      if (!path.startsWith('/my-day')) { if (canGoBack) n(-1); else n('/my-day'); return; }
      CapApp.minimizeApp();
    });
    // coming back to the app: pull the latest from the other devices right away
    const resume = CapApp.addListener('resume', () => document.dispatchEvent(new Event('visibilitychange')));
    return () => { back.then(h => h.remove()); resume.then(h => h.remove()); };
  }, []);

  // tapping a timer notification opens the focus timer
  useEffect(() => {
    if (!isNative) return;
    const h = LocalNotifications.addListener('localNotificationActionPerformed', a => { if (a.notification.extra?.focus) ref.current.mini.openFocus(); });
    return () => { h.then(x => x.remove()); };
  }, []);

  // timer notifications: a silent "running" one in the shade, and an alert when the estimate runs out
  const t = activeTask(st.tasks, st.projects);
  const running = t && t.runStartedAt ? t : null;
  const key = running ? [running.id, running.title, running.runStartedAt, running.elapsedMs, totalEstimateMin(running)].join('|') : '';
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    (async () => {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: RUNNING_ID }, { id: ALARM_ID }] });
        if (!running || cancelled) return;
        if (!(await ensurePermission()) || cancelled) return;
        const rem = remainingMs(running, Date.now());
        const est = totalEstimateMin(running);
        const list: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [{
          id: RUNNING_ID, channelId: 'timer-running', title: running.title,
          body: est ? (rem > 0 ? `Running · done by ${fmtClock(new Date(Date.now() + rem))} (${fmtMin(est)} estimate)` : `Running · over the ${fmtMin(est)} estimate`) : 'Running · no estimate',
          ongoing: true, autoCancel: false, smallIcon: 'ic_stat_timer', extra: { focus: true },
        }];
        if (est && rem > 1000) list.push({
          id: ALARM_ID, channelId: 'timer-alarm', title: 'Estimate is up', body: `${running.title} · ${fmtMin(est)} estimate`,
          schedule: { at: new Date(Date.now() + rem), allowWhileIdle: true }, smallIcon: 'ic_stat_timer', extra: { focus: true },
        });
        await LocalNotifications.schedule({ notifications: list });
      } catch { /* notifications are a nice-to-have */ }
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

const RUNNING_ID = 7000, ALARM_ID = 7001;
let permission: Promise<boolean> | null = null;
function ensurePermission() {
  permission ??= (async () => {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    if (p.display !== 'granted') return false;
    await LocalNotifications.createChannel({ id: 'timer-running', name: 'Running timer', description: 'Shows the task you are timing', importance: 2, visibility: 1, vibration: false });
    await LocalNotifications.createChannel({ id: 'timer-alarm', name: 'Estimate is up', description: 'Alerts you when a task’s estimate runs out', importance: 5, visibility: 1, vibration: true });
    return true;
  })().catch(() => false);
  return permission;
}
