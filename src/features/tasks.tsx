import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import type { Project, Task, ID, Settings, Repeat } from '../lib/types';
import { rowFields } from '../lib/types';
import { PastedList, useListPaste } from '../ui/paste';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Dialog, Seg, Field, IBtn, MenuList, Popover, Switch, Tag, cx, useAnchor, type MenuItemDef, TONES, PopOutBtn } from '../ui/kit';
import { DuePicker, EstimateDialog, DateTimePicker, remindOptions } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import {
  addDays, dueAt, dueLabel, elapsed, fmtClock, fmtMin, fmtMs, fmtTimer, isDone, isOverEstimate, isOverdue, outcome, relDay, remainingMs, timerView,
  todayISO, totalEstimateMin, cap, isoDate, atTime, parseQuickAdd, repeatLabel, firstRepeatDate, nextRepeatDate, weekdayOf, WEEKDAY_SHORT, parseDate, pinRepeat, monthDayLabel,
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
    if (o.next) parts.push(`next ${relDay(o.next)}`);
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
  const skip = (t: Task) => {
    const prev = { dueDate: t.dueDate, myDayDate: t.myDayDate, plannedStart: t.plannedStart };
    if (t.runStartedAt) st.pauseTask(t.id);
    const next = st.skipOccurrence(t.id);
    if (next) toast.show(`Skipped · next ${relDay(next)}`, { icon: 'skip', action: { label: 'Undo', onClick: () => st.updateTask(t.id, prev) } });
  };
  /** set or clear a repeat rule; the due date moves to the first day the rule lands on */
  const setRepeat = (t: Pick<Task, 'id' | 'dueDate' | 'myDayDate'>, r: Repeat | null) => {
    if (!r) { st.updateTask(t.id, { repeat: null }); return; }
    const today = todayISO();
    const from = t.dueDate && t.dueDate > today ? t.dueDate : today;
    const due = firstRepeatDate(r, from);
    st.updateTask(t.id, { repeat: { ...pinRepeat(r, due), nextId: null }, dueDate: due, ...(t.myDayDate && due > today ? { myDayDate: due } : {}) });
  };
  return { finish, start, toggleDone, toggleMyDay, tomorrow, remove, setStatus, inMyDay, skip, setRepeat, pause: (t: Task) => st.pauseTask(t.id) };
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
      { t: 'Move to tomorrow', ic: 'event' as const, onClick: () => act.tomorrow(t) },
      ...(t.repeat ? [{ t: 'Skip this one', ic: 'skip' as const, sub: `Next: ${cap(relDay(nextRepeatDate(t.repeat, t.dueDate ?? todayISO())))}`, onClick: () => act.skip(t) }] : [])] : []),
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
/** Phone rows: one quiet line under the title, made of the details chosen in View options (in that order).
 *  It never wraps; what doesn't fit fades out at the end, so put the most useful detail first. */
