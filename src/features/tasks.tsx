import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import type { Project, Task, ID, Settings } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Field, IBtn, MenuList, Popover, Switch, Tag, cx, useAnchor, type MenuItemDef, TONES, PopOutBtn } from '../ui/kit';
import { DuePicker, EstimateDialog, DateTimePicker, remindOptions } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import {
  addDays, dueAt, dueLabel, elapsed, fmtClock, fmtMin, fmtMs, fmtTimer, isDone, isOverEstimate, isOverdue, outcome, relDay, remainingMs, timerView,
  todayISO, totalEstimateMin, cap, isoDate, atTime, parseQuickAdd,
} from '../lib/time';
import { avgOverrunMin, sortBetween, statusGroups } from '../lib/select';
import { Ring } from '../ui/kit';
import { useDragSort } from './dnd';
import { useIsMobile } from '../lib/native';

// ---------- small pieces ----------
export function ProjectLabel({ p, muted }: { p?: Project; muted?: boolean }) {
  if (!p) return null;
  return <span className={cx('m', muted && 'c-muted')}><span className="emoji" style={{ fontSize: 14 }}>{p.emoji}</span>{p.name}</span>;
}
export function Meta({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return <div className="meta">{items.map((c, i) => <span key={i} className="row gap-6">{i > 0 && <span className="sep">·</span>}{c}</span>)}</div>;
}
export const toneDot = (tone: string) => (TONES as Record<string, [string, string, string]>)[tone]?.[2] ?? 'var(--outline)';

/** Outcome chips for finished tasks: "Took 2h 5m" · "+5m over" / "2m under" · "14h late" (no "early": it was noise) */
export function OutcomeChips({ t }: { t: Task }) {
  const { settings } = useStore();
  const o = outcome(t, settings);
  return (
    <>
      <Tag>Took {fmtMs(o.tookMs)}</Tag>
      {o.diffMin != null && o.diffMin > 0 && <Tag kind="warn" icon="trendUp">+{fmtMin(o.diffMin)} over</Tag>}
      {o.diffMin != null && o.diffMin < 0 && <Tag kind="ok" icon="trendDown">{fmtMin(-o.diffMin)} under</Tag>}
      {o.diffMin === 0 && <Tag kind="ok" icon="check">On estimate</Tag>}
      {o.lateMin != null && o.lateMin > 0 && <Tag kind="err">{fmtMin(o.lateMin)} late</Tag>}
    </>
  );
}

/** "Overdue" tag + when it was due */
export function DueText({ t, settings, now }: { t: Task; settings: Settings; now?: number }) {
  if (!t.dueDate) return null;
  if (!isDone(t) && isOverdue(t, settings, now)) {
    const label = t.dueDate === todayISO() && t.dueTime ? `was due ${fmtClock(atTime(t.dueDate, t.dueTime))}` : `was due ${relDay(t.dueDate)}`;
    return <span className="m err"><Tag kind="err">Overdue</Tag>{label}</span>;
  }
  return <span className="m">{dueLabel(t)}</span>;
}

// rows briefly highlight after they're added
let flash: { id: string; at: number } | null = null;
export const flashTask = (id: string) => { flash = { id, at: Date.now() }; };

export function useTaskActions() {
  const st = useStore();
  const toast = useToast();
  const ui = useUI();
  const finish = (t: Task) => {
    const wasRunning = !!t.runStartedAt;
    const wasOver = isOverEstimate(t);
    const o = st.finishTask(t.id);
    if (!o || !st.settings.notif.finishToast) return;
    const parts = [`Done in ${fmtMs(o.tookMs)}`];
    if (o.diffMin != null && o.diffMin > 0) parts.push(`${fmtMin(o.diffMin)} over estimate`);
    else if (o.diffMin != null && o.diffMin < 0) parts.push(`${fmtMin(-o.diffMin)} under estimate`);
    if (o.lateMin != null && o.lateMin > 0) parts.push(`${fmtMin(o.lateMin)} late`);
    const over = (o.diffMin ?? 0) > 0 || (o.lateMin ?? 0) > 0;
    toast.show(parts.join(' · '), {
      icon: over ? 'warn' : 'checkCircle',
      action: { label: 'Undo', onClick: () => { st.reopenTask(t.id); if (wasRunning) st.startTask(t.id); } },
      action2: over ? { label: 'What happened?', onClick: () => ui.newEntry({ taskIds: [t.id], source: wasOver || (o.diffMin ?? 0) > 0 ? 'overEstimate' : 'late' }) } : undefined,
    });
  };
  const start = (t: Task) => {
    // no estimate yet: ask for one first (with "Start without estimate")
    if (!t.estimateMin && !t.firstStartedAt) ui.askEstimate(t.id);
    else st.startTask(t.id);
  };
  const toggleDone = (t: Task) => { if (isDone(t)) st.reopenTask(t.id); else finish(t); };
  const inMyDay = (t: Task) => !!t.myDayDate && t.myDayDate <= todayISO();
  const toggleMyDay = (t: Task) => {
    const on = inMyDay(t);
    if (on && t.runStartedAt) { toast.show('This timer is running. Pause it first to take the task off My Day.', { icon: 'info' }); return; }
    const prev = t.myDayDate;
    st.updateTask(t.id, { myDayDate: on ? null : todayISO() });
    toast.show(on ? 'Removed from My Day' : 'Added to My Day', { icon: 'sun', action: { label: 'Undo', onClick: () => st.updateTask(t.id, { myDayDate: prev }) } });
  };
  const tomorrow = (t: Task) => {
    const prev = { dueDate: t.dueDate, myDayDate: t.myDayDate };
    if (t.runStartedAt) st.pauseTask(t.id);
    st.updateTask(t.id, { dueDate: isoDate(addDays(new Date(), 1)), myDayDate: null });
    toast.show('Moved to tomorrow', { icon: 'event', action: { label: 'Undo', onClick: () => st.updateTask(t.id, prev) } });
  };
  const remove = (t: Task) => {
    if (t.runStartedAt) st.pauseTask(t.id);
    if (ui.taskId === t.id) ui.openTask(null);
    const undo = st.removeTask(t.id);
    toast.show(`Deleted “${t.title}”`, { icon: 'trash', action: { label: 'Undo', onClick: undo }, duration: 6000 });
  };
  const setStatus = (t: Task, s: string) => st.setStatus(t.id, s);
  return { finish, start, toggleDone, toggleMyDay, tomorrow, remove, setStatus, inMyDay, pause: (t: Task) => st.pauseTask(t.id) };
}

// ---------- Row ⋮ menu ----------
export function TaskMenu({ t, anchor, onClose }: { t: Task; anchor: HTMLElement | null; onClose: () => void }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const [moving, setMoving] = useState(false);
  if (moving) return <ProjectPicker anchor={anchor} value={t.projectId} onClose={onClose} onPick={id => { st.updateTask(t.id, { projectId: id }); onClose(); }} />;
  const done = isDone(t);
  const items: MenuItemDef[] = [
    { t: 'Open', ic: 'open', onClick: () => ui.openTask(t.id) },
    ...(!done ? [t.runStartedAt ? { t: 'Pause timer', ic: 'pause' as const, onClick: () => act.pause(t) } : { t: 'Start timer', ic: 'play' as const, onClick: () => act.start(t) }] : []),
    { label: 'Status' },
    ...st.settings.taskStatuses.filter(s => s.name !== 'Archived').map(s => ({ t: s.name, dot: toneDot(s.tone), sel: t.status === s.name, onClick: () => act.setStatus(t, s.name) })),
    { divider: true },
    ...(!done ? [{ t: act.inMyDay(t) ? 'Remove from My Day' : 'Add to My Day', ic: act.inMyDay(t) ? 'sun' as const : 'sunFill' as const, disabled: act.inMyDay(t) && !!t.runStartedAt, sub: act.inMyDay(t) && t.runStartedAt ? 'Pause the timer first' : undefined, onClick: () => act.toggleMyDay(t) },
      { t: 'Move to tomorrow', ic: 'event' as const, onClick: () => act.tomorrow(t) }] : []),
    { t: 'Move to project…', ic: 'folder', keepOpen: true, onClick: () => setMoving(true) },
    { divider: true },
    { t: 'Delete', ic: 'trash', danger: true, onClick: () => act.remove(t) },
  ];
  return <Popover anchor={anchor} onClose={onClose} placement="below-end"><MenuList width={260} onClose={onClose} items={items} /></Popover>;
}

/** time / state chip at the end of a row or card */
function TimeChip({ t, now }: { t: Task; now: number }) {
  const { settings } = useStore();
  const up = settings.timerDirection === 'up';
  const running = !!t.runStartedAt;
  const over = isOverEstimate(t, now);
  if (!t.estimateMin) {
    if (running || t.elapsedMs > 0) return <span className={cx('t-ll tnum', running ? 'c-primary' : 'c-muted')}>{running ? '' : 'Paused · '}{fmtTimer(elapsed(t, now))} elapsed</span>;
    return <span className="t-bs c-faint">No estimate</span>;
  }
  if (over) return <Tag kind="warn" icon="hourglass">{!running ? 'Paused · ' : ''}+{fmtTimer(-remainingMs(t, now)).replace('+', '')} over</Tag>;
  if (running) return <span className="t-ll c-primary tnum">{up ? timerView(t, now, 'up').line : `${fmtTimer(remainingMs(t, now))} left`}</span>;
  if (t.elapsedMs > 0) return <Tag icon="pause">{up ? timerView(t, now, 'up').line : `${fmtTimer(remainingMs(t, now))} left`}</Tag>;
  return <Tag icon="hourglass">{fmtMin(totalEstimateMin(t))}</Tag>;
}

/** Phone rows: at most one short line — the timer while it runs, else overdue, else a due time. */
function PhoneLine({ t, now, overdue }: { t: Task; now: number; overdue: boolean }) {
  const { settings } = useStore();
  if (isDone(t)) return null;
  const running = !!t.runStartedAt;
  const up = settings.timerDirection === 'up';
  if (running || t.elapsedMs > 0) {
    const paused = running ? '' : 'Paused · ';
    if (!t.estimateMin) return <span className={cx('line tnum', running && 'primary')}>{paused}{fmtTimer(elapsed(t, now))} elapsed</span>;
    if (isOverEstimate(t, now)) return <span className="line warn tnum">{paused}{fmtTimer(-remainingMs(t, now)).replace('+', '')} over estimate</span>;
    return <span className={cx('line tnum', running && 'primary')}>{paused}{up ? timerView(t, now, 'up').line : `${fmtTimer(remainingMs(t, now))} left`}</span>;
  }
  if (overdue && t.dueDate) return <span className="line err">Overdue · {t.dueDate === todayISO() && t.dueTime ? `was due ${fmtClock(atTime(t.dueDate, t.dueTime))}` : `was due ${relDay(t.dueDate)}`}</span>;
  if (t.dueDate && (t.dueTime || t.dueDate !== todayISO())) return <span className="line">{dueLabel(t)}</span>;
  return null;
}

// ---------- Task row ----------
export function TaskRow({ t, showProject = true, showSun = false, carry = false, drag }: {
  t: Task; showProject?: boolean; showSun?: boolean; carry?: boolean; drag?: Record<string, unknown>;
}) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const running = !!t.runStartedAt;
  const now = useNow(1000, running);
  const done = isDone(t);
  const amber = !done && isOverEstimate(t, now);
  const p = st.projectById(t.projectId);
  const stepsDone = t.steps.filter(s => s.done).length;
  const inMyDay = act.inMyDay(t);
  const ma = useAnchor();
  const isFlash = flash?.id === t.id && Date.now() - flash.at < 1500;
  // calm rows: just the title; details fade in on hover. A live or paused timer stays visible.
  const calm = (st.settings.rowDetails ?? 'hover') === 'hover';
  // phones: no hover, so calm rows show one quiet line with the single thing that matters right now
  const phone = useIsMobile() && calm;
  // touch: a long press that doesn't turn into a drag opens the task menu
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowRef.current; if (!el) return;
    const h = () => ma.open(el);
    el.addEventListener('ot-longpress', h);
    return () => el.removeEventListener('ot-longpress', h);
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepChip = running || (!done && t.elapsedMs > 0);
  const overdue = !done && !!t.dueDate && isOverdue(t, st.settings, now);
  const meta: ReactNode[] = [];
  if (showProject && p) meta.push(<ProjectLabel p={p} />);
  if (!showProject && showSun && inMyDay && !done) meta.push(<span className="m primary"><Icon name="sunFill" />My Day</span>);
  if (carry && !done && t.myDayDate && t.myDayDate < todayISO()) meta.push(<span className="m">From {relDay(t.myDayDate)}</span>);
  if (!done && t.dueDate) meta.push(<DueText t={t} settings={st.settings} now={now} />);
  if (!done && t.plannedStart) meta.push(<span className="m" data-tip="Planned on the Timeline"><Icon name="schedule" />{relDay(isoDate(new Date(t.plannedStart))) === 'today' ? '' : cap(relDay(isoDate(new Date(t.plannedStart)))) + ' '}{fmtClock(t.plannedStart)}</span>);
  if (t.steps.length) meta.push(<span className="m"><Icon name="checklist" />{stepsDone}/{t.steps.length}</span>);
  if (!done && t.remindAt && !t.remindedAt) meta.push(<span className="m" data-tip={`Reminder ${relDay(isoDate(new Date(t.remindAt)))} ${fmtClock(t.remindAt)}`}><Icon name="bell" /></span>);

  if (phone) return (
    <div ref={rowRef} className={cx('task-row phone', done && 'done', amber && 'amber', running && 'live', ui.taskId === t.id && 'sel', isFlash && 'flash')} {...drag}
      onClick={() => ui.openTask(t.id)} data-task={t.id}
      onContextMenu={e => { e.preventDefault(); if (!drag || (e.nativeEvent as PointerEvent).pointerType === 'mouse') ma.open(e.currentTarget as HTMLElement); }}>
      <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'}
        onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
        <Icon name={done ? 'checkCircle' : 'circle'} />
      </button>
      <div className="text">
        <span className="title clamp2">{t.title || 'Untitled task'}</span>
        <PhoneLine t={t} now={now} overdue={overdue} />
      </div>
      {!done && (
        <div className="trail" onClick={e => e.stopPropagation()}>
          {!running && !t.elapsedMs && !!t.estimateMin && <span className="est">{fmtMin(totalEstimateMin(t))}</span>}
          {showSun && <IBtn icon={inMyDay ? 'sunFill' : 'sun'} label={inMyDay ? 'Remove from My Day' : 'Add to My Day'} tip={false} className={cx(inMyDay && 'on-primary')} onClick={() => act.toggleMyDay(t)} />}
          {running ? <IBtn icon="pause" kind="pc" label="Pause" tip={false} onClick={() => act.pause(t)} />
            : <IBtn icon="play" kind={t.elapsedMs ? 'pc' : 'standard'} className="play" label={t.elapsedMs ? 'Resume' : 'Start timer'} tip={false} onClick={() => act.start(t)} />}
        </div>
      )}
      {ma.isOpen && <TaskMenu t={t} anchor={ma.el} onClose={ma.close} />}
    </div>
  );

  return (
    <div className={cx('task-row', calm && 'calm', done && 'done', amber && 'amber', ui.taskId === t.id && 'sel', isFlash && 'flash')} {...drag}
      onClick={() => ui.openTask(t.id)} data-task={t.id}>
      {drag && <span className="grip" data-drag-handle aria-hidden><Icon name="drag" /></span>}
      <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} data-tip={done ? 'Mark not done' : 'Mark done'}
        onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
        <Icon name={done ? 'checkCircle' : 'circle'} />
      </button>
      <div className="text">
        <span className="row gap-6" style={{ minWidth: 0 }}>
          <span className="title ellipsis">{t.title || 'Untitled task'}</span>
          {calm && overdue && <span className="overdue-dot" data-tip="Overdue" aria-label="Overdue" />}
        </span>
        {meta.length > 0 && <Meta>{meta}</Meta>}
      </div>
      <div className="trail" onClick={e => e.stopPropagation()}>
        <span className={cx('row gap-6', calm && !keepChip && 'quiet')}>{done ? <OutcomeChips t={t} /> : <TimeChip t={t} now={now} />}</span>
        {showSun && !done && <IBtn icon={inMyDay ? 'sunFill' : 'sun'} label={inMyDay ? (running ? 'Running tasks stay in My Day' : 'Remove from My Day') : 'Add to My Day'} className={cx(inMyDay ? 'on-primary' : '', calm && 'quiet')} onClick={() => act.toggleMyDay(t)} />}
        {!done && (running ? <IBtn icon="pause" kind="pc" label="Pause" onClick={() => act.pause(t)} /> : <IBtn icon="play" kind="pc" className={cx(calm && 'quiet')} label={t.elapsedMs ? 'Resume' : 'Start timer'} onClick={() => act.start(t)} />)}
        <IBtn icon="moreV" label="More" className="row-more" kind={ma.isOpen ? 'selected' : 'standard'} onClick={e => ma.open(e)} />
      </div>
      {ma.isOpen && <TaskMenu t={t} anchor={ma.el} onClose={ma.close} />}
    </div>
  );
}

