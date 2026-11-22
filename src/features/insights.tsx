import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../ui/Icon';
import { Btn, MenuList, Popover, cx, useAnchor, Empty } from '../ui/kit';
import { Calendar } from '../ui/pickers';
import { insights, overrunByProject, rangeFor } from '../lib/select';
import { fmtDayShort, fmtMin, fmtMonDay, todayISO } from '../lib/time';

const RANGES: Record<string, string> = { '7': 'Last 7 days', '14': 'Last 14 days', '30': 'Last 30 days', month: 'This month', custom: 'Custom range' };

export function InsightsPage() {
  const st = useStore();
  const [kind, setKind] = useState('30');
  const [custom, setCustom] = useState<[string, string] | null>(null);
  const ra = useAnchor();
  const r = rangeFor(kind, custom ?? undefined);
  const data = useMemo(() => insights(st.tasks, st.settings, r), [st.tasks, st.settings, r.from, r.to]);
  const byProj = useMemo(() => overrunByProject(st.tasks, st.projects, r), [st.tasks, st.projects, r.from, r.to]);
  const label = kind === 'custom' && custom ? `${fmtMonDay(custom[0])} – ${fmtMonDay(custom[1])}` : RANGES[kind];
  const periodWord = kind === 'month' ? 'this month' : kind === 'custom' ? 'in this range' : `over the last ${r.days} days`;
  const delta = data.pct != null && data.prevPct != null ? data.pct - data.prevPct : null;
  const maxProj = Math.max(10, ...byProj.map(x => Math.abs(x.over ?? 0)));
  const maxLen = Math.max(10, ...data.bucketLen.map(x => x.over ?? 0));
  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">Insights</span><span className="t-bm c-muted">How well your estimates hold up</span></div>
        <div className="actions"><button className={cx('select-btn outlined state', ra.isOpen && 'active')} onClick={e => ra.open(e)}><Icon name="calendar" />{label}<Icon name="chevDown" /></button></div>
      </div>
      {!data.list.length ? (
        <Empty icon="insights" title="No finished tasks in this range yet" body="Give tasks an estimate, run the timer and tick them off. Insights shows how often you finish within your estimate." />
      ) : (
        <>
          {data.avgOver > 0 && (
            <div className="row gap-16" style={{ background: 'var(--tertiary-container)', color: 'var(--on-tertiary-container)', borderRadius: 16, padding: '16px 20px' }}>
              <Icon name="lightbulb" /><span className="t-bm">{periodWord[0].toUpperCase() + periodWord.slice(1)} you usually run about {fmtMin(data.avgOver)} over. Try adding {fmtMin(Math.ceil(data.avgOver / 5) * 5)} when you set an estimate.</span>
            </div>
          )}
          <div className="row gap-16" style={{ alignItems: 'stretch' }}>
            <div className="stat"><span className="t-bm c-muted">Within estimate</span><span className="t-hm">{data.pct ?? '—'}%</span><span className={cx('t-bs', delta == null ? 'c-muted' : delta >= 0 ? 'c-ok' : 'c-error')}>{delta == null ? `${data.within} of ${data.list.length} tasks` : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs previous ${r.days} days`}</span></div>
            <div className="stat"><span className="t-bm c-muted">Average overrun</span><span className="t-hm">{data.avgOver ? '+' + fmtMin(data.avgOver) : '0m'}</span><span className="t-bs c-muted">on the {data.overCount} {data.overCount === 1 ? 'task' : 'tasks'} that ran over</span></div>
            <div className="stat"><span className="t-bm c-muted">Streak within estimate</span><span className="t-hm">{data.streak} {data.streak === 1 ? 'day' : 'days'}</span><span className="t-bs c-muted">Best: {data.best} {data.best === 1 ? 'day' : 'days'}</span></div>
            <div className="stat"><span className="t-bm c-muted">Due dates met</span><span className="t-hm">{data.duePct ?? '—'}{data.duePct != null && '%'}</span><span className="t-bs c-muted">of tasks with a due date</span></div>
          </div>
          <div className="card col gap-16" style={{ padding: 20 }}>
            <div className="col gap-2"><span className="t-tm">Within estimate, by {data.byWeek ? 'week' : 'day'}</span><span className="t-bs c-muted">Share of finished tasks that came in at or under their estimate</span></div>
            <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
              <div className="col t-bs c-muted" style={{ width: 40, height: 188, justifyContent: 'space-between', alignItems: 'flex-end' }}><span>100%</span><span>50%</span><span>0%</span></div>
              <div className="col gap-8 grow">
                <div className="bars">
                  <div className="grid-lines"><i /><i /><i /></div>
                  {data.buckets.map(b => (
                    <div key={b.from} className={cx('bar', b.pct == null && 'none')} style={{ height: b.pct == null ? 0 : `${Math.max(2, b.pct)}%`, zIndex: 1 }}
                      data-tip={b.pct == null ? `${fmtDayShort(b.from)} · no finished tasks` : `${data.byWeek ? 'Week of ' : ''}${fmtDayShort(b.from)} · ${b.pct}% (${b.within} of ${b.n})`} />
                  ))}
                </div>
                <div className="row t-bs c-muted" style={{ justifyContent: 'space-between' }}>
                  {[0, Math.floor(data.buckets.length / 4), Math.floor(data.buckets.length / 2), Math.floor((3 * data.buckets.length) / 4), data.buckets.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => <span key={i}>{fmtMonDay(data.buckets[i].from)}</span>)}
                </div>
              </div>
            </div>
          </div>
          <div className="row gap-16" style={{ alignItems: 'flex-start' }}>
            <div className="card col gap-8 grow" style={{ padding: 20, flexBasis: 0 }}>
              <div className="col gap-2" style={{ paddingBottom: 8 }}><span className="t-tm">Average overrun by project</span><span className="t-bs c-muted">Minutes over estimate, on average</span></div>
              {byProj.map(({ p, over }) => (
                <div key={p.id} className="row gap-16" style={{ height: 40 }}>
                  <span className="row gap-8" style={{ width: 200 }}><span className="emoji">{p.emoji}</span><span className="t-bm ellipsis">{p.name}</span></span>
                  <div className="hbar-track"><i style={{ width: `${Math.max(3, (Math.max(0, over ?? 0) / maxProj) * 100)}%`, background: (over ?? 0) > 0 ? 'var(--warning)' : 'var(--success)' }} /></div>
                  <span className="t-ll" style={{ width: 120, textAlign: 'right' }}>{(over ?? 0) > 0 ? `+${fmtMin(over!)}` : 'Within estimate'}</span>
                </div>
              ))}
            </div>
            <div className="card col gap-8 grow" style={{ padding: 20, flexBasis: 0 }}>
              <div className="col gap-2" style={{ paddingBottom: 8 }}><span className="t-tm">By task length</span><span className="t-bs c-muted">Where your estimates slip most</span></div>
              {data.bucketLen.map(b => (
                <div key={b.label} className="row gap-16" style={{ height: 40 }}>
                  <span className="t-bm" style={{ width: 200 }}>{b.label}</span>
                  <div className="hbar-track"><i style={{ width: b.over == null ? 0 : `${Math.max(3, (b.over / maxLen) * 100)}%` }} /></div>
                  <span className="t-ll" style={{ width: 120, textAlign: 'right' }}>{b.over == null ? <span className="c-faint">No tasks</span> : b.over ? `+${fmtMin(b.over)}` : 'Within estimate'}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {ra.isOpen && <RangeMenu anchor={ra.el} onClose={ra.close} kind={kind} custom={custom} onApply={(k, c) => { setKind(k); setCustom(c); }} />}
    </>
  );
}

function RangeMenu({ anchor, onClose, kind, custom, onApply }: { anchor: HTMLElement | null; onClose: () => void; kind: string; custom: [string, string] | null; onApply: (k: string, c: [string, string] | null) => void }) {
  const [k, setK] = useState(kind);
  const init = rangeFor(kind, custom ?? undefined);
  const [range, setRange] = useState<[string, string | null]>([init.from, init.to]);
  const [picking, setPicking] = useState(false);
  return (
    <Popover anchor={anchor} onClose={onClose} placement="below-end">
      <div className="menu" style={{ width: 360 }}>
        <MenuList items={Object.entries(RANGES).map(([key, t]) => ({
          t, sel: k === key, ic: key === 'custom' ? 'event' : undefined, keepOpen: true,
          onClick: () => { setK(key); if (key === 'custom') setPicking(true); else { setPicking(false); onApply(key, null); onClose(); } },
        }))} />
        {k === 'custom' && (
          <div className="col gap-8" style={{ padding: '0 16px 8px' }}>
            <div className="divider" />
            {picking && <Calendar range={[range[0], range[1]]} maxDate={todayISO()} onPick={iso => { if (!range[0] || range[1]) setRange([iso, null]); else setRange(iso < range[0] ? [iso, range[0]] : [range[0], iso]); }} />}
            <div className="row gap-8"><button className="select-btn outlined state" onClick={() => setPicking(true)}>{fmtMonDay(range[0])}</button><span className="c-muted">→</span><button className="select-btn outlined state" onClick={() => setPicking(true)}>{range[1] ? fmtMonDay(range[1]) : 'Pick end'}</button></div>
            <span className="t-bs c-muted">The chart groups by day up to 31 days, by week beyond that.</span>
            <div className="row" style={{ justifyContent: 'flex-end' }}><Btn disabled={!range[1]} onClick={() => { onApply('custom', [range[0], range[1]!]); onClose(); }}>Apply</Btn></div>
          </div>
        )}
      </div>
    </Popover>
  );
}
