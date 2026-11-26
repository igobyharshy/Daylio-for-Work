// Keeps an open app on the latest release: when you come back to it (and every 10 minutes), check whether a new
// version was deployed and reload quietly. Matters most in the Android app, which can stay open for days.
import { useEffect } from 'react';

const current = () => document.querySelector<HTMLScriptElement>('script[type=module][src*="/assets/index-"]')?.getAttribute('src') ?? null;

async function newer(): Promise<boolean> {
  const mine = current();
  if (!mine) return false; // dev server
  try {
    const r = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const m = (await r.text()).match(/\/assets\/index-[^"']+\.js/);
    return !!m && m[0] !== mine;
  } catch { return false; }
}

/** reload only when nothing is being typed or edited, so no one loses a half-written note */
const busy = () => !!document.querySelector('.popover, .scrim, .add-panel, .ob, .log-edit') ||
  !!(document.activeElement as HTMLElement | null)?.matches?.('input, textarea, [contenteditable=true]');

export function useAutoUpdate() {
  useEffect(() => {
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return;
      last = Date.now();
      if (await newer() && !busy()) location.reload();
    };
    const onVis = () => { void check(); };
    document.addEventListener('visibilitychange', onVis);
    const id = window.setInterval(() => { last = 0; void check(); }, 10 * 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.clearInterval(id); };
  }, []);
}
