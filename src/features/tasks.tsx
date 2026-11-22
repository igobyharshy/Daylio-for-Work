import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import type { Project, Task, ID } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Field, IBtn, MenuList, Popover, Tag, cx, useAnchor, type MenuItemDef } from '../ui/kit';
import { DuePicker, EstimateDialog, DateTimePicker, remindOptions } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import {
  dueAt, dueLabel, elapsed, fmtClock, fmtMin, fmtMs, fmtTimer, isDone, isOverEstimate, isOverdue, outcome, relDay, remainingMs,
  startBy, todayISO, totalEstimateMin, cap, isoDate, atTime,
} from '../lib/time';
import { avgOverrunMin } from '../lib/select';
import { Ring } from '../ui/kit';

// ---------- small pieces ----------
export function ProjectLabel({ p, muted }: { p?: Project; muted?: boolean }) {
  if (!p) return null;
  return <span className={cx('m', muted && 'c-muted')}><span className="emoji" style={{ fontSize: 14 }}>{p.emoji}</span>{p.name}</span>;
}
export function Meta({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return <div className="meta">{items.map((c, i) => <span key={i} className="row gap-6">{i > 0 && <span className="sep">·</span>}{c}</span>)}</div>;
}

/** Outcome chips for finished tasks: "Took 2h 5m" · "+5m over" / "−2m under" · "55m early" */
export function OutcomeChips({ t }: { t: Task }) {
  const { settings } = useStore();
  const o = outcome(t, settings);
  return (
    <>
      <Tag>Took {fmtMs(o.tookMs)}</Tag>
      {o.diffMin != null && o.diffMin > 0 && <Tag kind="warn" icon="trendUp">+{fmtMin(o.diffMin)} over</Tag>}
      {o.diffMin != null && o.diffMin < 0 && <Tag kind="ok" icon="trendDown">{fmtMin(-o.diffMin)} under</Tag>}
      {o.diffMin === 0 && <Tag kind="ok" icon="check">On estimate</Tag>}
      {o.earlyMin != null && o.earlyMin >= 5 && <Tag kind="ok">{fmtMin(o.earlyMin)} early</Tag>}
      {o.lateMin != null && o.lateMin > 0 && <Tag kind="err">{fmtMin(o.lateMin)} late</Tag>}
    </>
  );
}

export function useTaskActions() {
  const st = useStore();
  const toast = useToast();
  const ui = useUI();
  const finish = (t: Task) => {
    const wasOver = isOverEstimate(t);
    const o = st.finishTask(t.id);
    if (!o || !st.settings.notif.finishToast) return;
    const parts = [`Done in ${fmtMs(o.tookMs)}`];
    if (o.diffMin != null && o.diffMin > 0) parts.push(`${fmtMin(o.diffMin)} over estimate`);
    else if (o.diffMin != null && o.diffMin < 0) parts.push(`${fmtMin(-o.diffMin)} under estimate`);
    if (o.earlyMin != null && o.earlyMin >= 5) parts.push(`${fmtMin(o.earlyMin)} early`);
    const over = (o.diffMin ?? 0) > 0 || (o.lateMin ?? 0) > 0;
    toast.show(parts.join(' · '), {
      icon: over ? 'warn' : 'checkCircle',
      action: over && !wasOver ? { label: 'What happened?', onClick: () => ui.newEntry({ taskIds: [t.id], source: (o.diffMin ?? 0) > 0 ? 'overEstimate' : 'late' }) }
        : over ? { label: 'What happened?', onClick: () => ui.newEntry({ taskIds: [t.id], source: 'overEstimate' }) }
        : { label: 'Undo', onClick: () => st.reopenTask(t.id) },
    });
  };
  const toggleDone = (t: Task) => { if (isDone(t)) st.reopenTask(t.id); else finish(t); };
  const toggleMyDay = (t: Task) => {
    const on = t.myDayDate && t.myDayDate >= todayISO();
    st.updateTask(t.id, { myDayDate: on ? null : todayISO() });
    toast.show(on ? 'Removed from My Day' : 'Added to My Day', { icon: 'sun', duration: 3000 });
  };
  return { finish, toggleDone, toggleMyDay, start: (t: Task) => st.startTask(t.id), pause: (t: Task) => st.pauseTask(t.id) };
}

// ---------- Task row (E01, E10, project page) ----------
export function TaskRow({ t, showProject = true, showSun = false, onDragStart, dragging }: {
  t: Task; showProject?: boolean; showSun?: boolean; onDragStart?: (e: React.DragEvent) => void; dragging?: boolean;
}) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const running = !!t.runStartedAt;
  const now = useNow(1000, running);
  const done = isDone(t);
  const amber = !done && isOverEstimate(t, now);
  const overdue = isOverdue(t, st.settings, now);
  const p = st.projectById(t.projectId);
  const sb = startBy(t, st.settings);
  const stepsDone = t.steps.filter(s => s.done).length;
  const inMyDay = !!t.myDayDate && t.myDayDate >= todayISO();
  const meta: ReactNode[] = [];
  if (amber) meta.push(<button className="m warn link" onClick={e => { e.stopPropagation(); ui.openWhatHappened(t.id); }} style={{ color: 'var(--warning)', fontWeight: 500 }}>What happened?</button>);
  if (!done && t.status === 'In progress' && !amber) meta.push(<span className="m primary">{running ? 'Running' : 'In progress'}</span>);
  if (showProject && p) meta.push(<ProjectLabel p={p} />);
  if (!showProject && showSun && inMyDay) meta.push(<span className="m primary"><Icon name="sunFill" />My Day</span>);
  if (t.steps.length) meta.push(<span className="m">{stepsDone} of {t.steps.length}</span>);
  if (!done && t.remindAt && !t.remindedAt) meta.push(<span className="m"><Icon name="bell" />{relDay(isoDate(new Date(t.remindAt))) === 'today' ? '' : cap(relDay(isoDate(new Date(t.remindAt)))) + ' '}{fmtClock(t.remindAt)}</span>);
  if (!done && t.dueDate) meta.push(<span className={cx('m', overdue && 'err')}>{overdue ? 'Overdue · ' + dueLabel(t)!.replace('Due ', '') : dueLabel(t)}</span>);
  if (!done && sb && !t.firstStartedAt && sb.getTime() > now && isoDate(sb) === todayISO()) meta.push(<span className="m">Start by {fmtClock(sb)}</span>);

  return (
    <div className={cx('task-row', done && 'done', amber && 'amber', ui.taskId === t.id && 'sel', dragging && 'dragging')}
      onClick={() => ui.openTask(t.id)} draggable={!!onDragStart} onDragStart={onDragStart} data-task={t.id}>
      <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} data-tip={done ? 'Mark not done' : 'Mark done'}
        onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
        <Icon name={done ? 'checkCircle' : 'circle'} />
      </button>
      <div className="text">
        <span className="title ellipsis">{t.title || 'Untitled task'}</span>
        {meta.length > 0 && <Meta>{meta}</Meta>}
      </div>
      <div className="trail" onClick={e => e.stopPropagation()}>
        {done ? <OutcomeChips t={t} /> : (
          <>
            {amber ? <Tag kind="warn" icon="hourglass">+{fmtTimer(-remainingMs(t, now)).replace('+', '')} over</Tag>
              : running ? <span className="t-ll c-primary tnum">{fmtTimer(remainingMs(t, now))} left</span>
              : t.estimateMin ? <Tag icon="hourglass">{fmtMin(totalEstimateMin(t))}</Tag> : null}
            {showSun && <IBtn icon={inMyDay ? 'sunFill' : 'sun'} label={inMyDay ? 'Remove from My Day' : 'Add to My Day'} className={inMyDay ? 'on-primary' : ''} onClick={() => act.toggleMyDay(t)} />}
            {running ? <IBtn icon="pause" kind="pc" label="Pause" onClick={() => act.pause(t)} /> : <IBtn icon="play" kind="pc" label={t.elapsedMs ? 'Resume' : 'Start timer'} onClick={() => act.start(t)} />}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Running card (E08 / E10) ----------
export function RunCard({ t, onPopOut }: { t: Task; onPopOut: () => void }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const running = !!t.runStartedAt;
  const now = useNow(1000, running);
  const rem = remainingMs(t, now);
  const amber = isOverEstimate(t, now);
  const total = totalEstimateMin(t) * 60000;
  const pct = total ? Math.min(100, (elapsed(t, now) / total) * 100) : 0;
  const p = st.projectById(t.projectId);
  const stepsDone = t.steps.filter(s => s.done).length;
  const meta: ReactNode[] = [];
  if (p) meta.push(<ProjectLabel p={p} />);
  if (t.steps.length) meta.push(<span className="m">{stepsDone} of {t.steps.length} steps</span>);
  if (t.dueDate) meta.push(<span className="m">{dueLabel(t)}</span>);
  const sbEnd = dueAt(t, st.settings);
  if (running && t.estimateMin && rem > 0) meta.push(<span className="m">done by {fmtClock(new Date(now + rem))}</span>);
  else if (!running && sbEnd) meta.push(<span className="m">Paused</span>);
  return (
    <div className={cx('run-card', amber && 'amber')}>
      <Ring pct={amber ? 100 : pct} size={64} stroke={6} color={amber ? 'var(--warning)' : 'var(--primary)'} track={amber ? '#f5c76b' : 'var(--surface-lowest)'}>
        <Icon name={amber ? 'warn' : 'hourglass'} style={{ color: amber ? 'var(--warning)' : 'var(--primary)' }} />
      </Ring>
      <button className="col grow" style={{ textAlign: 'left', gap: 4, minWidth: 0 }} onClick={() => ui.openTask(t.id)}>
        <span className="t-tl ellipsis">{t.title}</span>
        <Meta>{meta}</Meta>
      </button>
      <div className="timer">
        <span className="big">{t.estimateMin ? fmtTimer(rem) : fmtTimer(elapsed(t, now))}</span>
        <span className="t-bs">{!t.estimateMin ? 'elapsed · no estimate' : amber ? 'over estimate' : `left of ${fmtMin(totalEstimateMin(t))} estimate`}</span>
      </div>
      <div className="row gap-8">
        {amber && <Btn kind="warn-outlined" icon="edit" onClick={() => ui.openWhatHappened(t.id)}>What happened?</Btn>}
        <IBtn icon="pip" label="Pop out mini timer" onClick={onPopOut} />
        {running ? <IBtn icon="pause" label="Pause" onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" onClick={() => act.start(t)} />}
        <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
      </div>
    </div>
  );
}

export function NothingRunning() {
  return <div className="nothing-running"><Icon name="timer" style={{ color: 'var(--outline)' }} />Nothing running. Press <Icon name="play" size={20} /> on a task below.</div>;
}

// ---------- Project picker (E04 / E05 / F02) ----------
export function ProjectPicker({ value, onPick, onClose, anchor, allowCreate = true }: {
  value: ID | null; onPick: (id: ID) => void; onClose: () => void; anchor: HTMLElement | null; allowCreate?: boolean;
}) {
  const st = useStore();
  const [q, setQ] = useState('');
  const list = st.projects
    .filter(p => p.status !== 'Archived' || p.id === value)
    .filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.isInbox) - Number(a.isInbox) || a.sort - b.sort);
  const exact = st.projects.some(p => p.name.toLowerCase() === q.trim().toLowerCase());
  const items: MenuItemDef[] = list.map(p => ({ t: p.name, emoji: p.emoji, sel: p.id === value, sub: p.isInbox ? 'Default project' : undefined, onClick: () => onPick(p.id) }));
  if (allowCreate && q.trim() && !exact) items.push({ divider: true }, { t: `Create project “${q.trim()}”`, ic: 'add', onClick: () => { const p = st.addProject({ name: q.trim() }); onPick(p.id); } });
  if (!items.length) items.push({ note: 'No projects match.' });
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <MenuList width={300} onClose={onClose} items={items}
        header={<div style={{ padding: '4px 12px 8px' }}><Field sm lead="search" value={q} onChange={setQ} placeholder="Find or create a project" autoFocus bg="var(--surface-container)"
          onKeyDown={e => { if (e.key === 'Enter') { if (list[0]) { onPick(list[0].id); onClose(); } else if (allowCreate && q.trim()) { const p = st.addProject({ name: q.trim() }); onPick(p.id); onClose(); } } }} /></div>} />
    </Popover>
  );
}

// ---------- Remind me (G13 / E20) ----------
export function RemindPicker({ t, anchor, onClose, onPick, value }: { t?: Partial<Task>; anchor: HTMLElement | null; onClose: () => void; onPick: (iso: string | null) => void; value?: string | null }) {
  const st = useStore();
  const [custom, setCustom] = useState(false);
  const opts = remindOptions(t ? dueAt({ dueDate: t.dueDate ?? null, dueTime: t.dueTime ?? null }, st.settings) : null, st.settings.workStart, st.settings.workEnd);
  if (custom) return <Popover anchor={anchor} onClose={onClose}><DateTimeFuture value={value} onDone={iso => { onPick(iso); onClose(); }} onCancel={onClose} /></Popover>;
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <MenuList width={280} onClose={onClose} items={[
        { label: 'Remind me' },
        ...opts.map(o => ({ t: o.t, ic: o.ic, sup: o.sup, onClick: () => onPick(o.at.toISOString()) })),
        { t: 'Pick date & time…', ic: 'event', keepOpen: true, onClick: () => setCustom(true) },
        ...(value ? [{ divider: true }, { t: 'Remove reminder', ic: 'bellOff' as const, onClick: () => onPick(null) }] : []),
      ]} />
    </Popover>
  );
}
/** date+time picker allowing future dates (for reminders) */
function DateTimeFuture({ value, onDone, onCancel }: { value?: string | null; onDone: (iso: string) => void; onCancel: () => void }) {
  const init = value ? new Date(value) : new Date(Date.now() + 3600000);
  return (
    <DuePicker title="Remind me at" requireTime date={isoDate(init)} time={`${String(init.getHours()).padStart(2, '0')}:${String(init.getMinutes()).padStart(2, '0')}`}
      onDone={(date, time) => onDone(atTime(date, time ?? '09:00').toISOString())} onClear={onCancel} clearLabel="Cancel" />
  );
}

