import { useState } from 'react';
import { useStore, useNow } from '../lib/store';
import type { Task, WorkSession } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, IBtn, cx } from '../ui/kit';
import { DayTimeInput } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import { elapsed, fmtClock, fmtDayShort, fmtMin, isoDate, relDay, todayISO, totalEstimateMin, workSessions, cap } from '../lib/time';

/*
 * Time log: every stretch of work on a task, like punch-in / punch-out on an HR portal.
 * Work spread across the day shows as separate stretches, and a stretch can cross midnight.
 * Editing the log makes it the recorded time (what Insights and "Took" use).
 */

const MIN = 60000;
const dayLabel = (iso: string) => { const d = isoDate(new Date(iso)); const r = relDay(d); return r === 'today' || r === 'yesterday' ? `${cap(r)} · ${fmtDayShort(iso)}` : fmtDayShort(iso); };
const ms = (x: WorkSession, now: number) => (x.e ? new Date(x.e).getTime() : now) - new Date(x.s).getTime();

type Edit = { i: number | 'new'; s: Date; e: Date | null };

export function TimeLog({ t }: { t: Task }) {
  const st = useStore();
  const toast = useToast();
  const running = !!t.runStartedAt;
  const now = useNow(running ? 1000 : 30000);
  const list = workSessions(t);
  const [edit, setEdit] = useState<Edit | null>(null);
  const closedSum = list.reduce((a, x) => a + (x.e ? ms(x, now) : 0), 0);
  // an old timer (before the log) saved only start → stop, so its first stretch includes breaks
  const breaksInside = closedSum - t.elapsedMs > MIN && !!list[0]?.e;
  const firstRecorded = breaksInside ? ms(list[0], now) - (closedSum - t.elapsedMs) : 0;
  const worked = elapsed(t, now);

  const save = (next: WorkSession[], msg: string) => {
    const undo = st.saveLog(t.id, next);
    toast.show(msg, { icon: 'history', action: { label: 'Undo', onClick: undo } });
  };
  const problem = (e: Edit): string | null => {
    const s = e.s.getTime(), en = e.e ? e.e.getTime() : now;
    if (s > now + MIN) return 'Clock-in can’t be in the future.';
    if (e.e && en > now + MIN) return 'Clock-out can’t be in the future.';
    if (en - s < MIN) return 'Clock-out must be after clock-in.';
    if (en - s > 24 * 60 * MIN) return 'A stretch can’t be longer than 24 hours.';
    const clash = list.some((x, j) => j !== e.i && new Date(x.s).getTime() < en && (x.e ? new Date(x.e).getTime() : now) > s);
    return clash ? 'This overlaps another stretch.' : null;
  };
  const commit = (e: Edit) => {
    if (problem(e)) return;
    const item: WorkSession = { s: e.s.toISOString(), e: e.e ? e.e.toISOString() : null };
    if (e.i === 'new') save([...list, item], 'Time added');
    else save(list.map((x, j) => (j === e.i ? item : x)), 'Time log updated');
    setEdit(null);
  };
  const remove = (i: number) => save(list.filter((_, j) => j !== i), 'Stretch removed');
  const reset = () => {
    const undo = st.resetTimer(t.id);
    toast.show('Timer reset. The task is back to not started.', { icon: 'refresh', action: { label: 'Undo', onClick: undo } });
  };
  const addNew = () => {
    const end = new Date(Math.floor(now / (5 * MIN)) * 5 * MIN);
    setEdit({ i: 'new', s: new Date(end.getTime() - 30 * MIN), e: end });
  };

  // rows grouped by the day each stretch started
  let lastDay = '';
  return (
    <div className="time-log">
      <div className="row gap-8 tl-headline">
        <Icon name="history" size={20} className="c-muted" />
        <span className="t-ts grow">Time log</span>
        {list.length > 0 && <span className="t-bs c-muted tnum">{fmtMin(Math.round(worked / MIN))} worked{t.estimateMin ? ` · estimate ${fmtMin(totalEstimateMin(t))}` : ''}</span>}
      </div>

      {list.length === 0 && !edit && <span className="t-bs c-muted" style={{ padding: '0 4px' }}>No time yet. Press ▶ to start the timer, or add time you already worked.</span>}

      {breaksInside && (
        <div className="log-note t-bs">
          <Icon name="info" size={18} />
          <span>The first stretch is from before the time log existed. Only its start and stop were saved, so it includes your breaks: {fmtMin(Math.max(0, Math.round(firstRecorded / MIN)))} of it was worked. Edit it to the real times (use Add time for the other stretches), and the log becomes the recorded time.</span>
        </div>
      )}

      {list.length > 0 && (
        <div className="log-rows">
          {list.map((x, i) => {
            const d = isoDate(new Date(x.s));
            const head = d !== lastDay ? dayLabel(x.s) : null;
            lastDay = d;
            const nextDay = x.e && isoDate(new Date(x.e)) !== d;
            if (edit && edit.i === i) return <Editor key={i} head={head} edit={edit} setEdit={setEdit} problem={problem(edit)} onSave={() => commit(edit)} />;
            return (
              <div key={i} className="col">
                {head && <span className="log-day t-ll">{head}</span>}
                <div className={cx('log-row', !x.e && 'live')}>
                  <span className="in"><Icon name="punchIn" size={16} />{fmtClock(x.s)}</span>
                  <Icon name="forward" size={14} className="c-faint" />
                  <span className="out">
                    {x.e ? <><Icon name="punchOut" size={16} />{fmtClock(x.e)}{nextDay && <span className="plus-day" data-tip={fmtDayShort(x.e)}>+{Math.round((new Date(d0(x.e)).getTime() - new Date(d0(x.s)).getTime()) / 864e5)}d</span>}</> : <><span className="live-dot" />Running</>}
                  </span>
                  <span className="dur tnum">{fmtMin(Math.max(1, Math.round(ms(x, now) / MIN)))}</span>
                  <span className="acts">
                    <IBtn sm icon="edit" label="Edit this stretch" onClick={() => setEdit({ i, s: new Date(x.s), e: x.e ? new Date(x.e) : null })} />
                    <IBtn sm icon="trash" label={x.e ? 'Remove this stretch' : 'Pause the timer to remove it'} disabled={!x.e} onClick={() => remove(i)} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit?.i === 'new' && <Editor head="New stretch" edit={edit} setEdit={setEdit} problem={problem(edit)} onSave={() => commit(edit)} />}

      <div className="row gap-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {!edit && <Btn kind="text" icon="moreTime" onClick={addNew}>Add time</Btn>}
        <span className="grow" />
        {t.firstStartedAt && !edit && <Btn kind="text" icon="refresh" onClick={reset}>Reset timer</Btn>}
      </div>
      {t.finishedAt && <span className="t-bs c-muted" style={{ padding: '0 4px' }}>Finished {fmtDayShort(t.finishedAt)} · {fmtClock(t.finishedAt)}</span>}
    </div>
  );
}
const d0 = (iso: string) => isoDate(new Date(iso));

function Editor({ head, edit, setEdit, problem, onSave }: { head: string | null; edit: Edit; setEdit: (e: Edit | null) => void; problem: string | null; onSave: () => void }) {
  const len = ((edit.e ? edit.e.getTime() : Date.now()) - edit.s.getTime()) / MIN;
  return (
    <div className="col log-edit">
      {head && <span className="log-day t-ll">{head}</span>}
      <div className="col gap-8">
        <span className="t-ll c-muted">Clock in</span>
        <DayTimeInput value={edit.s} onChange={s => setEdit({ ...edit, s })} label="Clock in" maxDate={todayISO()} />
        <span className="t-ll c-muted">Clock out</span>
        {edit.e ? <DayTimeInput value={edit.e} onChange={e => setEdit({ ...edit, e })} label="Clock out" maxDate={todayISO()} />
          : <span className="t-bm row gap-6"><span className="live-dot" />Still running</span>}
        <span className={cx('t-bs', problem ? 'c-error' : 'c-muted')}>{problem ?? `${fmtMin(Math.max(0, Math.round(len)))}${edit.e && isoDate(edit.e) !== isoDate(edit.s) ? ' · crosses midnight' : ''}`}</span>
        <div className="row gap-8"><Btn kind="text" onClick={() => setEdit(null)}>Cancel</Btn><Btn disabled={!!problem} onClick={onSave}>Save</Btn></div>
      </div>
    </div>
  );
}
