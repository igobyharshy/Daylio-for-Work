import { useEffect, useRef, useState } from 'react';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import type { Step, Task } from '../lib/types';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, IBtn, MenuList, Pill, Popover, Switch, Tag, cx, useAnchor } from '../ui/kit';
import { DuePicker, EstimateDialog, TimeInput } from '../ui/pickers';
import { ProjectPicker, RemindPicker, OutcomeChips, useTaskActions, toneDot } from './tasks';
import { statusTone, avgOverrunMin, tagChipTone } from '../lib/select';
import { useMiniTimer } from './mini';
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
  const mini = useMiniTimer();
  const running = !!t.runStartedAt;
  const now = useNow(1000, running);
  const done = isDone(t);
  const amber = isOverEstimate(t, now);
  const p = st.projectById(t.projectId);
  const pa = useAnchor(), pa2 = useAnchor(), sa = useAnchor(), da = useAnchor(), ra = useAnchor();
  const [estOpen, setEstOpen] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [note, setNote] = useState(t.note);
  const [editFinish, setEditFinish] = useState(false);
  useEffect(() => { setTitle(t.title); setNote(t.note); setEditFinish(false); }, [t.id]);
  useEffect(() => { if (document.activeElement?.getAttribute('aria-label') !== 'Task title') setTitle(t.title); }, [t.title]);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = titleRef.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }, [title]);
  useEffect(() => { const el = noteRef.current; if (el) { el.style.height = 'auto'; el.style.height = Math.max(72, el.scrollHeight) + 'px'; } }, [note]);
  const inMyDay = act.inMyDay(t);
  const sb = startBy(t, st.settings);
  const extra = t.reEstimates.reduce((a, r) => a + r.addMin, 0);
  const linked = st.entries.filter(e => e.taskIds.includes(t.id));
  const overdue = !done && isOverdue(t, st.settings, now);
  const saveTitle = () => { if (title.trim() && title !== t.title) st.updateTask(t.id, { title: title.trim() }); else setTitle(t.title); };

  // when the due date moves, a "30 min before it's due" reminder moves with it
  const setDue = (d: string | null, tm: string | null) => {
    const old = dueAt(t, st.settings);
    const patch: Partial<Task> = { dueDate: d, dueTime: tm };
    if (old && t.remindAt && !t.remindedAt && Math.abs(new Date(t.remindAt).getTime() - (old.getTime() - 30 * 60000)) < 60000) {
      const nd = dueAt({ dueDate: d, dueTime: tm }, st.settings);
      patch.remindAt = nd ? new Date(nd.getTime() - 30 * 60000).toISOString() : null;
    }
    st.updateTask(t.id, patch);
  };

  return (
    <aside className="sheet" aria-label="Task details">
      <div className="sheet-head">
        <button className="val-btn state grow" style={{ minHeight: 40, maxWidth: 'calc(100% - 48px)' }} onClick={e => pa.open(e)} data-tip="Move to another project">
          <span className="emoji" style={{ fontSize: 18 }}>{p?.emoji ?? '📥'}</span>
          <span className="t-tm ellipsis">{p?.name ?? 'Inbox'}</span>
          <Icon name="chevDown" />
        </button>
        <IBtn icon="close" label="Close" onClick={() => ui.openTask(null)} />
      </div>
      <div className="sheet-body">
        {/* Title + steps in one card (To Do style) */}
        <div className="card title-card" style={{ background: amber ? 'var(--warning-container)' : 'var(--surface-lowest)' }}>
          <div className="row gap-4" style={{ alignItems: 'flex-start', padding: '8px 8px 4px 4px' }}>
            <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} data-tip={done ? 'Mark not done' : 'Mark done'} onClick={() => act.toggleDone(t)}>
              <Icon name={done ? 'checkCircle' : 'circle'} />
            </button>
            <textarea ref={titleRef} aria-label="Task title" className="inline-input t-tl" rows={1} value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              style={{ resize: 'none', paddingTop: 6, fontWeight: 500, textDecoration: done ? 'line-through' : undefined, color: done ? 'var(--on-surface-variant)' : undefined }} />
          </div>
          <Steps t={t} />
          {done && <div className="row gap-8" style={{ flexWrap: 'wrap', padding: '4px 16px 12px 48px' }}><OutcomeChips t={t} /></div>}
        </div>

        {/* Timer */}
        {!done && (t.firstStartedAt || running) && (
          <div className="timer-block" style={{ background: amber ? 'var(--warning-container)' : 'var(--primary-container)', color: amber ? 'var(--on-warning-container)' : 'var(--on-primary-container)' }}>
            <div className="row gap-8">
              <div className="col grow">
                <span className="t-hs tnum" style={{ color: amber ? 'var(--warning)' : 'var(--primary)' }}>{t.estimateMin ? fmtTimer(remainingMs(t, now)) : fmtTimer(elapsed(t, now))}</span>
                <span className="t-bs">{!t.estimateMin ? (running ? 'elapsed · no estimate' : 'elapsed · paused') : amber ? (running ? 'over estimate' : 'over estimate · paused') : running ? `left · done by ${fmtClock(new Date(now + remainingMs(t, now)))}` : 'left · paused'}</span>
              </div>
              <IBtn icon="pip" label="Pop out mini timer" onClick={() => mini.open()} />
              {running ? <IBtn icon="pause" label="Pause" onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" kind="pc" onClick={() => act.start(t)} />}
              <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
            </div>
            {amber && (
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                <span className="t-bs">Need more time?</span>
                {[5, 10, 30].map(m => <Btn key={m} kind="text" onClick={() => st.reEstimate(t.id, m)}>+{m} min</Btn>)}
                <span className="grow" />
                {running && <Btn kind="warn-outlined" icon="edit" onClick={() => ui.openWhatHappened(t.id)}>What happened?</Btn>}
              </div>
            )}
          </div>
        )}

        {/* Details */}
        <div className="col" style={{ background: 'var(--surface-lowest)', borderRadius: 16, padding: '4px 8px 4px 16px' }}>
          <Prop icon="flag" k="Status">
            <Pill name={t.status} tone={statusTone(t.status, st.settings.taskStatuses)} menu onClick={e => sa.open(e)} />
          </Prop>
          <Prop icon="folder" k="Project">
            <button className="val-btn state" onClick={e => pa2.open(e)}><span className="emoji">{p?.emoji ?? '📥'}</span>{p?.name ?? 'Inbox'}<Icon name="edit" className="hover-only" /></button>
          </Prop>
          <Prop icon="hourglass" k="Estimate">
            <button className={cx('val-btn state', !t.estimateMin && 'placeholder')} onClick={() => setEstOpen(true)}>
              {t.estimateMin ? fmtMin(t.estimateMin) : 'Set estimate'}{extra ? <span className="c-muted">+{fmtMin(extra)} re-estimated</span> : null}<Icon name="edit" className="hover-only" />
            </button>
          </Prop>
          <Prop icon="event" k="Due">
            <div className="col" style={{ alignItems: 'flex-start' }}>
              <div className="row gap-8">
                <button className={cx('val-btn state', !t.dueDate && 'placeholder', overdue && 'c-error')} onClick={e => da.open(e)}>
                  {t.dueDate ? cap(dueLabel(t)!) : 'Add due date'}<Icon name="edit" className="hover-only" />
                </button>
                {overdue && <Tag kind="err">Overdue</Tag>}
              </div>
              {sb && !done && sb.getTime() > now && <span className="t-bs c-muted" style={{ padding: '0 10px 6px' }}>Start by {relDay(isoDate(sb)) === 'today' ? '' : cap(relDay(isoDate(sb))) + ' '}{fmtClock(sb)}{!t.dueTime ? ' · based on the end of your work day' : ''}</span>}
            </div>
          </Prop>
          <Prop icon="bell" k="Remind me">
            <button className={cx('val-btn state', !t.remindAt && 'placeholder')} onClick={e => ra.open(e)}>
              {t.remindAt ? `${cap(relDay(isoDate(new Date(t.remindAt))))} ${fmtClock(t.remindAt)}` : 'Add reminder'}<Icon name="edit" className="hover-only" />
            </button>
          </Prop>
          {!done && (
            <Prop icon={inMyDay ? 'sunFill' : 'sun'} k="My Day">
              <span className="row gap-12 grow" data-tip={running && inMyDay ? 'Running tasks stay in My Day. Pause the timer first.' : undefined}>
                <Switch on={inMyDay} onChange={() => act.toggleMyDay(t)} label="In My Day" />
                {running && inMyDay && <span className="t-bs c-muted row gap-4"><Icon name="lock" size={14} />While the timer runs</span>}
              </span>
            </Prop>
          )}
          {t.firstStartedAt && <Prop icon="play" k="Started"><span className="val-btn">{fmtDayShort(t.firstStartedAt)} · {fmtClock(t.firstStartedAt)}</span></Prop>}
          {done && (
            <Prop icon="checkCircleO" k="Finished">
              {editFinish
                ? <FinishEdit t={t} onClose={() => setEditFinish(false)} />
                : <button className="val-btn state" onClick={() => setEditFinish(true)} data-tip="Edit finish time">{fmtDayShort(t.finishedAt!)} · {fmtClock(t.finishedAt!)}<Icon name="edit" className="hover-only" /></button>}
            </Prop>
          )}
        </div>

        {/* Note */}
        <div className="field multi" style={{ '--label-bg': 'var(--surface-low)' } as React.CSSProperties}>
          <label>Note</label>
          <textarea ref={noteRef} rows={3} value={note} placeholder="Add a note" onChange={e => setNote(e.target.value)} onBlur={() => note !== t.note && st.updateTask(t.id, { note })} aria-label="Note" />
        </div>

        {/* Journal */}
        <div className="col gap-8">
          <div className="row gap-8"><span className="t-ts c-muted grow">Journal</span>{linked.length > 0 && <span className="t-bs c-muted">{linked.length}</span>}</div>
          {linked.map(e => (
            <button key={e.id} className="col gap-4 state" onClick={() => ui.openEntry(e.id)} style={{ textAlign: 'left', background: 'var(--surface-lowest)', borderRadius: 12, padding: '12px 16px' }}>
              <span className="t-bm">{e.body}</span>
              <span className="row gap-8 t-bs c-muted">{fmtDayShort(e.whenAt)}{e.tags.map(tg => <Tag key={tg} tone={tagChipTone(tg)} icon="tag">{tg}</Tag>)}</span>
            </button>
          ))}
          <Btn kind="outlined" icon="draw" className="" onClick={() => ui.newEntry({ taskIds: [t.id], source: 'fromTask' })}>Write a journal entry</Btn>
        </div>
      </div>
      <div className="sheet-foot">
        <span className="t-bs c-muted grow">Created {fmtDayComma(t.createdAt)}</span>
        <IBtn icon="trash" label="Delete task" onClick={() => act.remove(t)} />
      </div>

      {pa.isOpen && <ProjectPicker anchor={pa.el} value={t.projectId} onClose={pa.close} onPick={id => st.updateTask(t.id, { projectId: id })} />}
      {pa2.isOpen && <ProjectPicker anchor={pa2.el} value={t.projectId} onClose={pa2.close} onPick={id => st.updateTask(t.id, { projectId: id })} />}
      {sa.isOpen && (
        <Popover anchor={sa.el} onClose={sa.close}>
          <MenuList width={280} onClose={sa.close} items={[{ label: 'Status' }, ...st.settings.taskStatuses.filter(s => s.name !== 'Archived' || t.status === 'Archived').map(s => ({
            t: s.name, sel: s.name === t.status, dot: toneDot(s.tone), sub: s.note, onClick: () => act.setStatus(t, s.name),
          })), { divider: true }, { note: 'Status is a label. Tick the task (or press Done) to finish it and record the time.' }]} />
        </Popover>
      )}
      {da.isOpen && <Popover anchor={da.el} onClose={da.close} placement="left"><DuePicker date={t.dueDate} time={t.dueTime} onDone={(d, tm) => { setDue(d, tm); da.close(); }} onClear={() => { setDue(null, null); da.close(); }} /></Popover>}
      {ra.isOpen && <RemindPicker anchor={ra.el} onClose={ra.close} t={t} value={t.remindAt} onPick={iso => st.updateTask(t.id, { remindAt: iso, remindedAt: null })} />}
      {estOpen && <EstimateDialog editing={!!t.firstStartedAt && !!t.estimateMin} initial={t.estimateMin ? totalEstimateMin(t) : null} dueAt={dueAt(t, st.settings)} avgOverrunMin={avgOverrunMin(st.tasks)} onClose={() => setEstOpen(false)}
        onSet={min => {
          if (min == null) { st.updateTask(t.id, { estimateMin: null, reEstimates: [] }); return; }
          if (t.firstStartedAt && t.estimateMin) { const diff = min - totalEstimateMin(t); if (diff) st.reEstimate(t.id, diff); }
          else st.updateTask(t.id, { estimateMin: min });
        }} />}
    </aside>
  );
}

