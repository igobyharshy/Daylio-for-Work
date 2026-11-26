import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import { activeTask } from '../lib/select';
import { Icon } from '../ui/Icon';
import { Btn, IBtn, Ring, cx } from '../ui/kit';
import { useToast } from '../ui/Toast';
import { isOverEstimate, timerView } from '../lib/time';
import { useTaskActions } from './tasks';
import { FocusTimer } from './focus';
import { isMobileNow } from '../lib/native';

interface Mini { open: () => void; close: () => void; isOpen: boolean; supported: boolean; focusOpen: boolean; openFocus: () => void; closeFocus: () => void }
const Ctx = createContext<Mini>({ open: () => {}, close: () => {}, isOpen: false, supported: false, focusOpen: false, openFocus: () => {}, closeFocus: () => {} });
export const useMiniTimer = () => useContext(Ctx);

declare global { interface Window { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } } }

/** E09 / F03 — always-on-top mini timer using Document Picture-in-Picture (Chrome / Edge). */
export function MiniTimerProvider({ children }: { children: ReactNode }) {
  const [win, setWin] = useState<Window | null>(null);
  const toast = useToast();
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  const [focusOpen, setFocus] = useState(false);
  const openFocus = useCallback(() => setFocus(true), []);
  const closeFocus = useCallback(() => setFocus(false), []);
  const open = useCallback(async () => {
    // phones: the pop-out becomes the full-screen focus timer
    if (isMobileNow()) { setFocus(true); return; }
    if (!supported) { toast.show('The pop-out mini timer needs Chrome or Edge.', { icon: 'info' }); return; }
    if (win) { win.focus(); return; }
    try {
      const w = await window.documentPictureInPicture!.requestWindow({ width: 240, height: 240 });
      // copy the app's CSS straight into the window (instant, no network); fall back to the link if a sheet can't be read
      [...document.styleSheets].forEach(sheet => {
        try {
          const style = w.document.createElement('style');
          style.textContent = [...sheet.cssRules].map(r => r.cssText).join('\n');
          w.document.head.appendChild(style);
        } catch {
          if (sheet.ownerNode) w.document.head.appendChild(sheet.ownerNode.cloneNode(true));
        }
      });
      w.document.body.style.margin = '0';
      w.document.title = 'Ontrack timer';
      w.addEventListener('pagehide', () => setWin(null));
      setWin(w);
    } catch { toast.show('Couldn’t open the mini timer.', { icon: 'warn' }); }
  }, [supported, win, toast]);
  const close = useCallback(() => { win?.close(); setWin(null); }, [win]);
  // keep the pop-out window on the same light/dark theme as the app
  useEffect(() => {
    if (!win) return;
    const sync = () => { win.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? 'light'; };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, [win]);
  return (
    <Ctx.Provider value={{ open, close, isOpen: !!win, supported, focusOpen, openFocus, closeFocus }}>
      {children}
      {focusOpen && <FocusTimer onClose={closeFocus} />}
      {win && createPortal(<MiniTimer onClose={close} />, win.document.body)}
    </Ctx.Provider>
  );
}

/** the mini window is designed at this size and scales uniformly to whatever size the window is */
const STAGE = 240;

function MiniTimer({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const t = activeTask(st.tasks, st.projects);
  const now = useNow(1000);
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const w = ref.current?.ownerDocument.defaultView;
    if (!w) return;
    const fit = () => setScale(Math.max(0.25, Math.min(w.innerWidth / STAGE, w.innerHeight / STAGE, 4)));
    fit();
    w.addEventListener('resize', fit);
    return () => w.removeEventListener('resize', fit);
  }, []);
  useEffect(() => { if (!t) { const id = setTimeout(onClose, 4000); return () => clearTimeout(id); } }, [t, onClose]);
  const dir = st.settings.timerDirection ?? 'down';
  const stage = (body: ReactNode, amber = false) => (
    <div ref={ref} className={cx('mini', amber && 'amber')}>
      <div className="mini-stage" style={{ width: STAGE, height: STAGE, transform: `translate(-50%, -50%) scale(${scale})` }}>{body}</div>
    </div>
  );
  if (!t) return stage(<div className="col gap-8" style={{ alignItems: 'center' }}><Icon name="checkCircle" size={40} /><span className="t-ts">Nothing running</span></div>);
  const amber = isOverEstimate(t, now);
  const v = timerView(t, now, dir);
  const accent = amber ? 'var(--warning)' : 'var(--primary)';
  return stage(<>
    <div className="top">
      <IBtn icon="open" label="Open in Ontrack" onClick={() => { window.focus(); ui.openTask(t.id); }} />
      <span className="grow" />
      {!!t.estimateMin && <IBtn icon="swap" label={dir === 'up' ? 'Count down from the estimate' : 'Count up to the estimate'} onClick={() => st.updateSettings({ timerDirection: dir === 'up' ? 'down' : 'up' })} />}
      <IBtn icon="close" label="Close mini timer" onClick={onClose} />
    </div>
    <Ring pct={v.pct} size={150} stroke={8} color={accent} track={`color-mix(in srgb, ${accent} 18%, var(--surface))`}>
      <div className="col" style={{ alignItems: 'center' }}>
        <span className="tnum" style={{ font: '400 28px/36px var(--font)', color: accent }}>{v.main}</span>
        <span className="t-bs c-muted">{v.sub}</span>
        {!t.runStartedAt && <span className="t-lm" style={{ marginTop: 2 }}>Paused</span>}
      </div>
    </Ring>
    <span className="t-bs ellipsis" style={{ maxWidth: 200 }}>{t.title}</span>
    <div className="done row gap-8">
      {t.runStartedAt ? <IBtn icon="pause" label="Pause" kind="pc" onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" kind="pc" onClick={() => act.start(t)} />}
      <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
    </div>
  </>, amber);
}
