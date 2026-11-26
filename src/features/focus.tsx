import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import { activeTask } from '../lib/select';
import { Icon } from '../ui/Icon';
import { Btn, IBtn, Ring, cx, useEsc } from '../ui/kit';
import { fmtClock, isOverEstimate, remainingMs, timerView } from '../lib/time';
import { hideSystemBars, keepScreenOn } from '../lib/native';
import { useTaskActions } from './tasks';

const CALM_AFTER = 5000;

/** Phone focus timer: the whole screen becomes one big, quiet countdown for the running task.
 *  Keeps the screen on, hides the system bars, and fades its buttons away until you tap. */
export function FocusTimer({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const t = activeTask(st.tasks, st.projects);
  const now = useNow(1000);
  const [calm, setCalm] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const [size, setSize] = useState(() => ringSize());
  useEsc(onClose);

  const wake = () => {
    setCalm(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCalm(true), CALM_AFTER);
  };
  useEffect(() => {
    keepScreenOn(true); hideSystemBars(true); wake();
    const fit = () => setSize(ringSize());
    window.addEventListener('resize', fit);
    return () => { keepScreenOn(false); hideSystemBars(false); window.clearTimeout(timer.current); window.removeEventListener('resize', fit); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // nothing left to time (finished here or on another device): close shortly after
  useEffect(() => { if (!t) { const id = setTimeout(onClose, 2500); return () => clearTimeout(id); } }, [t, onClose]);

  if (!t) return createPortal(
    <div className="focus"><div className="focus-center"><Icon name="checkCircle" size={56} style={{ color: 'var(--primary)' }} /><span className="t-tl">Nothing running</span></div></div>,
    document.body,
  );

  const running = !!t.runStartedAt;
  const amber = isOverEstimate(t, now);
  const dir = st.settings.timerDirection ?? 'down';
  const v = timerView(t, now, dir);
  const accent = amber ? 'var(--warning)' : 'var(--primary)';
  const p = st.projectById(t.projectId);
  const rem = remainingMs(t, now);
  const sub = !t.estimateMin ? 'elapsed · no estimate' : v.sub;
  const meta = [p ? `${p.emoji} ${p.name}` : null, running && t.estimateMin && rem > 0 ? `done by ${fmtClock(new Date(now + rem))}` : null].filter(Boolean).join(' · ');

  return createPortal(
    <div className={cx('focus', amber && 'amber', calm && 'calm')} role="dialog" aria-label="Focus timer" onPointerDown={wake}>
      <div className="focus-top fades">
        <IBtn icon="chevDown" label="Close focus timer" onClick={onClose} />
        <span className="grow" />
        {!!t.estimateMin && <IBtn icon="swap" label={dir === 'up' ? 'Count down from the estimate' : 'Count up to the estimate'} onClick={() => st.updateSettings({ timerDirection: dir === 'up' ? 'down' : 'up' })} />}
        <IBtn icon="open" label="Open task" onClick={() => { onClose(); ui.openTask(t.id); }} />
      </div>
      <div className="focus-center">
        <Ring pct={v.pct} size={size} stroke={Math.max(8, Math.round(size / 28))} color={accent} track={`color-mix(in srgb, ${accent} 16%, var(--surface))`}>
          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <span className="focus-time tnum" style={{ color: accent, fontSize: Math.round(size / 4.6) }}>{v.main}</span>
            <span className="focus-sub">{sub}</span>
            {!running && <span className="focus-paused"><Icon name="pause" size={18} />Paused</span>}
          </div>
        </Ring>
        <div className="focus-info">
          <div className="focus-title">{t.title}</div>
          {meta && <div className="focus-meta">{meta}</div>}
        </div>
      </div>
      <div className="focus-actions fades">
        {amber && running ? <Btn kind="warn-outlined" icon="edit" onClick={() => { onClose(); ui.openWhatHappened(t.id); }}>What happened?</Btn> : <span className="focus-spacer" />}
        <button className="focus-play state" aria-label={running ? 'Pause' : 'Resume'} onClick={() => (running ? act.pause(t) : act.start(t))}>
          <Icon name={running ? 'pause' : 'play'} />
        </button>
        <Btn kind={amber ? 'warn' : 'filled'} big icon="check" onClick={() => act.finish(t)}>Done</Btn>
      </div>
      {calm && <div className="focus-hint">Tap for controls</div>}
    </div>,
    document.body,
  );
}

function ringSize() {
  const w = window.innerWidth, h = window.innerHeight;
  const landscape = w > h;
  return Math.round(Math.max(180, Math.min(landscape ? h * 0.62 : w * 0.8, landscape ? w * 0.42 : h * 0.48, 460)));
}