// ---------- The "Now" timer card ----------
export function RunCard({ t, onPopOut }: { t: Task; onPopOut: () => void }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const running = !!t.runStartedAt;
  const now = useNow(1000, running);
  const rem = remainingMs(t, now);
  const amber = isOverEstimate(t, now);
  const dir = st.settings.timerDirection ?? 'down';
  const v = timerView(t, now, dir);
  const p = st.projectById(t.projectId);
  const phone = useIsMobile();
  const stepsDone = t.steps.filter(s => s.done).length;
  const meta: ReactNode[] = [];
  if (p) meta.push(<ProjectLabel p={p} />);
  if (t.steps.length) meta.push(<span className="m">{stepsDone} of {t.steps.length} steps</span>);
  if (t.dueDate) meta.push(<DueText t={t} settings={st.settings} now={now} />);
  if (running && t.estimateMin && rem > 0) meta.push(<span className="m">done by {fmtClock(new Date(now + rem))}</span>);
  if (!running) meta.push(<span className="m"><Icon name="pause" />Paused</span>);
  // phones: just the task, its time and three buttons; the rest lives in the task and the focus timer
  if (phone) return (
    <div className={cx('run-card phone', amber && 'amber')}>
      <button className="rc-top" onClick={() => ui.openTask(t.id)} aria-label={`Open ${t.title}`}>
        <span className="col grow" style={{ minWidth: 0, gap: 2, textAlign: 'left' }}>
          <span className="t-tl clamp2">{t.title}</span>
          <span className="t-bs rc-sub">{!running ? 'Paused' : t.estimateMin && rem > 0 ? `done by ${fmtClock(new Date(now + rem))}` : amber ? 'over the estimate' : 'no estimate'}</span>
        </span>
        <span className="rc-time tnum">{v.main}</span>
      </button>
      <div className="rc-acts">
        <Btn kind="text" icon="fullscreen" onClick={onPopOut}>Focus</Btn>
        <span className="grow" />
        {running ? <IBtn icon="pause" kind="pc" label="Pause" tip={false} onClick={() => act.pause(t)} /> : <IBtn icon="play" kind="pc" label="Resume" tip={false} onClick={() => act.start(t)} />}
        <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
      </div>
    </div>
  );
  return (
    <div className={cx('run-card', amber && 'amber')}>
      <Ring pct={v.pct} size={44} stroke={4} color={amber ? 'var(--warning)' : 'var(--primary)'} track={amber ? 'color-mix(in srgb, var(--warning) 35%, var(--warning-container))' : 'var(--surface-lowest)'}>
        <Icon name={amber ? 'warn' : running ? 'hourglass' : 'pause'} style={{ color: amber ? 'var(--warning)' : 'var(--primary)' }} />
      </Ring>
      <button className="col grow" style={{ textAlign: 'left', gap: 4, minWidth: 0 }} onClick={() => ui.openTask(t.id)}>
        <span className="t-tl ellipsis">{t.title}</span>
        <Meta>{meta}</Meta>
      </button>
      <div className="timer">
        <span className="big">{v.main}</span>
        <span className="t-bs">{!t.estimateMin ? 'elapsed · no estimate' : v.sub}</span>
      </div>
      <div className="row gap-8">
        {!!t.estimateMin && <IBtn icon="swap" label={dir === 'up' ? 'Count down from the estimate' : 'Count up to the estimate'} onClick={() => st.updateSettings({ timerDirection: dir === 'up' ? 'down' : 'up' })} />}
        {amber && running && <Btn kind="warn-outlined" icon="edit" onClick={() => ui.openWhatHappened(t.id)}>What happened?</Btn>}
        <PopOutBtn onClick={onPopOut} />
        {running ? <IBtn icon="pause" label="Pause" onClick={() => act.pause(t)} /> : <IBtn icon="play" label="Resume" onClick={() => act.start(t)} />}
        <Btn kind={amber ? 'warn' : 'filled'} icon="check" onClick={() => act.finish(t)}>Done</Btn>
      </div>
    </div>
  );
}