function PhoneLine({ t, now, overdue, showProject = true }: { t: Task; now: number; overdue: boolean; showProject?: boolean }) {
  const st = useStore();
  const { settings } = st;
  const done = isDone(t);
  const running = !!t.runStartedAt;
  const timing = running || (!done && t.elapsedMs > 0);
  const up = settings.timerDirection === 'up';
  const fields = rowFields(settings).filter(f => f.on).map(f => f.id);
  const parts: ReactNode[] = [];
  for (const f of fields) {
    if (f === 'project') { const p = st.projectById(t.projectId); if (showProject && p) parts.push(<span key={f} className="lp proj"><span className="emo">{p.emoji}</span>{p.name}</span>); continue; }
    if (done) continue;
    if (f === 'timer' && timing) {
      const paused = running ? '' : 'Paused · ';
      if (!t.estimateMin) parts.push(<span key={f} className={cx('lp tnum', running && 'primary')}>{paused}{fmtTimer(elapsed(t, now))} elapsed</span>);
      else if (isOverEstimate(t, now)) parts.push(<span key={f} className="lp warn tnum">{paused}{fmtTimer(-remainingMs(t, now)).replace('+', '')} over</span>);
      else parts.push(<span key={f} className={cx('lp tnum', running && 'primary')}>{paused}{up ? timerView(t, now, 'up').line : `${fmtTimer(remainingMs(t, now))} left`}</span>);
    }
    if (f === 'due' && t.dueDate) {
      if (overdue) parts.push(<span key={f} className="lp err">Overdue · {t.dueDate === todayISO() && t.dueTime ? `was due ${fmtClock(atTime(t.dueDate, t.dueTime))}` : `was due ${relDay(t.dueDate)}`}</span>);
      else if (t.dueTime || t.dueDate !== todayISO()) parts.push(<span key={f} className="lp"><Icon name="event" size={14} />{cap(dueLabel(t)!.replace(/^due /i, ''))}</span>);
    }
    if (f === 'estimate' && t.estimateMin && !(timing && fields.includes('timer'))) parts.push(<span key={f} className="lp tnum"><Icon name="hourglass" size={14} />{fmtMin(totalEstimateMin(t))}</span>);
    if (f === 'steps' && t.steps.length) parts.push(<span key={f} className="lp tnum"><Icon name="checklist" size={14} />{t.steps.filter(x => x.done).length}/{t.steps.length}</span>);
    if (f === 'planned' && t.plannedStart) parts.push(<span key={f} className="lp"><Icon name="schedule" size={14} />{relDay(isoDate(new Date(t.plannedStart))) === 'today' ? '' : cap(relDay(isoDate(new Date(t.plannedStart)))) + ' '}{fmtClock(t.plannedStart)}</span>);
    if (f === 'status') parts.push(<span key={f} className="lp"><span className="dot" style={{ background: toneDot(settings.taskStatuses.find(x => x.name === t.status)?.tone ?? 'neutral') }} />{t.status}</span>);
    if (f === 'repeat' && t.repeat) parts.push(<span key={f} className="lp"><Icon name="repeat" size={14} />{repeatLabel(t.repeat, t.dueDate)}</span>);
    if (f === 'remind' && t.remindAt && !t.remindedAt) parts.push(<span key={f} className="lp"><Icon name="bell" size={14} />{cap(relDay(isoDate(new Date(t.remindAt))))} {fmtClock(t.remindAt)}</span>);
  }
  if (!parts.length) return null;
  return <span className="line plist">{parts.flatMap((x, i) => (i ? [<span key={'s' + i} className="sep" aria-hidden>·</span>, x] : [x]))}</span>;
}

/** Phone rows: swipe right to finish (or reopen), swipe left to move to tomorrow. Vertical swipes still scroll. */
function useSwipe(onRight: () => void, onLeft: (() => void) | null) {
  const st = useRef<{ x: number; y: number; id: number; mode: 'idle' | 'swipe' | 'scroll' } | null>(null);
  const reset = (el: HTMLElement) => { el.classList.remove('swiping', 'swipe-r', 'swipe-l', 'armed'); el.style.removeProperty('--sx'); };
  const TH = 96;
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button')) return;
      st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: 'idle' };
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = st.current; if (!s || s.id !== e.pointerId || document.body.classList.contains('is-dragging')) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (s.mode === 'idle') {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s.mode = 'scroll'; return; }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5 && (dx > 0 || onLeft)) s.mode = 'swipe'; else return;
      }
      if (s.mode !== 'swipe') return;
      const el = e.currentTarget;
      const x = dx > 0 ? Math.min(dx, 160) : onLeft ? Math.max(dx, -160) : 0;
      el.classList.add('swiping'); el.classList.toggle('swipe-r', x > 0); el.classList.toggle('swipe-l', x < 0); el.classList.toggle('armed', Math.abs(x) >= TH);
      el.style.setProperty('--sx', x + 'px');
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const s = st.current; st.current = null; if (!s || s.mode !== 'swipe') return;
      const el = e.currentTarget; const dx = e.clientX - s.x;
      // swallow the click that follows the swipe
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 300);
      reset(el);
      if (dx >= TH) onRight(); else if (dx <= -TH && onLeft) onLeft();
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => { st.current = null; reset(e.currentTarget); },
  };
}