// ---------- Add a task bar (E03–E07, G08, G13) ----------
export function AddTaskBar({ projectId, label = 'Add a task', inMyDay = true }: { projectId?: ID; label?: string; inMyDay?: boolean }) {
  const st = useStore();
  const toast = useToast();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [proj, setProj] = useState<ID | null>(projectId ?? null);
  const [due, setDue] = useState<{ date: string | null; time: string | null }>({ date: todayISO(), time: null });
  const [est, setEst] = useState<number | null>(null);
  const [remind, setRemind] = useState<string | null>(null);
  const pa = useAnchor(), da = useAnchor(), ra = useAnchor();
  const [estOpen, setEstOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const project = st.projectById(proj ?? st.inbox?.id);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) || t.closest('.popover') || t.closest('.scrim')) return;
      if (!title.trim()) setOpen(false);
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open, title]);
  const reset = () => { setTitle(''); setEst(null); setRemind(null); setDue({ date: todayISO(), time: null }); if (!projectId) setProj(null); };
  const submit = () => {
    if (!title.trim()) return;
    const addToMyDay = inMyDay && (!due.date || due.date <= todayISO());
    const t = st.addTask({ title: title.trim(), projectId: proj ?? st.inbox?.id ?? null, dueDate: due.date, dueTime: due.time, estimateMin: est, remindAt: remind, myDayDate: addToMyDay ? todayISO() : null });
    const where = addToMyDay ? (inMyDay && !projectId ? 'Up next' : 'My Day') : project?.name ?? 'Inbox';
    toast.show(`Added to ${where}`, { icon: 'checkCircle', action: { label: 'Open', onClick: () => ui.openTask(t.id) }, duration: 4000 });
    reset();
    inputRef.current?.focus();
  };
  if (!open) {
    return (
      <button className="add-bar state" onClick={() => setOpen(true)}>
        <Icon name="add" />{label}
      </button>
    );
  }
  const dueText = due.date ? cap(dueLabel({ dueDate: due.date, dueTime: due.time })!) : 'No due date';
  return (
    <div className="add-panel" ref={wrapRef}>
      <div className="line">
        <Icon name="add" style={{ color: 'var(--primary)' }} />
        <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you need to do?" aria-label="Task title"
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { reset(); setOpen(false); } }} />
        <span className="t-bs c-muted row gap-6" style={{ whiteSpace: 'nowrap' }}><span className="keycap">↵</span>{inMyDay && (!due.date || due.date <= todayISO()) ? 'Add to My Day' : 'Add task'}</span>
      </div>
      <div className="chips">
        {!projectId && <Chip emoji={proj ? project?.emoji : undefined} icon={proj ? undefined : 'add'} sel={!!proj} onClick={e => pa.open(e)}>{proj ? project?.name : 'Add project'}</Chip>}
        <Chip icon="event" sel={!!due.date} onClick={e => da.open(e)}>{dueText}</Chip>
        <Chip icon="hourglass" sel={!!est} onClick={() => setEstOpen(true)}>{est ? fmtMin(est) : 'Estimate'}</Chip>
        <Chip icon="bell" sel={!!remind} onClick={e => ra.open(e)}>{remind ? `${cap(relDay(isoDate(new Date(remind))))} ${fmtClock(remind)}` : 'Remind me'}</Chip>
        <span className="grow" />
        <Btn kind="text" onClick={() => { reset(); setOpen(false); }}>Cancel</Btn>
        <Btn disabled={!title.trim()} onClick={submit}>Add</Btn>
      </div>
      {pa.isOpen && <ProjectPicker anchor={pa.el} value={proj} onPick={setProj} onClose={pa.close} />}
      {da.isOpen && <Popover anchor={da.el} onClose={da.close}><DuePicker date={due.date} time={due.time} onDone={(date, time) => { setDue({ date, time }); da.close(); }} onClear={() => { setDue({ date: null, time: null }); da.close(); }} /></Popover>}
      {ra.isOpen && <RemindPicker anchor={ra.el} onClose={ra.close} t={{ dueDate: due.date, dueTime: due.time }} value={remind} onPick={setRemind} />}
      {estOpen && <EstimateDialog initial={est} onSet={setEst} onClose={() => setEstOpen(false)} dueAt={dueAt({ dueDate: due.date, dueTime: due.time }, st.settings)} avgOverrunMin={avgOverrunMin(st.tasks)} />}
    </div>
  );
}