export function NothingRunning() {
  return <div className="nothing-running"><Icon name="timer" style={{ color: 'var(--outline)' }} />Nothing running. Press <Icon name="play" size={20} /> on a task to start its timer.</div>;
}

// ---------- moving tasks between groups / positions ----------
export function useMoveTask(tasks: Task[], myDay = false) {
  const st = useStore();
  return (id: string, group: string, before: string | null) => {
    const t = st.taskById(id); if (!t) return;
    const groups = statusGroups(st.settings.taskStatuses, tasks, myDay);
    const g = groups.find(x => x.def.name === group); if (!g) return;
    const list = g.tasks.filter(x => x.id !== id);
    const idx = before ? Math.max(0, list.findIndex(x => x.id === before)) : list.length;
    const sort = sortBetween(list[idx - 1], list[idx]);
    st.updateTask(id, { sort });
    const home = groups.find(x => x.tasks.some(y => y.id === id))?.def.name;
    if (home !== group) st.setStatus(id, group);
  };
}

const collapsedKey = (k: string) => `ot-collapsed-${k}`;
function useCollapsed(key: string, initial = false) {
  const [v, setV] = useState(() => { try { const x = localStorage.getItem(collapsedKey(key)); return x == null ? initial : x === '1'; } catch { return initial; } });
  return [v, (x: boolean) => { setV(x); try { localStorage.setItem(collapsedKey(key), x ? '1' : '0'); } catch { /* ignore */ } }] as const;
}

