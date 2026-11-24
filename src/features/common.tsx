import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import { activeTask } from '../lib/select';
import { Icon } from '../ui/Icon';
import { Btn, Confirm, IBtn, cx } from '../ui/kit';
import { useToast } from '../ui/Toast';
import { elapsed, fmtTimer, isOverEstimate, remainingMs } from '../lib/time';
import { useTaskActions } from './tasks';
import { useMiniTimer } from './mini';

/** One-line reminder that sample data is mixed in, with a way to clear it. */
export function SampleBanner() {
  const st = useStore();
  const toast = useToast();
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem('ot-sample-banner') === '0'; } catch { return false; } });
  const [ask, setAsk] = useState(false);
  if (!st.hasSample || hidden) return null;
  return (
    <div className="plan-line">
      <Icon name="info" />
      <span className="t-bm grow">You’re seeing sample projects, tasks and journal entries next to your own.</span>
      <Btn kind="tonal" onClick={() => setAsk(true)}>Clear sample data</Btn>
      <IBtn icon="close" label="Hide for now" onClick={() => { setHidden(true); try { sessionStorage.setItem('ot-sample-banner', '0'); } catch { /* ignore */ } }} />
      {ask && <Confirm title="Clear sample data?" body="Removes the example projects, tasks, journal entries and check-ins. Your own stay." confirm="Clear" danger onClose={() => setAsk(false)}
        onConfirm={async () => { await st.clearSample(); toast.show('Sample data cleared', { icon: 'checkCircle' }); }} />}
    </div>
  );
}

/** Compact timer in the top bar on every page except My Day (which has the big Now card). */
export function TimerChip({ side = false }: { side?: boolean }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const mini = useMiniTimer();
  const loc = useLocation();
  const t = activeTask(st.tasks, st.projects);
  const running = !!t?.runStartedAt;
  const now = useNow(1000, running);
  if (!t || loc.pathname.startsWith('/my-day')) return null;
  const over = isOverEstimate(t, now);
  const time = t.estimateMin ? fmtTimer(remainingMs(t, now)) : fmtTimer(elapsed(t, now));
  if (side) return (
    <div className={cx('timer-chip in-side', over && 'amber', !running && 'paused')}>
      <button className="tc-main state" onClick={() => ui.openTask(t.id)} data-tip="Open task">
        <Icon name={over ? 'warn' : running ? 'hourglass' : 'pause'} size={18} />
        <span className="col grow" style={{ minWidth: 0 }}>
          <span className="t-lm ellipsis">{t.title}</span>
          <span className="t-bs tnum">{time}{t.estimateMin ? (over ? ' over' : ' left') : ' elapsed'}{running ? '' : ' · paused'}</span>
        </span>
      </button>
      {running ? <IBtn sm icon="pause" label="Pause" onClick={() => act.pause(t)} /> : <IBtn sm icon="play" label="Resume" onClick={() => act.start(t)} />}
      <IBtn sm icon="pip" label="Pop out mini timer" onClick={() => mini.open()} />
      <IBtn sm icon="check" label="Done" onClick={() => act.finish(t)} />
    </div>
  );
  return (
    <div className={cx('timer-chip', over && 'amber', !running && 'paused')}>
      <button className="row gap-8 grow state" style={{ minWidth: 0, borderRadius: 20, padding: '0 8px 0 12px', height: 40 }} onClick={() => ui.openTask(t.id)} data-tip="Open task">
        <Icon name={running ? 'hourglass' : 'pause'} size={18} />
        <span className="t-ts ellipsis" style={{ maxWidth: 140, minWidth: 40 }}>{t.title}</span>
        <span className="t-ts tnum">{time}{t.estimateMin ? (over ? ' over' : ' left') : ''}</span>
      </button>
      {running ? <IBtn sm icon="pause" label="Pause" onClick={() => act.pause(t)} /> : <IBtn sm icon="play" label="Resume" onClick={() => act.start(t)} />}
      <IBtn sm icon="pip" label="Pop out mini timer" onClick={() => mini.open()} />
      <IBtn sm icon="check" label="Done" onClick={() => act.finish(t)} />
    </div>
  );
}
