// Phone + Android-app helpers. Everything here is a no-op on the desktop web app.
import { useEffect, useState } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { LocalNotifications } from '@capacitor/local-notifications';

/** true inside the Android app (Capacitor), false in a browser */
export const isNative = Capacitor.isNativePlatform();

/** phone layout below this width (bottom nav, full-screen sheets, bottom-sheet menus) */
export const MOBILE_MQ = '(max-width: 720px)';
const mq = typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ) : null;
export const isMobileNow = () => !!mq?.matches;

export function useIsMobile() {
  const [m, setM] = useState(isMobileNow);
  useEffect(() => {
    if (!mq) return;
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

/** keep the screen on (focus timer). Native plugin in the app, Wake Lock API in browsers. */
let lock: { release: () => Promise<void> } | null = null;
export async function keepScreenOn(on: boolean) {
  try {
    if (isNative) { await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()); return; }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (on && nav.wakeLock && !lock) lock = await nav.wakeLock.request('screen');
    if (!on && lock) { await lock.release(); lock = null; }
  } catch { /* not supported: fine */ }
}

/** status/navigation bar icons follow the theme; hidden during the focus timer */
export function setSystemBars(dark: boolean) {
  if (!isNative) return;
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}
export function hideSystemBars(hide: boolean) {
  if (!isNative) return;
  (hide ? SystemBars.hide() : SystemBars.show()).catch(() => {});
}

// ---------- notifications in the Android app ----------
let permission: Promise<boolean> | null = null;
/** asks once; creates the app's notification channels */
export function ensureNativeNotifs(ask = true): Promise<boolean> {
  if (!isNative) return Promise.resolve(false);
  if (permission && ask) return permission;
  const run = (async () => {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    if (p.display !== 'granted') return false;
    await LocalNotifications.createChannel({ id: 'timer-running', name: 'Running timer', description: 'Shows the task you are timing', importance: 2, visibility: 1, vibration: false });
    await LocalNotifications.createChannel({ id: 'timer-alarm', name: 'Estimate is up', description: 'Alerts you when a task’s estimate runs out', importance: 5, visibility: 1, vibration: true });
    await LocalNotifications.createChannel({ id: 'reminders', name: 'Reminders', description: 'Task reminders, check-in and reflection prompts', importance: 4, visibility: 1, vibration: true });
    return true;
  })().catch(() => false);
  if (ask) permission = run;
  return run;
}

/** permission state for Settings → Notifications: browser Notification API or the app's */
export type NotifPerm = 'granted' | 'denied' | 'default';
export function useNotifPermission(): [NotifPerm, () => Promise<void>] {
  const web = () => (typeof Notification !== 'undefined' ? Notification.permission : 'denied') as NotifPerm;
  const [perm, setPerm] = useState<NotifPerm>(isNative ? 'default' : web());
  useEffect(() => {
    if (!isNative) return;
    LocalNotifications.checkPermissions().then(p => setPerm(p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'default')).catch(() => {});
  }, []);
  const ask = async () => {
    if (isNative) { const ok = await ensureNativeNotifs(true); setPerm(ok ? 'granted' : 'denied'); return; }
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission() as NotifPerm);
  };
  return [perm, ask];
}

/** a notification right now (check-in, reflection, nudges) */
export async function nativeNotifyNow(title: string, body: string, extra: Record<string, unknown> = {}) {
  if (!(await ensureNativeNotifs(false))) return;
  const id = 300000 + Math.floor(Math.random() * 600000);
  await LocalNotifications.schedule({ notifications: [{ id, channelId: 'reminders', title, body, smallIcon: 'ic_stat_timer', extra }] }).catch(() => {});
}

/** stable small number for a task id (notification ids must be 32-bit ints) */
export function notifIdFor(key: string, base: number) {
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return base + (Math.abs(h) % 90000);
}