/** Status-grouped list (My Day and project pages): same groups as the board. */
export function TaskGroups({ tasks, showProject = true, showSun = false, carry = false, scope, myDay = false }: { tasks: Task[]; showProject?: boolean; showSun?: boolean; carry?: boolean; scope: string; myDay?: boolean }) {
  const st = useStore();
  const move = useMoveTask(tasks, myDay);
  const drag = useDragSort(move);
  const groups = statusGroups(st.settings.taskStatuses, tasks, myDay);
  return (
    <div className="col gap-24">
      {groups.map(g => <Group key={g.def.name} name={g.def.name} tone={g.def.tone} tasks={g.tasks} scope={scope} drag={drag} showProject={showProject} showSun={showSun} carry={carry} />)}
    </div>
  );
}
function Group({ name, tone, tasks, scope, drag, showProject, showSun, carry }: { name: string; tone: string; tasks: Task[]; scope: string; drag: (id: string) => Record<string, unknown>; showProject: boolean; showSun: boolean; carry: boolean }) {
  const phone = useIsMobile();
  // phones start with Done folded away; the choice is remembered per device
  const [collapsed, setCollapsed] = useCollapsed(`${scope}-${name}${phone ? '-phone' : ''}`, phone && name === 'Done');
  if (phone && !tasks.length) return null;
  return (
    <div className="col gap-8">
      <button className="group-head state" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
        <Icon name={collapsed ? 'chevRight' : 'chevDown'} size={20} />
        <span className="dot" style={{ background: toneDot(tone) }} />
        <span className="t-ts">{name}</span><span className="t-ts c-faint">{tasks.length}</span>
      </button>
      {!collapsed && (
        <div className="list drop-zone" data-drop-group={name}>
          {tasks.map(t => <TaskRow key={t.id} t={t} showProject={showProject} showSun={showSun} carry={carry} drag={drag(t.id)} />)}
          {!tasks.length && <div className="drop-hint">Drag tasks here</div>}
        </div>
      )}
    </div>
  );
}
// ---------- Project picker (E04 / E05 / F02) ----------
export function ProjectPicker({ value, onPick, onClose, anchor, allowCreate = true }: {
  value: ID | null; onPick: (id: ID) => void; onClose: () => void; anchor: HTMLElement | null; allowCreate?: boolean;
}) {
  const st = useStore();
  const [q, setQ] = useState('');
  const list = st.projects
    .filter(p => !p.archived || p.id === value)
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
  const [myDay, setMyDay] = useState(inMyDay);
  const pa = useAnchor(), da = useAnchor(), ra = useAnchor();
  const [estOpen, setEstOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const phone = useIsMobile();
  const project = st.projectById(proj ?? st.inbox?.id);
  const parsed = useMemo(() => parseQuickAdd(title), [title]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open || phone) return; // phones: the composer's scrim handles outside taps (no tap-through)
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) || t.closest('.popover') || t.closest('.scrim')) return;
      if (!title.trim()) setOpen(false);
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open, title, phone]);
  // the project stays as picked for the next task (handy when adding several)
  const reset = () => { setTitle(''); setEst(null); setRemind(null); setDue({ date: todayISO(), time: null }); };
  const submit = () => {
    const name = parsed.title.trim();
    if (!name) return;
    const date = parsed.date ?? due.date;
    const addToMyDay = myDay && (!date || date <= todayISO());
    const t = st.addTask({ title: name, projectId: proj ?? st.inbox?.id ?? null, dueDate: date, dueTime: parsed.date ? null : due.time, estimateMin: parsed.estimate ?? est, remindAt: remind, myDayDate: addToMyDay ? todayISO() : null });
    flashTask(t.id);
    const where = addToMyDay && !projectId ? 'My Day' : project?.name ?? 'Inbox';
    toast.show(`Added to ${where}${addToMyDay && projectId ? ' and My Day' : ''}`, { icon: 'checkCircle', action: { label: 'Open', onClick: () => ui.openTask(t.id) }, duration: 4000 });
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
  const effDate = parsed.date ?? due.date;
  const dueText = effDate ? cap(dueLabel({ dueDate: effDate, dueTime: parsed.date ? null : due.time })!) : 'No due date';
  const effEst = parsed.estimate ?? est;
  const pickers = <>
      {pa.isOpen && <ProjectPicker anchor={pa.el} value={proj ?? st.inbox?.id ?? null} onPick={setProj} onClose={pa.close} />}
      {da.isOpen && <Popover anchor={da.el} onClose={da.close}><DuePicker date={parsed.date ?? due.date} time={parsed.date ? null : due.time} onDone={(date, time) => { setDue({ date, time }); da.close(); }} onClear={() => { setDue({ date: null, time: null }); da.close(); }} /></Popover>}
      {ra.isOpen && <RemindPicker anchor={ra.el} onClose={ra.close} t={{ dueDate: due.date, dueTime: due.time }} value={remind} onPick={setRemind} />}
      {estOpen && <EstimateDialog initial={parsed.estimate ?? est} onSet={setEst} onClose={() => setEstOpen(false)} dueAt={dueAt({ dueDate: due.date, dueTime: due.time }, st.settings)} avgOverrunMin={avgOverrunMin(st.tasks)} />}
  </>;
  // phones: a composer pinned above the keyboard — the title, one row of chips, a send button
  if (phone) return (
    <>
      <div className="add-scrim" onClick={() => setOpen(false)} />
      <div className="add-panel phone" ref={wrapRef}>
        <div className="line">
          <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task" aria-label="Task title" enterKeyHint="send"
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }} />
          <button className="send" aria-label="Add task" disabled={!parsed.title.trim()} onPointerDown={e => e.preventDefault()} onClick={submit}><Icon name="arrowUp" /></button>
        </div>
        {(parsed.date || parsed.estimate)
          ? <div className="hint">Understood “{title.slice(parsed.title.length).trim()}” as {[parsed.date && dueText.toLowerCase(), parsed.estimate && `a ${fmtMin(parsed.estimate)} estimate`].filter(Boolean).join(' and ')}.</div>
          : !title && <div className="hint">Tip: type “Write brief tomorrow 45m” to set the day and estimate.</div>}
        <div className="chips">
          {!projectId && <Chip emoji={project?.emoji} onClick={e => pa.open(e)}>{project?.name ?? 'Inbox'}</Chip>}
          <Chip icon="event" sel={!!effDate} onClick={e => da.open(e)}>{dueText}</Chip>
          <Chip icon="hourglass" sel={!!effEst} onClick={() => setEstOpen(true)}>{effEst ? fmtMin(effEst) : 'Estimate'}</Chip>
          <Chip icon="bell" sel={!!remind} onClick={e => ra.open(e)}>{remind ? `${cap(relDay(isoDate(new Date(remind))))} ${fmtClock(remind)}` : 'Remind'}</Chip>
          {!inMyDay && <Chip icon={myDay ? 'sunFill' : 'sun'} sel={myDay} onClick={() => setMyDay(!myDay)}>My Day</Chip>}
        </div>
        {pickers}
      </div>
    </>
  );
  return (
    <div className="add-panel" ref={wrapRef}>
      <div className="line">
        <Icon name="add" style={{ color: 'var(--primary)' }} />
        <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you need to do?  Try “Write brief tomorrow 45m”" aria-label="Task title"
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { reset(); setOpen(false); } }} />
        <span className="t-bs c-muted row gap-6" style={{ whiteSpace: 'nowrap' }}><span className="keycap">↵</span>Add</span>
      </div>
      <div className="chips">
        {!projectId && <Chip emoji={project?.emoji} onClick={e => pa.open(e)}>{project?.name ?? 'Inbox'}</Chip>}
        <Chip icon="event" sel={!!effDate} onClick={e => da.open(e)} onRemove={effDate && !parsed.date ? () => setDue({ date: null, time: null }) : undefined}>{dueText}</Chip>
        <Chip icon="hourglass" sel={!!effEst} onClick={() => setEstOpen(true)}>{effEst ? fmtMin(effEst) : 'Estimate'}</Chip>
        <Chip icon="bell" sel={!!remind} onClick={e => ra.open(e)}>{remind ? `${cap(relDay(isoDate(new Date(remind))))} ${fmtClock(remind)}` : 'Remind me'}</Chip>
        {!inMyDay && <Chip icon={myDay ? 'sunFill' : 'sun'} sel={myDay} onClick={() => setMyDay(!myDay)}>My Day</Chip>}
        <span className="grow" />
        <Btn kind="text" onClick={() => { reset(); setOpen(false); }}>Cancel</Btn>
        <Btn disabled={!parsed.title.trim()} onClick={submit}>Add</Btn>
      </div>
      {(parsed.date || parsed.estimate) && <div className="t-bs c-muted" style={{ paddingLeft: 36 }}>Understood “{title.slice(parsed.title.length).trim()}” as {[parsed.date && dueText.toLowerCase(), parsed.estimate && `a ${fmtMin(parsed.estimate)} estimate`].filter(Boolean).join(' and ')}.</div>}
      {pickers}
    </div>
  );
}