/** combine the drag props (data-drag-id + onPointerDown) with the swipe handlers */
function merge(drag: Record<string, unknown> | undefined, sw: ReturnType<typeof useSwipe>) {
  const d = (drag ?? {}) as { onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void } & Record<string, unknown>;
  return { ...d, ...sw, onPointerDown: (e: React.PointerEvent<HTMLElement>) => { sw.onPointerDown(e); d.onPointerDown?.(e); } };
}

/** clicks inside a menu/dialog rendered from a row bubble through React to the row: ignore those */
const fromOverlay = (e: React.MouseEvent) => !!(e.target as HTMLElement).closest?.('.popover, .scrim');
/** taps on a row's trailing buttons stay with the button; taps on the estimate or time text open the task */
const btnOnly = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('button, .popover, .scrim')) e.stopPropagation(); };

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
  // phones: no hover, so rows stay calm: the title and one quiet line of the details picked in View options
  const phone = useIsMobile();
  const swipe = useSwipe(() => act.toggleDone(t), done ? null : () => act.tomorrow(t));
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
  if (t.repeat && !done) meta.push(<span className="m" data-tip="Repeats"><Icon name="repeat" />{repeatLabel(t.repeat, t.dueDate)}</span>);
  if (!done && t.remindAt && !t.remindedAt) meta.push(<span className="m" data-tip={`Reminder ${relDay(isoDate(new Date(t.remindAt)))} ${fmtClock(t.remindAt)}`}><Icon name="bell" /></span>);

  if (phone) return (
    <div ref={rowRef} {...merge(drag, swipe)} className={cx('task-row phone', done && 'done', amber && 'amber', running && 'live', ui.taskId === t.id && 'sel', isFlash && 'flash')}
      onClick={e => { if (!fromOverlay(e)) ui.openTask(t.id); }} data-task={t.id}
      onContextMenu={e => { e.preventDefault(); if (!drag || (e.nativeEvent as PointerEvent).pointerType === 'mouse') ma.open(e.currentTarget as HTMLElement); }}>
      <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'}
        onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
        <Icon name={done ? 'checkCircle' : 'circle'} />
      </button>
      <div className="text">
        <span className="title clamp2">{t.title || 'Untitled task'}{t.repeat && !done && <Icon name="repeat" size={15} className="rep-ic" aria-label={repeatLabel(t.repeat, t.dueDate)} />}</span>
        <PhoneLine t={t} now={now} overdue={overdue} showProject={showProject} />
      </div>
      {!done && (
        <div className="trail" onClick={btnOnly}>
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
      onClick={e => { if (!fromOverlay(e)) ui.openTask(t.id); }} data-task={t.id}>
      {drag && <span className="grip" data-drag-handle aria-hidden><Icon name="drag" /></span>}
      <button className={cx('check', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} data-tip={done ? 'Mark not done' : 'Mark done'}
        onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
        <Icon name={done ? 'checkCircle' : 'circle'} />
      </button>
      <div className="text">
        <span className="row gap-6" style={{ minWidth: 0 }}>
          <span className="title ellipsis">{t.title || 'Untitled task'}</span>
          {calm && t.repeat && !done && <Icon name="repeat" size={15} className="rep-ic" data-tip={repeatLabel(t.repeat, t.dueDate)} />}
          {calm && overdue && <span className="overdue-dot" data-tip="Overdue" aria-label="Overdue" />}
        </span>
        {meta.length > 0 && <Meta>{meta}</Meta>}
      </div>
      <div className="trail" onClick={btnOnly}>
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
  const [rep, setRep] = useState<Repeat | null>(null);
  const [bulk, setBulk] = useState<string[] | null>(null);
  const pa = useAnchor(), da = useAnchor(), ra = useAnchor(), rpa = useAnchor();
  const [estOpen, setEstOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const phone = useIsMobile();
  const project = st.projectById(proj ?? st.inbox?.id);
  const parsed = useMemo(() => parseQuickAdd(title), [title]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  // paste a list (Notion, ChatGPT, notes…): each line becomes its own task
  useListPaste(inputRef, items => setBulk(b => [...(b ?? (title.trim() ? [title.trim()] : [])), ...items]), open);
  // desktop: press N anywhere (not while typing) to add a task
  useEffect(() => {
    if (phone) return;
    const h = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement as HTMLElement | null;
      if (a?.matches('input, textarea, select, [contenteditable=true]') || document.querySelector('.popover, .scrim, .sheet .inline-input:focus')) return;
      e.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phone]);
  useEffect(() => {
    if (!open || phone) return; // phones: the composer's scrim handles outside taps (no tap-through)
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (wrapRef.current?.contains(t) || t.closest('.popover') || t.closest('.scrim')) return;
      if (!title.trim() && !bulk) setOpen(false);
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open, title, bulk, phone]);
  // the project stays as picked for the next task (handy when adding several)
  const reset = () => { setTitle(''); setEst(null); setRemind(null); setRep(null); setBulk(null); setDue({ date: todayISO(), time: null }); };
  const submitBulk = (items: string[]) => {
    // every line keeps the composer's project, due date, estimate and My Day; a line can still say "tomorrow 30m"
    const base = st.tasks.reduce((m, x) => Math.max(m, x.sort), 0);
    let first: Task | null = null, inMy = false;
    items.forEach((line, i) => {
      const q = parseQuickAdd(line);
      const name = q.title.trim() || line;
      let date = q.date ?? due.date;
      const repeat = q.repeat ?? rep;
      if (repeat) date = firstRepeatDate(repeat, date && date > todayISO() ? date : todayISO());
      const addToMyDay = myDay && (!date || date <= todayISO());
      inMy = inMy || addToMyDay;
      const t = st.addTask({ title: name, projectId: proj ?? st.inbox?.id ?? null, dueDate: date, dueTime: q.date ? null : due.time, estimateMin: q.estimate ?? est, remindAt: remind,
        myDayDate: addToMyDay ? todayISO() : repeat && myDay && date ? date : null, sort: base + 1 + i, ...(repeat ? { repeat: { ...pinRepeat(repeat, date), nextId: null } } : {}) });
      first = first ?? t;
    });
    if (first) flashTask((first as Task).id);
    const where = inMy && !projectId ? 'My Day' : project?.name ?? 'Inbox';
    toast.show(`Added ${items.length} tasks to ${where}`, { icon: 'checkCircle', duration: 5000, action: { label: 'Undo', onClick: () => st.undo() } });
    reset();
    inputRef.current?.focus();
  };
  const submit = () => {
    if (bulk) return submitBulk(bulk);
    const name = parsed.title.trim();
    if (!name) return;
    const repeat = parsed.repeat ?? rep;
    // a repeating task starts on the first day its rule lands on
    let date = parsed.date ?? due.date;
    if (repeat) date = firstRepeatDate(repeat, date && date > todayISO() ? date : todayISO());
    const addToMyDay = myDay && (!date || date <= todayISO());
    const t = st.addTask({ title: name, projectId: proj ?? st.inbox?.id ?? null, dueDate: date, dueTime: parsed.date ? null : due.time, estimateMin: parsed.estimate ?? est, remindAt: remind,
      myDayDate: addToMyDay ? todayISO() : repeat && myDay && date ? date : null, ...(repeat ? { repeat: { ...pinRepeat(repeat, date), nextId: null } } : {}) });
    flashTask(t.id);
    const where = addToMyDay && !projectId ? 'My Day' : project?.name ?? 'Inbox';
    toast.show(`Added to ${where}${addToMyDay && projectId ? ' and My Day' : ''}`, { icon: 'checkCircle', action: { label: 'Open', onClick: () => ui.openTask(t.id) }, duration: 4000 });
    reset();
    inputRef.current?.focus();
  };
  if (!open) {
    return (
      <button className="add-bar state" onClick={() => setOpen(true)}>
        <Icon name="add" /><span className="grow">{label}</span>{!phone && <span className="keycap" aria-hidden>N</span>}
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
      {rpa.isOpen && <RepeatPicker anchor={rpa.el} value={parsed.repeat ?? rep} dueDate={parsed.date ?? due.date} onClose={rpa.close} onPick={r => { setRep(r); rpa.close(); }} />}
      {estOpen && <EstimateDialog initial={parsed.estimate ?? est} onSet={setEst} onClose={() => setEstOpen(false)} dueAt={dueAt({ dueDate: due.date, dueTime: due.time }, st.settings)} avgOverrunMin={avgOverrunMin(st.tasks)} />}
  </>;
  // phones: a composer pinned above the keyboard — the title, one row of chips, a send button
  if (phone) return (
    <>
      <div className="add-scrim" onClick={() => setOpen(false)} />
      <div className="add-panel phone" ref={wrapRef}>
        <div className="line">
          <input ref={inputRef} value={bulk ? '' : title} readOnly={!!bulk} onChange={e => setTitle(e.target.value)} placeholder={bulk ? `Send adds all ${bulk.length}` : 'Add a task'} aria-label="Task title" enterKeyHint="send"
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { if (bulk) setBulk(null); else setOpen(false); } }} />
          <button className="send" aria-label={bulk ? `Add ${bulk.length} tasks` : 'Add task'} disabled={!bulk && !parsed.title.trim()} onPointerDown={e => e.preventDefault()} onClick={submit}><Icon name="arrowUp" /></button>
        </div>
        {bulk && <PastedList items={bulk} noun={['task', 'tasks']} onChange={setBulk} onAdd={submit} onCancel={() => { setBulk(null); inputRef.current?.focus(); }} />}
        {(parsed.date || parsed.estimate || parsed.repeat)
          ? <div className="hint">Understood “{title.slice(parsed.title.length).trim()}” as {[parsed.repeat && repeatLabel(parsed.repeat).toLowerCase(), parsed.date && dueText.toLowerCase(), parsed.estimate && `a ${fmtMin(parsed.estimate)} estimate`].filter(Boolean).join(', ')}.</div>
          : !title && !bulk && <div className="hint">Tip: type “Write brief tomorrow 45m” to set the day and estimate. Paste a list to add several.</div>}
        <div className="chips">
          {!projectId && <Chip emoji={project?.emoji} onClick={e => pa.open(e)}>{project?.name ?? 'Inbox'}</Chip>}
          <Chip icon="event" sel={!!effDate} onClick={e => da.open(e)}>{dueText}</Chip>
          <Chip icon="hourglass" sel={!!effEst} onClick={() => setEstOpen(true)}>{effEst ? fmtMin(effEst) : 'Estimate'}</Chip>
          <Chip icon="repeat" sel={!!(parsed.repeat ?? rep)} onClick={e => rpa.open(e)}>{parsed.repeat ?? rep ? repeatLabel(parsed.repeat ?? rep, parsed.date ?? due.date) : 'Repeat'}</Chip>
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
        <input ref={inputRef} value={bulk ? '' : title} readOnly={!!bulk} onChange={e => setTitle(e.target.value)} placeholder={bulk ? `Press Enter to add all ${bulk.length}` : 'What do you need to do?  Try “Write brief tomorrow 45m”, or paste a list'} aria-label="Task title"
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { if (bulk) setBulk(null); else { reset(); setOpen(false); } } }} />
        <span className="t-bs c-muted row gap-6" style={{ whiteSpace: 'nowrap' }}><span className="keycap">↵</span>Add{bulk ? ` ${bulk.length}` : ''}</span>
      </div>
      {bulk && <PastedList items={bulk} noun={['task', 'tasks']} onChange={setBulk} onAdd={submit} onCancel={() => { setBulk(null); inputRef.current?.focus(); }} />}
      <div className="chips">
        {!projectId && <Chip emoji={project?.emoji} onClick={e => pa.open(e)}>{project?.name ?? 'Inbox'}</Chip>}
        <Chip icon="event" sel={!!effDate} onClick={e => da.open(e)} onRemove={effDate && !parsed.date ? () => setDue({ date: null, time: null }) : undefined}>{dueText}</Chip>
        <Chip icon="hourglass" sel={!!effEst} onClick={() => setEstOpen(true)}>{effEst ? fmtMin(effEst) : 'Estimate'}</Chip>
        <Chip icon="repeat" sel={!!(parsed.repeat ?? rep)} onClick={e => rpa.open(e)} onRemove={rep && !parsed.repeat ? () => setRep(null) : undefined}>{parsed.repeat ?? rep ? repeatLabel(parsed.repeat ?? rep, parsed.date ?? due.date) : 'Repeat'}</Chip>
        <Chip icon="bell" sel={!!remind} onClick={e => ra.open(e)}>{remind ? `${cap(relDay(isoDate(new Date(remind))))} ${fmtClock(remind)}` : 'Remind me'}</Chip>
        {!inMyDay && <Chip icon={myDay ? 'sunFill' : 'sun'} sel={myDay} onClick={() => setMyDay(!myDay)}>My Day</Chip>}
        <span className="grow" />
        <Btn kind="text" onClick={() => { reset(); setOpen(false); }}>Cancel</Btn>
        {!bulk && <Btn disabled={!parsed.title.trim()} onClick={submit}>Add</Btn>}
      </div>
      {(parsed.date || parsed.estimate || parsed.repeat) && <div className="t-bs c-muted" style={{ paddingLeft: 36 }}>Understood “{title.slice(parsed.title.length).trim()}” as {[parsed.repeat && repeatLabel(parsed.repeat).toLowerCase(), parsed.date && dueText.toLowerCase(), parsed.estimate && `a ${fmtMin(parsed.estimate)} estimate`].filter(Boolean).join(', ')}.</div>}
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
    <div ref={cardRef} className={cx('kcard phone', amber && 'amber', ui.taskId === t.id && 'sel', running && 'running', done && 'done')} {...drag} onClick={e => { if (!fromOverlay(e)) onOpen(); }}
      onContextMenu={e => { e.preventDefault(); if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') ma.open(e.currentTarget as HTMLElement); }}>
      <div className="row gap-4" style={{ alignItems: 'flex-start' }}>
        <button className={cx('check sm', done && 'on', amber && 'amber')} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={e => { e.stopPropagation(); act.toggleDone(t); }}>
          <Icon name={done ? 'checkCircle' : 'circle'} size={22} />
        </button>
        <span className="col grow" style={{ minWidth: 0, gap: 2, paddingTop: 6 }}>
          <span className={cx('kc-title clamp2', done && 'c-muted')} style={{ textDecoration: done ? 'line-through' : undefined }}>{t.title}</span>
          <PhoneLine t={t} now={now} overdue={!done && !!t.dueDate && isOverdue(t, st.settings, now)} showProject={showProject} />
        </span>
        {!done && (
          <span className="row" style={{ alignItems: 'center', paddingTop: 2 }} onClick={btnOnly}>
            {running ? <IBtn icon="pause" kind="pc" label="Pause" tip={false} onClick={() => act.pause(t)} /> : <IBtn icon="play" kind={t.elapsedMs ? 'pc' : 'standard'} className="play" label={t.elapsedMs ? 'Resume' : 'Start timer'} tip={false} onClick={() => act.start(t)} />}
          </span>
        )}
      </div>
      {ma.isOpen && <TaskMenu t={t} anchor={ma.el} onClose={ma.close} />}
    </div>
  );
  return (
    <div className={cx('kcard', amber && 'amber', ui.taskId === t.id && 'sel', running && 'running')} {...drag} onClick={e => { if (!fromOverlay(e)) onOpen(); }}>
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

// ---------- Repeat (drawer, composer) ----------
const sameRule = (a: Repeat | null | undefined, b: Repeat | null) =>
  !!a && !!b && a.freq === b.freq && (a.every || 1) === (b.every || 1) && [...(a.days ?? [])].sort().join() === [...(b.days ?? [])].sort().join();
const isMonthly = (r: Repeat | null | undefined) => !!r && r.freq === 'month' && (r.every || 1) === 1;

/** the four rules people actually use, plus Custom… (any weekdays, every N days/weeks/months) */
export function RepeatPicker({ anchor, value, dueDate, onPick, onClose }: { anchor: HTMLElement | null; value: Repeat | null; dueDate: string | null; onPick: (r: Repeat | null) => void; onClose: () => void }) {
  const [dialog, setDialog] = useState<null | 'monthly' | 'custom'>(null);
  const presets: { r: Repeat; sub: string }[] = [
    { r: { freq: 'day', every: 1 }, sub: 'Every day' },
    { r: { freq: 'week', every: 1, days: [0, 1, 2, 3, 4] }, sub: 'Monday to Friday' },
    { r: { freq: 'week', every: 1, days: [5, 6] }, sub: 'Saturday and Sunday' },
  ];
  if (dialog) return <RepeatDialog mode={dialog} value={value} dueDate={dueDate} onSave={r => { onPick(r); onClose(); }} onClose={onClose} />;
  const isPreset = presets.some(p => sameRule(value, p.r)) || isMonthly(value);
  const monthSub = isMonthly(value) ? `On ${monthDayLabel(value!.monthDay ?? parseDate(dueDate ?? todayISO()).getDate())}` : 'Pick the day of the month';
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <MenuList width={280} onClose={onClose} items={[
        { label: 'Repeat' },
        { t: 'Doesn’t repeat', ic: 'close', sel: !value, onClick: () => onPick(null) },
        ...presets.map(p => ({ t: repeatLabel(p.r), sub: p.sub, ic: 'repeat' as const, sel: sameRule(value, p.r), onClick: () => onPick(p.r) })),
        { t: 'Monthly', sub: monthSub, ic: 'calendar', sel: isMonthly(value), keepOpen: true, onClick: () => setDialog('monthly') },
        { divider: true },
        { t: value && !isPreset ? `Custom · ${repeatLabel(value, dueDate)}` : 'Custom…', sub: value && !isPreset ? undefined : 'Pick days, or every 2 weeks, 3 months…', ic: 'tune', sel: !!value && !isPreset, keepOpen: true, onClick: () => setDialog('custom') },
        { note: 'When you finish a repeating task, the next one appears on its day. Skip one from the task’s menu.' },
      ]} />
    </Popover>
  );
}

/** a month at a glance: tap the day it should land on */
function MonthDayGrid({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="col gap-8">
      <div className="md-grid" role="radiogroup" aria-label="Day of the month">
        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
          <button key={d} type="button" role="radio" aria-checked={value === d} className={cx('md-btn state tnum', value === d && 'on')} onClick={() => onChange(d)}>{d}</button>
        ))}
        <button type="button" role="radio" aria-checked={value === -1} className={cx('md-btn md-last state', value === -1 && 'on')} onClick={() => onChange(-1)}>Last day</button>
      </div>
      {value >= 29 && <span className="t-bs c-muted">In shorter months it lands on the last day.</span>}
    </div>
  );
}

/** Monthly: which day. Custom: every N days / weeks (on these weekdays) / months (on this day). Both preview the next dates. */
export function RepeatDialog({ mode = 'custom', value, dueDate, onSave, onClose }: { mode?: 'monthly' | 'custom'; value: Repeat | null; dueDate: string | null; onSave: (r: Repeat) => void; onClose: () => void }) {
  const today = todayISO();
  const base = dueDate && dueDate > today ? dueDate : today;
  const [freq, setFreq] = useState<Repeat['freq']>(mode === 'monthly' ? 'month' : value?.freq ?? 'week');
  const [every, setEvery] = useState(mode === 'monthly' ? 1 : value?.every ?? 1);
  const [days, setDays] = useState<number[]>(value?.days?.length ? value.days : [weekdayOf(base)]);
  const [monthDay, setMonthDay] = useState<number>(value?.freq === 'month' ? value.monthDay ?? parseDate(dueDate ?? today).getDate() : parseDate(base).getDate());
  const r: Repeat = { freq, every, ...(freq === 'week' ? { days } : {}), ...(freq === 'month' ? { monthDay } : {}) };
  const ok = freq !== 'week' || days.length > 0;
  const preview: string[] = [];
  if (ok) { let d = firstRepeatDate(r, base); for (let i = 0; i < (freq === 'month' ? 3 : 4); i++) { preview.push(d); d = nextRepeatDate(r, d); } }
  const fmt = (d: string) => (freq === 'month' && d > isoDate(addDays(parseDate(today), 6)) ? parseDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : cap(relDay(d)));
  const unit = { day: every === 1 ? 'day' : 'days', week: every === 1 ? 'week' : 'weeks', month: every === 1 ? 'month' : 'months' };
  return (
    <Dialog onClose={onClose} width={420} label={mode === 'monthly' ? 'Repeat monthly' : 'Custom repeat'}>
      <div className="col gap-16">
        <div className="row gap-8"><Icon name="repeat" style={{ color: 'var(--primary)' }} /><span className="t-tl grow">{mode === 'monthly' ? 'Repeat monthly' : 'Custom repeat'}</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
        {mode === 'custom' && (
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            <span className="t-bl">Every</span>
            <IBtn icon="remove" kind="outlined" label="Fewer" disabled={every <= 1} onClick={() => setEvery(Math.max(1, every - 1))} />
            <span className="t-tl tnum" style={{ minWidth: 24, textAlign: 'center' }}>{every}</span>
            <IBtn icon="add" kind="outlined" label="More" disabled={every >= 30} onClick={() => setEvery(Math.min(30, every + 1))} />
            <Seg value={freq} onChange={setFreq} items={[{ value: 'day', label: unit.day }, { value: 'week', label: unit.week }, { value: 'month', label: unit.month }]} />
          </div>
        )}
        {freq === 'week' && (
          <div className="col gap-8">
            <span className="t-ll c-muted">On</span>
            <div className="row gap-6 wd-row">
              {WEEKDAY_SHORT.map((l, i) => (
                <button key={i} className={cx('wd-btn state', days.includes(i) && 'on')} aria-pressed={days.includes(i)} aria-label={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}
                  onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort())}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {freq === 'month' && (
          <div className="col gap-8">
            <span className="t-ll c-muted">On day</span>
            <MonthDayGrid value={monthDay} onChange={setMonthDay} />
          </div>
        )}
        <div className="t-bm c-muted">{ok ? <>Next: {preview.map(fmt).join(', ')}…</> : 'Pick at least one day.'}</div>
        <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn disabled={!ok} onClick={() => onSave(r)}>Done</Btn></div>
      </div>
    </Dialog>
  );
}
