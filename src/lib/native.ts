// Phone + Android-app helpers. Everything here is a no-op on the desktop web app.
import { useEffect, useState } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

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