/** ▶ on a task without an estimate asks for one first */
export function EstimateFirstHost() {
  const st = useStore();
  const ui = useUI();
  const t = st.taskById(ui.estimateFirst);
  if (!t) return null;
  return <EstimateDialog mode="start" initial={null} dueAt={dueAt(t, st.settings)} avgOverrunMin={avgOverrunMin(st.tasks)} onClose={() => ui.askEstimate(null)}
    onSet={min => { if (min) st.updateTask(t.id, { estimateMin: min }); st.startTask(t.id); }} onStartAnyway={() => st.startTask(t.id)} />;
}

// ---------- Board: the same groups as the list ----------
export function TaskBoard({ tasks, showProject = true, myDay = false }: { tasks: Task[]; showProject?: boolean; myDay?: boolean }) {
  const st = useStore();
  const ui = useUI();
  const act = useTaskActions();
  const now = useNow(1000);
  const move = useMoveTask(tasks, myDay);
  const drag = useDragSort(move);
  const groups = statusGroups(st.settings.taskStatuses, tasks, myDay);
  return (
    <div className="board">
      {groups.map(g => (
        <div key={g.def.name} className="board-col" data-drop-group={g.def.name}>
          <div className="board-col-head">
            <span className="dot" style={{ background: toneDot(g.def.tone) }} />
            <span className="t-ts">{g.def.name}</span><span className="count">{g.tasks.length}</span>
          </div>
          {g.tasks.map(t => <BoardCard key={t.id} t={t} showProject={showProject} now={now} drag={drag(t.id)} onOpen={() => ui.openTask(t.id)} act={act} />)}
          {!g.tasks.length && <div className="drop-hint">Drag tasks here</div>}
        </div>
      ))}
    </div>
  );
}

