import { useEffect, useRef, useState } from 'react';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import type { Task } from '../lib/types';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, Confirm, IBtn, MenuList, Pill, Popover, Tag, cx, useAnchor } from '../ui/kit';
import { DuePicker, EstimateDialog, TimeInput } from '../ui/pickers';
import { ProjectPicker, RemindPicker, OutcomeChips, useTaskActions } from './tasks';
import { statusTone, avgOverrunMin, tagTone } from '../lib/select';
import {
  atTime, cap, dueAt, dueLabel, elapsed, fmtClock, fmtDayComma, fmtDayShort, fmtMin, fmtTimer, hhmm, isDone, isOverEstimate, isOverdue,
  isoDate, relDay, remainingMs, startBy, todayISO, totalEstimateMin, uid,
} from '../lib/time';

function Prop({ icon, k, children }: { icon: IconName; k: string; children: React.ReactNode }) {
  return <div className="prop-row"><span className="k"><Icon name={icon} />{k}</span><div className="v">{children}</div></div>;
}

export function TaskDrawer({ t }: { t: Task }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const running = !!t.runStartedAt;
  const now = useNow(1000, running);
  const done = isDone(t);
  const amber = isOverEstimate(t, now);
  const p = st.projectById(t.projectId);
  const pa = useAnchor(), sa = useAnchor(), da = useAnchor(), ra = useAnchor();
  const [estOpen, setEstOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [note, setNote] = useState(t.note);
  const [stepText, setStepText] = useState('');
  const [editFinish, setEditFinish] = useState(false);
  useEffect(() => { setTitle(t.title); setNote(t.note); setEditFinish(false); }, [t.id]);
  useEffect(() => { if (document.activeElement?.getAttribute('aria-label') !== 'Task title') setTitle(t.title); }, [t.title]);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = titleRef.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [title]);
  const inMyDay = !!t.myDayDate && t.myDayDate >= todayISO();
  const sb = startBy(t, st.settings);
  const extra = t.reEstimates.reduce((a, r) => a + r.addMin, 0);
  const linked = st.entries.filter(e => e.taskIds.includes(t.id));
  const saveTitle = () => { if (title.trim() && title !== t.title) st.updateTask(t.id, { title: title.trim() }); else setTitle(t.title); };

  return (
    <aside className="sheet" aria-label="Task details">
      <div className="sheet-head">
        <button className="val-btn state grow" style={{ minHeight: 40, maxWidth: 'calc(100% - 48px)' }} onClick={e => pa.open(e)} data-tip="Change project">
          <span className="emoji" style={{ fontSize: 18 }}>{p?.emoji ?? '📥'}</span>
          <span className="t-tm ellipsis">{p?.name ?? 'No project'}</span>
          <Icon name="edit" className="hover-only" />
        </button>
        <IBtn icon="close" label="Close" onClick={() => ui.openTask(null)} />
      </div>
      <div className="sheet-body">
        {/* Task card */}
        <div className={cx('card')} style={{ background: amber ? 'var(--warning-container)' : 'var(--surface-lowest)', padding: '12px 16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row gap-4" style={{ alignItems: 'flex-start' }}>
            <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={() => act.toggleDone(t)}>
              <Icon name={done ? 'checkCircle' : 'circle'} />
            </button>
            <textarea ref={titleRef} aria-label="Task title" className="inline-input t-tl" rows={1} value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              style={{ resize: 'none', paddingTop: 6, textDecoration: done ? 'line-through' : undefined, color: done ? 'var(--on-surface-variant)' : undefined }} />
          </div>
          <div className="row gap-8" style={{ paddingLeft: 44, flexWrap: 'wrap' }}>
            <Pill name={t.status} tone={statusTone(t.status, st.settings.taskStatuses)} menu onClick={e => sa.open(e)} />
            {done && <OutcomeChips t={t} />}
            {!done && amber && <Tag kind="warn" icon="warn">Over estimate</Tag>}
            {!done && isOverdue(t, st.settings, now) && <Tag kind="err">Overdue</Tag>}
          </div>
        </div>

        {/* Timer (E16) */}
        {!done && (t.firstStartedAt || running) && (
          <div className="row gap-12" style={{ background: amber ? 'var(--warning-container)' : 'var(--primary-container)', color: amber ? 'var(--on-warning-container)' : 'var(--on-primary-container)', borderRadius: 16, padding: '12px 12px 12px 16px' }}>
            <div className="col grow">
              <span className="t-hs tnum" style={{ color: amber ? 'var(--warning)' : 'var(--primary)' }}>{t.estimateMin ? fmtTimer(remainingMs(t, now)) : fmtTimer(elapsed(t, now))}</span>
              <span className="t-bs">{!t.estimateMin ? 'elapsed' : amber ? 'over estimate' : running ? `left · done by ${fmtClock(new Date(now + remainingMs(t, now)))}` : 'left · paused'}</span>
            </div>
            {amber && <Btn kind="warn-outlined" onClick={() => ui.openWhatHappened(t.id)}>What happened?</Btn>}
            {running ? <IBtn icon="pause" label="Pause" onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" kind="pc" onClick={() => act.start(t)} />}
            <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
          </div>
        )}

        {/* My Day */}
        {!done && (
          <button className={cx('row gap-12 state')} onClick={() => act.toggleMyDay(t)}
            style={{ minHeight: 48, padding: '0 16px', borderRadius: 12, background: inMyDay ? 'var(--secondary-container)' : 'var(--surface-lowest)', color: inMyDay ? 'var(--on-secondary-container)' : 'var(--primary)', font: '500 14px/20px var(--font)' }}>
            <Icon name={inMyDay ? 'sunFill' : 'sun'} />{inMyDay ? 'Added to My Day' : 'Add to My Day'}
            {inMyDay && <span className="grow" />}{inMyDay && <Icon name="close" size={18} />}
          </button>
        )}

        {/* Properties */}
        <div className="col" style={{ background: 'var(--surface-lowest)', borderRadius: 16, padding: '4px 8px 4px 16px' }}>
          <Prop icon="hourglass" k="Estimate">
            <button className={cx('val-btn state', !t.estimateMin && 'placeholder')} onClick={() => setEstOpen(true)}>
              {t.estimateMin ? fmtMin(t.estimateMin) : 'Set estimate'}{extra ? <span className="c-muted">+{fmtMin(extra)} re-estimated</span> : null}<Icon name="edit" className="hover-only" />
            </button>
            {amber && !done && <span className="row gap-4">{[5, 10, 30].map(m => <Btn key={m} kind="text" onClick={() => st.reEstimate(t.id, m)}>+{m}</Btn>)}</span>}
          </Prop>
          <Prop icon="event" k="Due">
            <button className={cx('val-btn state', !t.dueDate && 'placeholder')} onClick={e => da.open(e)}>
              {t.dueDate ? cap(dueLabel(t)!) : 'Add due date'}<Icon name="edit" className="hover-only" />
            </button>
            {sb && !done && <span className="t-bs c-muted">Start by {relDay(isoDate(sb)) === 'today' ? '' : cap(relDay(isoDate(sb))) + ' '}{fmtClock(sb)}</span>}
          </Prop>
          <Prop icon="bell" k="Remind me">
            <button className={cx('val-btn state', !t.remindAt && 'placeholder')} onClick={e => ra.open(e)}>
              {t.remindAt ? `${cap(relDay(isoDate(new Date(t.remindAt))))} ${fmtClock(t.remindAt)}` : 'Add reminder'}<Icon name="edit" className="hover-only" />
            </button>
          </Prop>
          {t.firstStartedAt && <Prop icon="play" k="Started"><span className="val-btn">{fmtDayShort(t.firstStartedAt)} · {fmtClock(t.firstStartedAt)}</span></Prop>}
          {done && (
            <Prop icon="checkCircleO" k="Finished">
              {editFinish
                ? <FinishEdit t={t} onClose={() => setEditFinish(false)} />
                : <button className="val-btn state" onClick={() => setEditFinish(true)} data-tip="Edit finish time">{fmtDayShort(t.finishedAt!)} · {fmtClock(t.finishedAt!)}<Icon name="edit" className="hover-only" /></button>}
            </Prop>
          )}
        </div>

        {/* Steps (E19) */}
        <div className="col gap-4" style={{ background: 'var(--surface-lowest)', borderRadius: 16, padding: '12px 12px 8px' }}>
          <div className="row gap-8" style={{ padding: '0 4px 4px' }}><span className="t-ts c-muted grow">Steps</span>{t.steps.length > 0 && <span className="t-bs c-muted">{t.steps.filter(s => s.done).length} of {t.steps.length}</span>}</div>
          {t.steps.map(s => (
            <div key={s.id} className={cx('step-row', s.done && 'done')}>
              <button className={cx('check', s.done && 'on')} style={{ width: 32, height: 32 }} aria-label={s.done ? 'Mark step not done' : 'Mark step done'}
                onClick={() => st.updateTask(t.id, { steps: t.steps.map(x => x.id === s.id ? { ...x, done: !x.done } : x) })}>
                <Icon name={s.done ? 'checkCircle' : 'circle'} size={20} />
              </button>
              <span className="t-bm grow">{s.title}</span>
              <IBtn sm icon="close" label="Remove step" className="del" onClick={() => st.updateTask(t.id, { steps: t.steps.filter(x => x.id !== s.id) })} />
            </div>
          ))}
          <div className="row gap-8" style={{ padding: '0 4px', minHeight: 40 }}>
            <Icon name="add" style={{ color: 'var(--primary)', width: 20 }} />
            <input className="inline-input t-bm" placeholder="Add a step" value={stepText} onChange={e => setStepText(e.target.value)} aria-label="Add a step"
              onKeyDown={e => { if (e.key === 'Enter' && stepText.trim()) { st.updateTask(t.id, { steps: [...t.steps, { id: uid(), title: stepText.trim(), done: false }] }); setStepText(''); } }} />
          </div>
        </div>

        {/* Note */}
        <div className="field multi" style={{ '--label-bg': 'var(--surface-low)' } as React.CSSProperties}>
          <label>Note</label>
          <textarea rows={3} value={note} placeholder="Add a note" onChange={e => setNote(e.target.value)} onBlur={() => note !== t.note && st.updateTask(t.id, { note })} aria-label="Note" />
        </div>

        {/* Journal */}
        <div className="col gap-8">
          <div className="row gap-8"><span className="t-ts c-muted grow">Journal</span>{linked.length > 0 && <span className="t-bs c-muted">{linked.length}</span>}</div>
          {linked.map(e => (
            <button key={e.id} className="col gap-4 state" onClick={() => ui.openEntry(e.id)} style={{ textAlign: 'left', background: 'var(--surface-lowest)', borderRadius: 12, padding: '12px 16px' }}>
              <span className="t-bm">{e.body}</span>
              <span className="row gap-8 t-bs c-muted">{fmtDayShort(e.whenAt)}{e.tags.map(tg => <Tag key={tg} kind={tagTone(tg)} icon="tag">{tg}</Tag>)}</span>
            </button>
          ))}
          <Btn kind="outlined" icon="draw" className="" onClick={() => ui.newEntry({ taskIds: [t.id], source: 'fromTask' })}>Write a journal entry</Btn>
        </div>
      </div>
      <div className="sheet-foot">
        <span className="t-bs c-muted grow">Created {fmtDayComma(t.createdAt)}</span>
        <IBtn icon="trash" label="Delete task" onClick={() => setConfirmDel(true)} />
      </div>

      {pa.isOpen && <ProjectPicker anchor={pa.el} value={t.projectId} onClose={pa.close} onPick={id => st.updateTask(t.id, { projectId: id })} />}
      {sa.isOpen && (
        <Popover anchor={sa.el} onClose={sa.close}>
          <MenuList width={260} onClose={sa.close} items={[{ label: 'Status' }, ...st.settings.taskStatuses.map(s => ({
            t: s.name, sel: s.name === t.status, dot: `var(--${({ blue: 'primary', green: 'success', purple: 'tertiary', amber: 'warning', red: 'error', secondary: 'secondary' } as Record<string, string>)[s.tone] ?? 'outline'})`, sub: s.note,
            onClick: () => {
              if (s.name === 'Done' && !done) act.finish(t);
              else if (s.name !== 'Done' && done) { st.reopenTask(t.id); st.updateTask(t.id, { status: s.name }); }
              else st.updateTask(t.id, { status: s.name });
            },
          }))]} />
        </Popover>
      )}
      {da.isOpen && <Popover anchor={da.el} onClose={da.close} placement="left"><DuePicker date={t.dueDate} time={t.dueTime} onDone={(d, tm) => { st.updateTask(t.id, { dueDate: d, dueTime: tm }); da.close(); }} onClear={() => { st.updateTask(t.id, { dueDate: null, dueTime: null }); da.close(); }} /></Popover>}
      {ra.isOpen && <RemindPicker anchor={ra.el} onClose={ra.close} t={t} value={t.remindAt} onPick={iso => st.updateTask(t.id, { remindAt: iso, remindedAt: null })} />}
      {estOpen && <EstimateDialog editing={!!t.firstStartedAt} initial={t.firstStartedAt ? totalEstimateMin(t) : t.estimateMin} dueAt={dueAt(t, st.settings)} avgOverrunMin={avgOverrunMin(st.tasks)} onClose={() => setEstOpen(false)}
        onSet={min => {
          if (min == null) { st.updateTask(t.id, { estimateMin: null, reEstimates: [] }); return; }
          if (t.firstStartedAt && t.estimateMin) { const diff = min - totalEstimateMin(t); if (diff) st.reEstimate(t.id, diff); }
          else st.updateTask(t.id, { estimateMin: min });
        }} />}
      {confirmDel && <Confirm title="Delete this task?" body={`“${t.title}” and its timer history will be deleted. Journal entries stay but lose the link.`} confirm="Delete" danger onClose={() => setConfirmDel(false)} onConfirm={() => { ui.openTask(null); st.deleteTask(t.id); }} />}
    </aside>
  );
}

/** E18 — inline edit of the finish time */
function FinishEdit({ t, onClose }: { t: Task; onClose: () => void }) {
  const st = useStore();
  const f = new Date(t.finishedAt!);
  const [v, setV] = useState(hhmm(f));
  const day = isoDate(f);
  const preview = atTime(day, v);
  const started = t.firstStartedAt ? new Date(t.firstStartedAt) : null;
  const invalid = (started && preview < started) || preview.getTime() > Date.now() + 60000;
  const took = Math.max(0, t.elapsedMs + (preview.getTime() - f.getTime()));
  return (
    <div className="col gap-8" style={{ padding: '8px 0' }}>
      <div className="row gap-8"><TimeInput value={v} onChange={setV} label="Finish time" /><span className="t-bs c-muted">{day === todayISO() ? 'Today' : fmtDayShort(day)}</span></div>
      <span className={cx('t-bs', invalid ? 'c-error' : 'c-muted')}>{invalid ? 'Finish time must be after the start and not in the future.' : `Took ${fmtMin(took / 60000)}${t.estimateMin ? ` · estimate ${fmtMin(t.estimateMin)}` : ''}`}</span>
      <div className="row gap-8"><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn disabled={!!invalid} onClick={() => { st.setFinishTime(t.id, preview); onClose(); }}>Save</Btn></div>
    </div>
  );
}
