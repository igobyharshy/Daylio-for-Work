import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, useNow } from '../lib/store';
import { useUI } from '../app/ui';
import type { BlockKind, Task, TimeBlock } from '../lib/types';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, Chip, Field, IBtn, Popover, Seg, cx } from '../ui/kit';
import { TimeInput } from '../ui/pickers';
import { useIsMobile } from '../lib/native';
import { useToast } from '../ui/Toast';
import { archivedIds, inMyDay, isLive, realTasks } from '../lib/select';
import {
  PLAN_DEFAULT_MIN, addDays, atTime, elapsed, fmtClock, fmtDayLong, fmtMin, hhmm, isDone, isoDate, parseDate,
  plannedRange, todayISO, totalEstimateMin, workSessions,
} from '../lib/time';

/*
 * Timeline (My Day → third view). One row per task or block, hours across the top.
 *   Plan   = the planned slot (plannedStart → + estimate): dashed outline. Move = when; stretch = estimate.
 *   Actual = timer sessions: solid. Edges edit the real start / end; the recorded time follows.
 *   Blocks = meetings, lunch, breaks: one time range, shown in every mode.
 * Due dates are untouched by all of this.
 */

const H = 3600000, MIN = 60000;
const LABEL_W = 232;
const SNAP = 5 * MIN;
type Mode = 'plan' | 'actual' | 'both';

const KINDS: { kind: BlockKind; label: string; icon: IconName }[] = [
  { kind: 'meeting', label: 'Meeting', icon: 'groups' },
  { kind: 'lunch', label: 'Lunch', icon: 'restaurant' },
  { kind: 'break', label: 'Break', icon: 'coffee' },
  { kind: 'other', label: 'Other', icon: 'event' },
];
const kindOf = (k: BlockKind) => KINDS.find(x => x.kind === k) ?? KINDS[3];

interface Act { s: number; e: number; i: number; open: boolean }
type RowT =
  | { key: string; type: 'task'; t: Task; plan: [number, number] | null; acts: Act[]; first: number }
  | { key: string; type: 'block'; b: TimeBlock; s: number; e: number; first: number };

interface Drag {
  key: string; part: 'plan' | 'act' | 'block'; edge: 'move' | 'start' | 'end'; actIndex?: number;
  x0: number; y0: number; s0: number; e0: number; s: number; e: number; moved: boolean; min: number; max: number;
}

/** bars narrower than this show their label beside them */
const FIT = 104;
const Out = ({ show, left, top, height, children }: { show: boolean; left: number; top: number; height: number; children: React.ReactNode }) =>
  show ? <span className="tl-out" style={{ left: left + 6, top, height }}>{children}</span> : null;

const snap = (ms: number, step = SNAP) => Math.round(ms / step) * step;
const overlap = (s: number, e: number, a: number, b: number) => Math.max(0, Math.min(e, b) - Math.max(s, a));