function BoardCard({ t, showProject, now, drag, onOpen, act }: { t: Task; showProject: boolean; now: number; drag: Record<string, unknown>; onOpen: () => void; act: ReturnType<typeof useTaskActions> }) {
  const st = useStore();
  const ui = useUI();
  const p = st.projectById(t.projectId);
  const done = isDone(t);
  const amber = !done && isOverEstimate(t, now);
  const running = !!t.runStartedAt;
  const ma = useAnchor();
  const phone = useIsMobile() && (st.settings.rowDetails ?? 'hover') === 'hover';
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current; if (!el) return;
    const h = () => ma.open(el);
    el.addEventListener('ot-longpress', h);
    return () => el.removeEventListener('ot-longpress', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // phones: same calm content as the list rows (long-press for the menu)
  if (phone) return (
    <div ref={cardRef} className={cx('kcard phone', amber && 'amber', ui.taskId === t.id && 'sel', running && 'running', done && 'done')} {...drag} onClick={onOpen}
      onContextMenu={e => { e.preventDefault(); if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') ma.open(e.currentTarget as HTMLElement); }}>
      <div className="row gap-4" style={{ alignItems: 'flex-start' }}>
        <button className={cx('check sm', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
          <Icon name={done ? 'checkCircle' : 'circle'} size={22} />
        </button>
        <span className="col grow" style={{ minWidth: 0, gap: 2, paddingTop: 6 }}>
          <span className={cx('kc-title clamp2', done && 'c-muted')} style={{ textDecoration: done ? 'line-through' : undefined }}>{t.title}</span>
          <PhoneLine t={t} now={now} overdue={!done && !!t.dueDate && isOverdue(t, st.settings, now)} />
        </span>
        {!done && (
          <span className="row" style={{ alignItems: 'center', paddingTop: 2 }} onClick={e => e.stopPropagation()}>
            {!running && !t.elapsedMs && !!t.estimateMin && <span className="est">{fmtMin(totalEstimateMin(t))}</span>}
            {running ? <IBtn icon="pause" kind="pc" label="Pause" tip={false} onClick={() => act.pause(t)} /> : <IBtn icon="play" kind={t.elapsedMs ? 'pc' : 'standard'} className="play" label={t.elapsedMs ? 'Resume' : 'Start timer'} tip={false} onClick={() => act.start(t)} />}
          </span>
        )}
      </div>
      {ma.isOpen && <TaskMenu t={t} anchor={ma.el} onClose={ma.close} />}
    </div>
  );
  return (
    <div className={cx('kcard', amber && 'amber', ui.taskId === t.id && 'sel', running && 'running')} {...drag} onClick={onOpen}>
      <div className="row gap-4" style={{ alignItems: 'flex-start' }}>
        <button className={cx('check sm', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
          <Icon name={done ? 'checkCircle' : 'circle'} size={20} />
        </button>
        <span className={cx('t-bl grow', done && 'c-muted')} style={{ textDecoration: done ? 'line-through' : undefined, paddingTop: 4 }}>{t.title}</span>
        <IBtn sm icon="moreV" label="More" className="row-more" onClick={e => { e.stopPropagation(); ma.open(e); }} />
      </div>
      <div className="row gap-8" style={{ flexWrap: 'wrap', paddingLeft: 36 }}>
        {showProject && p && <span className="t-bs c-muted row gap-4"><span className="emoji">{p.emoji}</span>{p.name}</span>}
        {done ? <OutcomeChips t={t} /> : (
          <>
            <TimeChip t={t} now={now} />
            {t.dueDate && (isOverdue(t, st.settings, now) ? <Tag kind="err">Overdue · {relDay(t.dueDate)}</Tag> : <Tag>{dueLabel(t)}</Tag>)}
          </>
        )}
      </div>
      {!done && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: -4 }} onClick={e => e.stopPropagation()}>
          {running ? <IBtn sm icon="pause" kind="pc" label="Pause" onClick={() => act.pause(t)} /> : <IBtn sm icon="play" kind="pc" label={t.elapsedMs ? 'Resume' : 'Start timer'} onClick={() => act.start(t)} />}
        </div>
      )}
      {ma.isOpen && <TaskMenu t={t} anchor={ma.el} onClose={ma.close} />}
    </div>
  );
}

// ---------- Shared task filter (My Day and project pages) ----------
export interface TaskFilter { statuses: string[]; due: 'overdue' | 'today' | 'week' | null; projects: string[]; myDay: boolean }
export const EMPTY_FILTER: TaskFilter = { statuses: [], due: null, projects: [], myDay: false };
export const filterActive = (f: TaskFilter) => f.statuses.length > 0 || !!f.due || f.projects.length > 0 || f.myDay;
export function applyTaskFilter(tasks: Task[], f: TaskFilter, s: Settings) {
  const today = todayISO(), week = isoDate(addDays(new Date(), 7));
  return tasks.filter(t => {
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.projects.length && !(t.projectId && f.projects.includes(t.projectId))) return false;
    if (f.myDay && !(t.myDayDate && t.myDayDate <= today)) return false;
    if (f.due === 'overdue' && !isOverdue(t, s)) return false;
    if (f.due === 'today' && t.dueDate !== today) return false;
    if (f.due === 'week' && !(t.dueDate && t.dueDate >= today && t.dueDate <= week)) return false;
    return true;
  });
}
export function FilterButton({ value, onChange, showProjects, showMyDay }: { value: TaskFilter; onChange: (f: TaskFilter) => void; showProjects?: boolean; showMyDay?: boolean }) {
  const st = useStore();
  const a = useAnchor();
  const toggle = <K extends 'statuses' | 'projects'>(k: K, v: string) => onChange({ ...value, [k]: value[k].includes(v) ? value[k].filter(x => x !== v) : [...value[k], v] });
  return (
    <>
      <IBtn icon="filter" label="Filter tasks" kind={filterActive(value) || a.isOpen ? 'selected' : 'outlined'} onClick={e => a.open(e)} />
      {a.isOpen && (
        <Popover anchor={a.el} onClose={a.close} placement="below-end">
          <div className="menu" style={{ width: 360, padding: 16, gap: 12 }}>
            <span className="t-lm c-muted">STATUS</span>
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              {st.settings.taskStatuses.filter(s => s.name !== 'Archived').map(s => <Chip key={s.name} sel={value.statuses.includes(s.name)} onClick={() => toggle('statuses', s.name)}>{s.name}</Chip>)}
            </div>
            <span className="t-lm c-muted">DUE</span>
            <div className="row gap-8">{(['overdue', 'today', 'week'] as const).map(d => <Chip key={d} sel={value.due === d} onClick={() => onChange({ ...value, due: value.due === d ? null : d })}>{d === 'week' ? 'This week' : cap(d)}</Chip>)}</div>
            {showProjects && <>
              <span className="t-lm c-muted">PROJECT</span>
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                {st.projects.filter(p => !p.archived).map(p => <Chip key={p.id} emoji={p.emoji} sel={value.projects.includes(p.id)} onClick={() => toggle('projects', p.id)}>{p.name}</Chip>)}
              </div>
            </>}
            {showMyDay && <div className="row gap-12"><span className="t-bm grow">Only tasks in My Day</span><Switch on={value.myDay} onChange={v => onChange({ ...value, myDay: v })} label="Only tasks in My Day" /></div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="text" icon="close" disabled={!filterActive(value)} onClick={() => onChange(EMPTY_FILTER)}>Clear filter</Btn></div>
          </div>
        </Popover>
      )}
    </>
  );
}
export function FilterChips({ value, onChange, shown, total }: { value: TaskFilter; onChange: (f: TaskFilter) => void; shown: number; total: number }) {
  const st = useStore();
  if (!filterActive(value)) return null;
  return (
    <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
      {value.statuses.map(s => <Chip key={s} sel onRemove={() => onChange({ ...value, statuses: value.statuses.filter(x => x !== s) })}>{s}</Chip>)}
      {value.due && <Chip sel icon="event" onRemove={() => onChange({ ...value, due: null })}>{value.due === 'week' ? 'Due this week' : value.due === 'today' ? 'Due today' : 'Overdue'}</Chip>}
      {value.projects.map(id => { const p = st.projectById(id); return p ? <Chip key={id} sel emoji={p.emoji} onRemove={() => onChange({ ...value, projects: value.projects.filter(x => x !== id) })}>{p.name}</Chip> : null; })}
      {value.myDay && <Chip sel icon="sunFill" onRemove={() => onChange({ ...value, myDay: false })}>In My Day</Chip>}
      <span className="t-bs c-muted">{shown} of {total} tasks</span>
      <Btn kind="text" onClick={() => onChange(EMPTY_FILTER)}>Clear</Btn>
    </div>
  );
}

export { DateTimePicker };