/** Steps directly under the title, Microsoft To Do style: circle · text · ⋮, then "+ Add a step" / "+ Next step". */
function Steps({ t }: { t: Task }) {
  const st = useStore();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const save = (steps: Step[]) => st.updateTask(t.id, { steps });
  const add = () => { if (!text.trim()) return; save([...t.steps, { id: uid(), title: text.trim(), done: false }]); setText(''); };
  const promote = (s: Step) => {
    st.addTask({ title: s.title, projectId: t.projectId, myDayDate: t.myDayDate, dueDate: t.dueDate });
    save(t.steps.filter(x => x.id !== s.id));
  };
  return (
    <div className="steps">
      {t.steps.map(s => (
        <div key={s.id} className={cx('step-row', s.done && 'done')}>
          <button className={cx('check', s.done && 'on')} style={{ width: 32, height: 32 }} aria-label={s.done ? 'Mark step not done' : 'Mark step done'}
            onClick={() => save(t.steps.map(x => x.id === s.id ? { ...x, done: !x.done } : x))}>
            <Icon name={s.done ? 'checkCircle' : 'circle'} size={20} />
          </button>
          {editing === s.id
            ? <input className="inline-input t-bm grow" autoFocus defaultValue={s.title} aria-label="Step"
                onBlur={e => { const v = e.target.value.trim(); save(v ? t.steps.map(x => x.id === s.id ? { ...x, title: v } : x) : t.steps.filter(x => x.id !== s.id)); setEditing(null); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
            : <button className="t-bm grow step-text" onClick={() => setEditing(s.id)}>{s.title}</button>}
          <IBtn sm icon="moreV" label="Step options" className="step-more" onClick={e => setMenu({ id: s.id, el: e.currentTarget as HTMLElement })} />
        </div>
      ))}
      <div className="row gap-8 step-add">
        <Icon name="add" style={{ color: 'var(--primary)', width: 20 }} />
        <input className="inline-input t-bm" placeholder={t.steps.length ? 'Next step' : 'Add a step'} value={text} onChange={e => setText(e.target.value)} aria-label="Add a step"
          onKeyDown={e => { if (e.key === 'Enter') add(); }} onBlur={add} />
      </div>
      {menu && (() => { const s = t.steps.find(x => x.id === menu.id); if (!s) return null; return (
        <Popover anchor={menu.el} onClose={() => setMenu(null)} placement="below-end">
          <MenuList width={220} onClose={() => setMenu(null)} items={[
            { t: 'Rename', ic: 'edit', onClick: () => setEditing(s.id) },
            { t: s.done ? 'Mark not done' : 'Mark done', ic: 'checkCircleO', onClick: () => save(t.steps.map(x => x.id === s.id ? { ...x, done: !x.done } : x)) },
            { t: 'Make it a task', ic: 'add', onClick: () => promote(s) },
            { divider: true },
            { t: 'Delete step', ic: 'trash', danger: true, onClick: () => save(t.steps.filter(x => x.id !== s.id)) },
          ]} />
        </Popover>
      ); })()}
    </div>
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
