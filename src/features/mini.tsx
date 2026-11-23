import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import { activeTask } from '../lib/select';
import { Icon } from '../ui/Icon';
import { Btn, IBtn, Ring, cx } from '../ui/kit';
import { useToast } from '../ui/Toast';
import { elapsed, fmtMin, fmtTimer, isOverEstimate, remainingMs, totalEstimateMin } from '../lib/time';
import { useTaskActions } from './tasks';

interface Mini { open: () => void; close: () => void; isOpen: boolean; supported: boolean }
const Ctx = createContext<Mini>({ open: () => {}, close: () => {}, isOpen: false, supported: false });
export const useMiniTimer = () => useContext(Ctx);

declare global { interface Window { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } } }

/** E09 / F03 — always-on-top mini timer using Document Picture-in-Picture (Chrome / Edge). */
export function MiniTimerProvider({ children }: { children: ReactNode }) {
  const [win, setWin] = useState<Window | null>(null);
  const toast = useToast();
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  const open = useCallback(async () => {
    if (!supported) { toast.show('The pop-out mini timer needs Chrome or Edge.', { icon: 'info' }); return; }
    if (win) { win.focus(); return; }
    try {
      const w = await window.documentPictureInPicture!.requestWindow({ width: 240, height: 240 });
      document.querySelectorAll('style, link[rel="stylesheet"]').forEach(n => w.document.head.appendChild(n.cloneNode(true)));
      w.document.body.style.margin = '0';
      w.document.title = 'Ontrack timer';
      w.addEventListener('pagehide', () => setWin(null));
      setWin(w);
    } catch { toast.show('Couldn’t open the mini timer.', { icon: 'warn' }); }
  }, [supported, win, toast]);
  const close = useCallback(() => { win?.close(); setWin(null); }, [win]);
  return (
    <Ctx.Provider value={{ open, close, isOpen: !!win, supported }}>
      {children}
      {win && createPortal(<MiniTimer onClose={close} />, win.document.body)}
    </Ctx.Provider>
  );
}

function MiniTimer({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const t = activeTask(st.tasks, st.projects);
  const now = useNow(1000);
  useEffect(() => { if (!t) { const id = setTimeout(onClose, 4000); return () => clearTimeout(id); } }, [t, onClose]);
  if (!t) return <div className="mini"><Icon name="checkCircle" size={40} /><span className="t-ts">Nothing running</span></div>;
  const amber = isOverEstimate(t, now);
  const total = totalEstimateMin(t) * 60000;
  const pct = total ? Math.min(100, (elapsed(t, now) / total) * 100) : 0;
  const rem = remainingMs(t, now);
  return (
    <div className={cx('mini', amber && 'amber')}>
      <div className="top">
        <IBtn icon="open" label="Open in Ontrack" onClick={() => { window.focus(); ui.openTask(t.id); }} />
        <IBtn icon="close" label="Close mini timer" onClick={onClose} />
      </div>
      <Ring pct={amber ? 100 : pct} size={150} stroke={8} color={amber ? 'var(--warning)' : 'var(--primary)'} track={amber ? '#ffb1c8' : 'var(--surface-lowest)'}>
        <div className="col" style={{ alignItems: 'center' }}>
          <span className="tnum" style={{ font: '400 28px/36px var(--font)', color: amber ? 'var(--warning)' : 'var(--primary)' }}>{t.estimateMin ? fmtTimer(rem) : fmtTimer(elapsed(t, now))}</span>
          <span className="t-bs">{!t.estimateMin ? 'elapsed' : amber ? 'over estimate' : `left of ${fmtMin(totalEstimateMin(t))}`}</span>
          {!t.runStartedAt && <span className="t-lm" style={{ marginTop: 2 }}>Paused</span>}
        </div>
      </Ring>
      <span className="t-bs ellipsis" style={{ maxWidth: 200 }}>{t.title}</span>
      <div className="done row gap-8" style={{ position: 'absolute', bottom: 10 }}>
        {t.runStartedAt ? <IBtn icon="pause" label="Pause" kind="pc" onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" kind="pc" onClick={() => act.start(t)} />}
        <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
      </div>
    </div>
  );
}