// ---------- Board (G01 / G04 / G02 / G05) ----------
export function TaskBoard({ tasks, showProject = true, columns }: { tasks: Task[]; showProject?: boolean; columns: string[] }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const [drag, setDrag] = useState<ID | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const now = useNow(5000);
  const byCol = useMemo(() => {
    const m = new Map<string, Task[]>(columns.map(c => [c, []]));
    tasks.forEach(t => { const k = columns.includes(t.status) ? t.status : columns[0]; m.get(k)!.push(t); });
    return m;
  }, [tasks, columns]);
  const tone = (name: string) => st.settings.taskStatuses.find(s => s.name === name)?.tone ?? 'neutral';
  return (
    <div className="board">
      {columns.map(c => (
        <div key={c} className={cx('board-col', over === c && 'over')}
          onDragOver={e => { e.preventDefault(); setOver(c); }} onDragLeave={() => setOver(null)}
          onDrop={() => {
            setOver(null);
            const t = st.taskById(drag); setDrag(null);
            if (!t || t.status === c) return;
            if (c === 'Done') act.finish(t);
            else if (isDone(t)) { st.reopenTask(t.id); st.updateTask(t.id, { status: c }); }
            else st.updateTask(t.id, { status: c });
          }}>
          <div className="board-col-head">
            <span className="dot" style={{ background: `var(--${({ blue: 'primary', green: 'success', purple: 'tertiary', amber: 'warning', red: 'error', secondary: 'secondary' } as any)[tone(c)] ?? 'outline'})` }} />
            <span className="t-ts">{c}</span><span className="count">{byCol.get(c)!.length}</span>
          </div>
          {byCol.get(c)!.map(t => {
            const p = st.projectById(t.projectId);
            const amber = isOverEstimate(t, now);
            return (
              <div key={t.id} className={cx('kcard', amber && 'amber')} draggable onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)}
                style={{ opacity: drag === t.id ? 0.4 : 1 }} onClick={() => ui.openTask(t.id)}>
                <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
                  <span className={cx('t-bl grow', isDone(t) && 'c-muted')} style={{ textDecoration: isDone(t) ? 'line-through' : undefined }}>{t.title}</span>
                  {!isDone(t) && <IBtn sm icon={t.runStartedAt ? 'pause' : 'play'} kind="pc" label={t.runStartedAt ? 'Pause' : 'Start timer'} onClick={e => { e.stopPropagation(); t.runStartedAt ? act.pause(t) : act.start(t); }} />}
                </div>
                <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                  {showProject && p && <span className="t-bs c-muted row gap-4"><span className="emoji">{p.emoji}</span>{p.name}</span>}
                  {isDone(t) ? <OutcomeChips t={t} /> : (
                    <>
                      {t.estimateMin ? <Tag icon="hourglass">{fmtMin(totalEstimateMin(t))}</Tag> : null}
                      {t.dueDate && <Tag kind={isOverdue(t, st.settings) ? 'err' : undefined}>{dueLabel(t)}</Tag>}
                      {amber && <Tag kind="warn">Over estimate</Tag>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {!byCol.get(c)!.length && <div className="t-bs c-faint" style={{ padding: '8px 12px 12px' }}>Drop tasks here</div>}
        </div>
      ))}
    </div>
  );
}

export { DateTimePicker };