export function TimelineView() {
  const st = useStore();
  const ui = useUI();
  const toast = useToast();
  const [day, setDay] = useState(todayISO());
  const today = todayISO();
  const isToday = day === today;
  const mode: Mode = st.settings.timelineMode ?? 'both';
  const now = useNow(30000);
  const d0 = parseDate(day).getTime(), d1 = addDays(parseDate(day), 1).getTime();
  const arch = useMemo(() => archivedIds(st.projects), [st.projects]);
  const tasks = useMemo(() => realTasks(st.tasks), [st.tasks]);

  // ---------- rows ----------
  const { rows, toPlan } = useMemo(() => {
    const out: RowT[] = [];
    for (const t of tasks) {
      if (t.status === 'Archived') continue;
      const pr = plannedRange(t);
      const plan: [number, number] | null = pr && overlap(pr[0].getTime(), pr[1].getTime(), d0, d1) > 0 ? [pr[0].getTime(), pr[1].getTime()] : null;
      const acts: Act[] = workSessions(t)
        .map((x, i) => ({ s: new Date(x.s).getTime(), e: x.e ? new Date(x.e).getTime() : now, i, open: !x.e }))
        .filter(a => a.e > d0 && a.s < d1);
      const show = mode === 'plan' ? !!plan : mode === 'actual' ? acts.length > 0 : !!plan || acts.length > 0;
      if (!show) continue;
      const first = Math.min(plan?.[0] ?? Infinity, ...acts.map(a => a.s));
      out.push({ key: 't' + t.id, type: 'task', t, plan, acts, first });
    }
    for (const b of st.blocks) {
      const s = new Date(b.startAt).getTime(), e = new Date(b.endAt).getTime();
      if (e > d0 && s < d1) out.push({ key: 'b' + b.id, type: 'block', b, s, e, first: s });
    }
    out.sort((a, b) => a.first - b.first);
    const planned = new Set(tasks.filter(t => { const r = plannedRange(t); return r && isoDate(r[0]) === day; }).map(t => t.id));
    const toPlan = tasks.filter(t => !isDone(t) && isLive(t, arch) && !planned.has(t.id) &&
      (day === today ? inMyDay(t, today) || t.dueDate === day : t.dueDate === day || t.myDayDate === day))
      .sort((a, b) => a.sort - b.sort);
    return { rows: out, toPlan };
  }, [tasks, st.blocks, d0, d1, mode, now, arch, day, today]);

  // ---------- hour range & sizing ----------
  const [ws, we] = [st.settings.workStart, st.settings.workEnd].map(x => atTime(day, x).getTime());
  let lo = ws, hi = we;
  rows.forEach(r => {
    if (r.type === 'block') { lo = Math.min(lo, r.s); hi = Math.max(hi, r.e); return; }
    if (r.plan && mode !== 'actual') { lo = Math.min(lo, r.plan[0]); hi = Math.max(hi, r.plan[1]); }
    if (mode !== 'plan') r.acts.forEach(a => { lo = Math.min(lo, a.s); hi = Math.max(hi, a.e); });
  });
  if (isToday) { lo = Math.min(lo, now); hi = Math.max(hi, now + 30 * MIN); }
  const startH = Math.max(0, Math.floor((Math.max(lo, d0) - d0) / H));
  const endH = Math.min(24, Math.ceil((Math.min(hi, d1) - d0) / H));
  const hours = Math.max(1, endH - startH);
  const r0 = d0 + startH * H;
  const r1 = d0 + endH * H;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(1000);
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth));
    ro.observe(el); setWrapW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // phones: a narrow name column so most of the screen is the timeline itself
  const phone = useIsMobile();
  const labelW = phone ? 112 : LABEL_W;
  const hourW = Math.max(phone ? 72 : 64, Math.floor((wrapW - labelW - 2) / hours));
  const laneW = hourW * hours;
  const X = (ms: number) => ((Math.max(r0, Math.min(r1, ms)) - r0) / H) * hourW;
  const rowH = mode === 'both' ? 54 : 44;

  // open scrolled to the useful part: a bit before now (today) or the start of the work day
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef('');
  useLayoutEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const key = `${day}|${hourW}|${startH}|${labelW}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    // start of the work day, unless that would leave "now" off-screen
    const visible = ((el.clientWidth - labelW) / hourW) * H;
    let target = ws - 0.25 * H;
    if (isToday && now > target + visible - H) target = now - visible + H;
    if (isToday && now < target) target = now - 0.5 * H;
    el.scrollLeft = Math.max(0, X(target) - 8);
  });

  // ---------- summary ----------
  const sum = useMemo(() => {
    let plan = 0, work = 0, blocks = 0;
    const perHour = Array(24).fill(0) as number[];
    rows.forEach(r => {
      if (r.type === 'block') { blocks += overlap(r.s, r.e, d0, d1); return; }
      if (r.plan) plan += overlap(r.plan[0], r.plan[1], d0, d1);
      r.acts.forEach(a => {
        work += overlap(a.s, a.e, d0, d1);
        for (let h = 0; h < 24; h++) perHour[h] += overlap(a.s, a.e, d0 + h * H, d0 + (h + 1) * H);
      });
    });
    return { plan, work, blocks, perHour };
  }, [rows, d0, d1]);

  // ---------- dragging bars ----------
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const panelRef = useRef<HTMLDivElement>(null);
  const [overPanel, setOverPanel] = useState(false);

  const begin = (e: React.PointerEvent, d: Omit<Drag, 'x0' | 'y0' | 's' | 'e' | 'moved'>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ ...d, x0: e.clientX, y0: e.clientY, s: d.s0, e: d.e0, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4 && Math.abs(e.clientY - d.y0) < 4) return;
    // the dragged edge lands on a 5-minute mark; a moved bar keeps its length
    const dt = (dx / hourW) * H;
    let s = d.s0, en = d.e0;
    if (d.edge === 'move') { s = snap(d.s0 + dt); en = s + (d.e0 - d.s0); if (s < d.min) { en += d.min - s; s = d.min; } if (en > d.max) { s -= en - d.max; en = d.max; } }
    if (d.edge === 'start') s = Math.max(d.min, Math.min(d.e0 - SNAP, snap(d.s0 + dt)));
    if (d.edge === 'end') en = Math.min(d.max, Math.max(d.s0 + SNAP, snap(d.e0 + dt)));
    if (d.part === 'plan' && d.edge === 'move' && panelRef.current) {
      const r = panelRef.current.getBoundingClientRect();
      setOverPanel(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    }
    setDrag({ ...d, s, e: en, moved: true });
  };
  const end = (e: React.PointerEvent, onClick: () => void) => {
    const d = dragRef.current; setDrag(null);
    const dropOnPanel = overPanel; setOverPanel(false);
    if (!d || e.type === 'pointercancel') return;
    if (!d.moved) {
      // opened on release: swallow the click that follows, or it lands on whatever just opened under the finger
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
      onClick(); return;
    }
    commit(d, dropOnPanel);
  };

  const setEstimate = (t: Task, min: number) => {
    min = Math.max(5, Math.round(min / 5) * 5);
    if (t.firstStartedAt && t.estimateMin) { const diff = min - totalEstimateMin(t); if (diff) st.reEstimate(t.id, diff); }
    else st.updateTask(t.id, { estimateMin: min });
  };
  const commit = (d: Drag, dropOnPanel: boolean) => {
    const row = rows.find(r => r.key === d.key); if (!row) return;
    if (row.type === 'block') { st.updateBlock(row.b.id, { startAt: new Date(d.s).toISOString(), endAt: new Date(d.e).toISOString() }); return; }
    const t = row.t;
    if (d.part === 'plan') {
      if (dropOnPanel) {
        const prev = t.plannedStart;
        st.planTask(t.id, null);
        toast.show(`Unplanned “${t.title}”`, { icon: 'schedule', action: { label: 'Undo', onClick: () => st.updateTask(t.id, { plannedStart: prev }) } });
        return;
      }
      if (d.edge !== 'end') st.planTask(t.id, new Date(d.s));
      if (d.edge !== 'move') setEstimate(t, (d.e - d.s) / MIN);
      return;
    }
    if (d.part === 'act' && d.actIndex != null) {
      const a = row.acts.find(x => x.i === d.actIndex)!;
      const prev = { sessions: t.sessions, elapsedMs: t.elapsedMs, firstStartedAt: t.firstStartedAt, finishedAt: t.finishedAt, runStartedAt: t.runStartedAt };
      st.editSession(t.id, d.actIndex, new Date(d.s), a.open ? null : new Date(d.e));
      toast.show('Work time updated', { icon: 'history', action: { label: 'Undo', onClick: () => st.updateTask(t.id, prev) } });
    }
  };

  // limits for actual sessions: can't overlap the task's other sessions or go past now
  const actLimits = (t: Task, i: number) => {
    const all = workSessions(t);
    const prevEnd = i > 0 && all[i - 1].e ? new Date(all[i - 1].e!).getTime() : d0 - 7 * 24 * H;
    const nextStart = i < all.length - 1 ? new Date(all[i + 1].s).getTime() : Date.now();
    return { min: prevEnd, max: Math.min(nextStart, Date.now()) };
  };

  // ---------- dropping tasks from "To plan" ----------
  const laneRef = useRef<HTMLDivElement>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const timeAtX = (clientX: number, step = 15 * MIN) => {
    const r = laneRef.current?.getBoundingClientRect(); if (!r) return null;
    return snap(r0 + ((clientX - r.left) / hourW) * H, step);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('text/ontrack-task')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    setDropAt(timeAtX(e.clientX));
  };
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData('text/ontrack-task');
    const at = timeAtX(e.clientX);
    setDropAt(null);
    if (!id || at == null) return;
    e.preventDefault();
    st.planTask(id, new Date(Math.max(d0, Math.min(d1 - 15 * MIN, at))));
  };

  // next free slot of `len` minutes on this day (after now when it's today)
  const nextFree = (lenMin: number) => {
    const busy: [number, number][] = [];
    st.blocks.forEach(b => busy.push([new Date(b.startAt).getTime(), new Date(b.endAt).getTime()]));
    tasks.forEach(t => { const r = plannedRange(t); if (r) busy.push([r[0].getTime(), r[1].getTime()]); });
    busy.sort((a, b) => a[0] - b[0]);
    let s = Math.max(ws, isToday ? Math.ceil(now / (15 * MIN)) * 15 * MIN : ws);
    for (const [a, b] of busy) { if (s + lenMin * MIN <= a) break; if (b > s) s = b; }
    return Math.min(s, d1 - lenMin * MIN);
  };
  const planNext = (t: Task) => st.planTask(t.id, new Date(nextFree(totalEstimateMin(t) || PLAN_DEFAULT_MIN)));

  // ---------- blocks ----------
  const [editor, setEditor] = useState<{ anchor: HTMLElement | { x: number; y: number }; block?: TimeBlock; start: number; end: number } | null>(null);
  const newBlockAt = (anchor: HTMLElement | { x: number; y: number }, at?: number) => {
    const s = at ?? nextFree(30);
    setEditor({ anchor, start: s, end: s + 30 * MIN });
  };

  const goDay = (n: number) => setDay(isoDate(addDays(parseDate(day), n)));
  const hourLabel = (h: number) => { const x = h % 24; return x === 0 ? '12 am' : x < 12 ? `${x} am` : x === 12 ? '12 pm' : `${x - 12} pm`; };

  // live geometry for a bar (drag override)
  const live = (key: string, part: Drag['part'], s: number, e: number, actIndex?: number) =>
    drag && drag.key === key && drag.part === part && (part !== 'act' || drag.actIndex === actIndex) && drag.moved ? [drag.s, drag.e] : [s, e];

  return (
    <div className="tl-page col gap-12">
      <div className="tl-toolbar">
        <div className="row gap-4">
          <IBtn icon="chevLeft" label="Previous day" onClick={() => goDay(-1)} />
          {!isToday && <Btn kind="tonal" onClick={() => setDay(today)}>Today</Btn>}
          <IBtn icon="chevRight" label="Next day" onClick={() => goDay(1)} />
          <span className="t-tm" style={{ paddingLeft: 6 }}>{fmtDayLong(parseDate(day))}</span>
        </div>
        <span className="grow" />
        <div className="tl-sum t-bs c-muted">
          {mode !== 'actual' && <span data-tip="Planned task time"><i className="sw plan" />Planned {fmtMin(sum.plan / MIN)}</span>}
          {mode !== 'plan' && <span data-tip="Time on the timer"><i className="sw act" />Worked {fmtMin(sum.work / MIN)}</span>}
          {sum.blocks > 0 && <span data-tip="Meetings, lunch and breaks"><i className="sw blk" />Meetings & breaks {fmtMin(sum.blocks / MIN)}</span>}
        </div>
        <Seg value={mode} onChange={v => st.updateSettings({ timelineMode: v })} items={[{ value: 'plan', label: 'Plan' }, { value: 'actual', label: 'Actual' }, { value: 'both', label: 'Both' }]} />
        <Btn kind="tonal" icon="add" onClick={e => newBlockAt(e.currentTarget as HTMLElement)}>Meeting or break</Btn>
      </div>

      <div className="tl-layout">
        {/* tasks waiting for a slot */}
        <div ref={panelRef} className={cx('tl-panel', overPanel && 'drop')} aria-label="To plan">
          <div className="row gap-8" style={{ padding: '4px 4px 6px 8px' }}>
            <span className="t-ts grow">To plan</span>
            {toPlan.length > 0 && <span className="t-bs c-muted">{toPlan.length}</span>}
          </div>
          {overPanel && <div className="tl-panel-hint t-bs">Drop to unplan</div>}
          {toPlan.length === 0 && !overPanel && (
            <div className="t-bs c-muted" style={{ padding: '4px 8px 8px' }}>
              {isToday ? 'Everything in My Day has a time. Add a task below to plan more.' : 'Nothing due this day.'}
            </div>
          )}
          {toPlan.map(t => (
            <div key={t.id} className="tl-chip" draggable
              onDragStart={e => { e.dataTransfer.setData('text/ontrack-task', t.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => setDropAt(null)} data-tip="Drag onto the timeline">
              <Icon name="drag" size={18} className="c-muted" />
              <button className="col grow" style={{ minWidth: 0, textAlign: 'left' }} onClick={() => ui.openTask(t.id)}>
                <span className="t-bm ellipsis">{t.title || 'Untitled task'}</span>
                <span className="t-bs c-muted">{t.estimateMin ? fmtMin(totalEstimateMin(t)) : 'No estimate'}{t.runStartedAt ? ' · running' : ''}</span>
              </button>
              <IBtn sm icon="schedule" label="Plan in the next free slot" onClick={() => planNext(t)} />
            </div>
          ))}
        </div>

        {/* the timeline */}
        <div ref={wrapRef} className="tl card" style={{ '--hw': hourW + 'px', '--label-w': labelW + 'px' } as React.CSSProperties}>
          <div className="tl-scroll" ref={scrollRef}>
            <div className="tl-grid" style={{ width: labelW + laneW }}>
              <div className="tl-head">
                <div className="tl-corner t-bs c-muted">{rows.length ? `${rows.length} ${rows.length === 1 ? 'item' : 'items'}` : ''}</div>
                <div className="tl-hours" style={{ width: laneW }}>
                  {Array.from({ length: hours }, (_, i) => {
                    const h = startH + i;
                    const worked = sum.perHour[h] ?? 0;
                    return (
                      <div key={h} className="tl-hour" style={{ width: hourW }} data-tip={mode !== 'plan' && worked > 0 ? `${fmtMin(worked / MIN)} worked ${hourLabel(h)}–${hourLabel(h + 1)}` : undefined}>
                        <span className="t-bs">{hourLabel(h)}</span>
                        {mode !== 'plan' && <span className="tl-heat"><i style={{ width: `${Math.min(100, (worked / H) * 100)}%` }} /></span>}
                      </div>
                    );
                  })}
                  {isToday && now >= r0 && now <= r1 && <span className="tl-now-dot" style={{ left: X(now) }} />}
                </div>
              </div>

              <div className="tl-body" onDragOver={onDragOver} onDragLeave={() => setDropAt(null)} onDrop={onDrop}>
                {/* shading, now line, drop marker */}
                <div ref={laneRef} className="tl-overlay" style={{ left: labelW, width: laneW }}>
                  {ws > r0 && <i className="tl-off" style={{ left: 0, width: X(ws) }} />}
                  {we < r1 && <i className="tl-off" style={{ left: X(we), right: 0 }} />}
                  {isToday && now >= r0 && now <= r1 && <i className="tl-now" style={{ left: X(now) }} />}
                  {dropAt != null && <i className="tl-drop" style={{ left: X(dropAt) }}><span className="t-ll">{fmtClock(new Date(dropAt))}</span></i>}
                </div>

                {rows.length === 0 && (
                  <div className="tl-empty t-bm c-muted" style={{ marginLeft: phone ? 0 : labelW }}>
                    {mode === 'actual' ? 'No timer time on this day yet.' : 'Nothing planned yet. Drag a task from “To plan”, or add a meeting or break.'}
                  </div>
                )}

                {rows.map(r => r.type === 'task'
                  ? <TaskLane key={r.key} r={r} mode={mode} rowH={rowH} X={X} now={now} live={live} drag={drag}
                      onPlanDown={(e, edge) => r.plan && begin(e, { key: r.key, part: 'plan', edge, s0: r.plan[0], e0: r.plan[1], min: d0, max: d1 })}
                      onActDown={(e, a, edge) => { const lim = actLimits(r.t, a.i); begin(e, { key: r.key, part: 'act', edge, actIndex: a.i, s0: a.s, e0: a.e, min: lim.min, max: lim.max }); }}
                      onMove={move} onUp={e => end(e, () => ui.openTask(r.t.id))} onOpen={() => ui.openTask(r.t.id)} />
                  : <BlockLane key={r.key} r={r} rowH={rowH} X={X} live={live}
                      onDown={(e, edge) => begin(e, { key: r.key, part: 'block', edge, s0: r.s, e0: r.e, min: d0, max: d1 })}
                      onMove={move} onUp={(e, el) => end(e, () => setEditor({ anchor: el, block: r.b, start: r.s, end: r.e }))}
                      onOpen={el => setEditor({ anchor: el, block: r.b, start: r.s, end: r.e })} />)}

                {/* click anywhere on this lane to add a meeting or break at that time */}
                <div className="tl-row add" style={{ height: 40 }}>
                  <div className="tl-label"><Icon name="add" size={18} /><span className="t-bs">Add a meeting or break</span></div>
                  <div className="tl-lane" style={{ width: laneW }} onClick={e => newBlockAt({ x: e.clientX, y: e.clientY }, timeAtX(e.clientX) ?? undefined)} data-tip="Click to add at this time" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editor && <BlockEditor day={day} {...editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

// ---------- one task row ----------
function TaskLane({ r, mode, rowH, X, now, live, drag, onPlanDown, onActDown, onMove, onUp, onOpen }: {
  r: Extract<RowT, { type: 'task' }>; mode: Mode; rowH: number; X: (ms: number) => number; now: number;
  live: (key: string, part: Drag['part'], s: number, e: number, i?: number) => number[]; drag: Drag | null;
  onPlanDown: (e: React.PointerEvent, edge: Drag['edge']) => void;
  onActDown: (e: React.PointerEvent, a: Act, edge: Drag['edge']) => void;
  onMove: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void; onOpen: () => void;
}) {
  const st = useStore();
  const { t } = r;
  const done = isDone(t);
  const p = st.projectById(t.projectId);
  const over = !!t.estimateMin && elapsed(t, now) > totalEstimateMin(t) * MIN;
  const both = mode === 'both';
  const planBox = both ? { top: 6, height: 20 } : { top: 6, height: rowH - 12 };
  const actBox = both ? { top: 28, height: 20 } : { top: 6, height: rowH - 12 };
  const worked = r.acts.reduce((a, x) => a + (x.e - x.s), 0);
  const sub = [
    r.plan ? `Plan ${fmtClock(new Date(r.plan[0]))}` : null,
    r.acts.length ? `Worked ${fmtMin(worked / MIN)}` : null,
  ].filter(Boolean).join(' · ');
  const handlers = { onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };
  const active = drag?.key === r.key;
  return (
    <div className={cx('tl-row', active && 'active')} style={{ height: rowH }}>
      <button className="tl-label state" onClick={onOpen}>
        <Icon name={done ? 'checkCircle' : t.runStartedAt ? 'play' : 'circle'} size={18} style={{ color: done || t.runStartedAt ? 'var(--primary)' : 'var(--outline)' }} />
        <span className="col" style={{ minWidth: 0 }}>
          <span className={cx('t-bm ellipsis', done && 'c-muted')} style={{ textDecoration: done ? 'line-through' : undefined }}>{t.title || 'Untitled task'}</span>
          <span className="t-bs c-muted ellipsis">{p && !p.isInbox ? `${p.emoji} ${p.name}` : sub}{p && !p.isInbox && sub ? ` · ${sub}` : ''}</span>
        </span>
      </button>
      <div className="tl-lane">
        {r.plan && mode !== 'actual' && (() => {
          const [s, e] = live(r.key, 'plan', r.plan[0], r.plan[1]);
          const noEst = !t.estimateMin;
          const text = <>{fmtClock(new Date(s))} – {fmtClock(new Date(e))} · {noEst ? 'no estimate' : fmtMin((e - s) / MIN)}</>;
          const narrow = X(e) - X(s) < FIT;
          return (<>
            <div className={cx('tl-bar plan', noEst && 'no-est', done && 'done')} style={{ left: X(s), width: Math.max(6, X(e) - X(s)), ...planBox }}
              role="button" tabIndex={0} onKeyDown={k => { if (k.key === 'Enter') onOpen(); }}
              data-tip={`Planned ${fmtClock(new Date(s))} – ${fmtClock(new Date(e))}${noEst ? ' · no estimate yet: stretch to set one' : ''}`}
              onPointerDown={e => onPlanDown(e, 'move')} {...handlers}>
              <span className="h start" onPointerDown={e => onPlanDown(e, 'start')} />
              {!narrow && <span className="lbl">{text}</span>}
              <span className="h end" onPointerDown={e => onPlanDown(e, 'end')} />
            </div>
            <Out show={narrow} left={X(e)} {...planBox}>{text}</Out>
          </>);
        })()}
        {mode !== 'plan' && r.acts.map(a => {
          const [s, e] = live(r.key, 'act', a.s, a.e, a.i);
          const text = <>{fmtClock(new Date(s))} – {a.open ? 'now' : fmtClock(new Date(e))} · {fmtMin((e - s) / MIN)}</>;
          const narrow = X(e) - X(s) < FIT;
          const last = a.i === Math.max(...r.acts.map(x => x.i));
          return (<Fragment key={a.i}>
            <div className={cx('tl-bar act', over && 'over', a.open && 'live')} style={{ left: X(s), width: Math.max(4, X(e) - X(s)), ...actBox }}
              role="button" tabIndex={0} onKeyDown={k => { if (k.key === 'Enter') onOpen(); }}
              data-tip={`Worked ${fmtClock(new Date(s))} – ${a.open ? 'now' : fmtClock(new Date(e))} · ${fmtMin((e - s) / MIN)}${a.open ? '' : ' · drag the edges to fix the times'}`}
              onPointerDown={ev => (a.open ? onOpen() : onActDown(ev, a, 'move'))} {...handlers}>
              <span className="h start" onPointerDown={ev => onActDown(ev, a, 'start')} />
              {!narrow && <span className="lbl">{text}</span>}
              {!a.open && <span className="h end" onPointerDown={ev => onActDown(ev, a, 'end')} />}
            </div>
            <Out show={narrow && last} left={X(e)} {...actBox}>{text}</Out>
          </Fragment>);
        })}
      </div>
    </div>
  );
}

// ---------- one meeting / break row ----------
function BlockLane({ r, rowH, X, live, onDown, onMove, onUp, onOpen }: {
  r: Extract<RowT, { type: 'block' }>; rowH: number; X: (ms: number) => number;
  live: (key: string, part: Drag['part'], s: number, e: number) => number[];
  onDown: (e: React.PointerEvent, edge: Drag['edge']) => void; onMove: (e: React.PointerEvent) => void;
  onUp: (e: React.PointerEvent, el: HTMLElement) => void; onOpen: (el: HTMLElement) => void;
}) {
  const k = kindOf(r.b.kind);
  const [s, e] = live(r.key, 'block', r.s, r.e);
  const title = r.b.title || k.label;
  const narrow = X(e) - X(s) < FIT;
  return (
    <div className="tl-row" style={{ height: rowH }}>
      <button className="tl-label state" onClick={ev => onOpen(ev.currentTarget)}>
        <Icon name={k.icon} size={18} className={'blk-ic ' + r.b.kind} />
        <span className="col" style={{ minWidth: 0 }}>
          <span className="t-bm ellipsis">{title}</span>
          <span className="t-bs c-muted ellipsis">{k.label} · {fmtClock(new Date(r.s))} – {fmtClock(new Date(r.e))}</span>
        </span>
      </button>
      <div className="tl-lane">
        <div className={cx('tl-bar blk', r.b.kind)} style={{ left: X(s), width: Math.max(6, X(e) - X(s)), top: 6, height: rowH - 12 }}
          role="button" tabIndex={0} onKeyDown={ev => { if (ev.key === 'Enter') onOpen(ev.currentTarget as HTMLElement); }}
          data-tip={`${title} · ${fmtClock(new Date(s))} – ${fmtClock(new Date(e))}`}
          onPointerDown={ev => onDown(ev, 'move')} onPointerMove={onMove}
          onPointerUp={ev => onUp(ev, ev.currentTarget as HTMLElement)} onPointerCancel={ev => onUp(ev, ev.currentTarget as HTMLElement)}>
          <span className="h start" onPointerDown={ev => onDown(ev, 'start')} />
          <Icon name={k.icon} size={16} />
          {!narrow && <span className="lbl">{title} · {fmtMin((e - s) / MIN)}</span>}
          <span className="h end" onPointerDown={ev => onDown(ev, 'end')} />
        </div>
        <Out show={narrow} left={X(e)} top={6} height={rowH - 12}>{title} · {fmtMin((e - s) / MIN)}</Out>
      </div>
    </div>
  );
}

// ---------- add / edit a meeting or break ----------
function BlockEditor({ day, anchor, block, start, end, onClose }: {
  day: string; anchor: HTMLElement | { x: number; y: number }; block?: TimeBlock; start: number; end: number; onClose: () => void;
}) {
  const st = useStore();
  const toast = useToast();
  const [title, setTitle] = useState(block?.title ?? '');
  const [kind, setKind] = useState<BlockKind>(block?.kind ?? 'meeting');
  const [s, setS] = useState(hhmm(new Date(start)));
  const [e, setE] = useState(hhmm(new Date(end)));
  const base = block ? isoDate(new Date(block.startAt)) : day;
  const sd = atTime(base, s), ed0 = atTime(base, e);
  const ed = ed0 <= sd ? new Date(ed0.getTime() + 24 * H) : ed0; // an end before the start means past midnight
  const len = (ed.getTime() - sd.getTime()) / MIN;
  const invalid = len < 5 || len > 16 * 60;
  const save = () => {
    if (invalid) return;
    const patch = { title: title.trim(), kind, startAt: sd.toISOString(), endAt: ed.toISOString() };
    if (block) st.updateBlock(block.id, patch); else st.addBlock(patch);
    onClose();
  };
  const remove = () => {
    if (!block) return;
    const undo = st.removeBlock(block.id);
    toast.show(`Deleted “${block.title || kindOf(block.kind).label}”`, { icon: 'trash', action: { label: 'Undo', onClick: undo } });
    onClose();
  };
  const toTask = () => {
    if (!block) return;
    const t = st.addTask({ title: title.trim() || kindOf(kind).label, estimateMin: Math.round(len), dueDate: base, myDayDate: base <= todayISO() ? todayISO() : null });
    st.planTask(t.id, sd);
    st.removeBlock(block.id);
    toast.show('Turned into a task and planned at the same time', { icon: 'checkCircle' });
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} placement="below-start">
      <div className="menu" style={{ width: 340, padding: 16, gap: 12 }} onKeyDown={k => { if (k.key === 'Enter' && (k.target as HTMLElement).tagName === 'INPUT') save(); }}>
        <span className="t-ts">{block ? 'Edit' : 'Add a meeting or break'}</span>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          {KINDS.map(k => <Chip key={k.kind} icon={k.icon} sel={kind === k.kind} onClick={() => setKind(k.kind)}>{k.label}</Chip>)}
        </div>
        <Field label="Title" value={title} onChange={setTitle} placeholder={kindOf(kind).label} autoFocus bg="var(--surface-container)" />
        <div className="row gap-8" style={{ alignItems: 'center' }}>
          <TimeInput value={s} onChange={setS} label="Start" />
          <span className="c-muted">–</span>
          <TimeInput value={e} onChange={setE} label="End" />
        </div>
        <span className={cx('t-bs', invalid ? 'c-error' : 'c-muted')}>{invalid ? 'Make it between 5 minutes and 16 hours.' : `${fmtMin(len)}${isoDate(ed) !== base ? ' · ends the next day' : ''}`}</span>
        <div className="dialog-actions" style={{ flexWrap: 'wrap', gap: 4 }}>
          {block && <IBtn icon="trash" label="Delete" onClick={remove} />}
          {block && <Btn kind="text" onClick={toTask}>Make it a task</Btn>}
          <span className="spacer" />
          <Btn kind="text" onClick={onClose}>Cancel</Btn>
          <Btn disabled={invalid} onClick={save}>{block ? 'Save' : 'Add'}</Btn>
        </div>
      </div>
    </Popover>
  );
}
