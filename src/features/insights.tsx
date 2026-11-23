import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../ui/Icon';
import { Btn, MenuList, Popover, cx, useAnchor, Empty } from '../ui/kit';
import { Calendar } from '../ui/pickers';
import { SampleBanner } from './common';
import { hideSample, insights, overrunByProject, rangeFor, realTasks, type InsightRange } from '../lib/select';
import { METRICS, buildDays, compare, findPatterns, fmtY, yLabel, type YRef } from '../lib/patterns';
import { useNavigate } from 'react-router-dom';
import { fmtDayShort, fmtMin, fmtMonDay, todayISO } from '../lib/time';
import { TYPE_LABEL } from '../lib/trackers';

const RANGES: Record<string, string> = { '7': 'Last 7 days', '14': 'Last 14 days', '30': 'Last 30 days', month: 'This month', custom: 'Custom range' };

export function InsightsPage() {
  const st = useStore();
  const [kind, setKind] = useState('30');
  const [tab, setTab] = useState<'overview' | 'patterns'>('overview');
  const [custom, setCustom] = useState<[string, string] | null>(null);
  const ra = useAnchor();
  const r = rangeFor(kind, custom ?? undefined);
  const tasks = useMemo(() => realTasks(st.tasks), [st.tasks]);
  const data = useMemo(() => insights(tasks, st.settings, r), [tasks, st.settings, r.from, r.to]);
  const byProj = useMemo(() => overrunByProject(tasks, st.projects, r), [tasks, st.projects, r.from, r.to]);
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
      {st.hasSample && (hideSample(st.tasks)
        ? <span className="t-bs c-muted row gap-6"><Icon name="info" size={16} />Sample data is left out now that you have your own finished tasks.</span>
        : <SampleBanner />)}
      <div className="tabs" role="tablist">
        {(['overview', 'patterns'] as const).map(k => <button key={k} role="tab" aria-selected={tab === k} className={cx('tab state', tab === k && 'on')} onClick={() => setTab(k)}>{k === 'overview' ? 'Overview' : 'Patterns'}</button>)}
      </div>
      {tab === 'patterns' ? <Patterns r={r} periodLabel={label} /> : !data.list.length ? (
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
                    <div key={b.from} className={cx('bar', b.pct == null && 'none', b.pct === 0 && 'zero')} style={{ height: b.pct == null ? 0 : b.pct === 0 ? 4 : `${Math.max(2, b.pct)}%`, zIndex: 1 }}
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

// ---------- Patterns (J09 / J10) ----------
function Patterns({ r, periodLabel }: { r: InsightRange; periodLabel: string }) {
  const st = useStore();
  const nav = useNavigate();
  const trackers = st.settings.trackers;
  const active = trackers.filter(t => !t.archived);
  const ds = useMemo(() => buildDays(r, st.tasks, st.entries, st.checkins), [r.from, r.to, st.tasks, st.entries, st.checkins]);
  const patterns = useMemo(() => findPatterns(ds, trackers, st.settings), [ds, trackers, st.settings]);
  const [xId, setXId] = useState<string | null>(null);
  const [y, setY] = useState<YRef>({ kind: 'metric', id: 'within' });
  const xa = useAnchor(), ya = useAnchor();
  const x = active.find(t => t.id === xId) ?? active.find(t => t.askOn === 'checkin') ?? active[0];
  if (!x) return <Empty icon="insights" title="No trackers yet" body="Add trackers like sleep or energy, then Patterns shows how they line up with your estimates." action={<Btn onClick={() => nav('/settings/trackers')}>Add trackers</Btn>} />;
  const res = compare(x, y, ds, trackers, st.settings);
  const max = Math.max(1, ...res.bars.map(b => b.value ?? 0));
  const yl = yLabel(y, trackers);
  const chartTitle = `${y.kind === 'metric' && y.id === 'within' ? 'Within estimate' : yl}, by ${x.name.toLowerCase()}`;
  const chartSub = y.kind === 'metric' && y.id === 'within'
    ? `Share of finished tasks that came in at or under their original estimate, grouped by ${x.askOn === 'checkin' && /sleep|bed/i.test(x.name) ? `how you slept the night before` : x.name.toLowerCase()}.`
    : `${yl} on days grouped by ${x.name.toLowerCase()}.`;
  const yIcon = y.kind === 'metric' ? METRICS.find(m => m.id === y.id)!.icon : trackers.find(t => t.id === y.id)?.icon ?? 'bar';
  return (
    <>
      <div className="card col gap-16" style={{ padding: '20px 24px' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="t-bm c-muted">Compare</span>
          <button className={cx('select-btn outlined state', xa.isOpen && 'active')} onClick={e => xa.open(e)}><Icon name={x.icon} />{x.name}<Icon name="chevDown" /></button>
          <span className="t-bm c-muted">with</span>
          <button className={cx('select-btn outlined state', ya.isOpen && 'active')} onClick={e => ya.open(e)}><Icon name={yIcon} />{yl}<Icon name="chevDown" /></button>
          <span className="grow" />
          <span className="vpill"><Icon name="event" />{res.n} {res.n === 1 ? 'day' : 'days'} with both logged</span>
        </div>
        <div className="col gap-2"><span className="t-tm">{chartTitle}</span><span className="t-bs c-muted">{chartSub}</span></div>
        {res.n === 0 ? <div className="t-bm c-muted" style={{ padding: '24px 0' }}>Not enough days with both logged in {periodLabel.toLowerCase()} yet. Keep checking in and it fills up.</div> : (
          <div className="row gap-16" style={{ alignItems: 'flex-end', paddingTop: 8 }}>
            {res.bars.map(b => (
              <div key={b.label} className="col grow" style={{ flexBasis: 0, gap: 6, alignItems: 'center', minWidth: 0 }} data-tip={`${b.label} · ${fmtY(y, b.value, trackers)} · ${b.days} ${b.days === 1 ? 'day' : 'days'}`}>
                <span className="t-tm" style={{ color: b.worst ? 'var(--tertiary)' : undefined }}>{fmtY(y, b.value, trackers)}</span>
                <div style={{ width: '100%', height: b.value == null ? 2 : Math.max(6, (b.value / max) * 140), borderRadius: b.value == null ? 0 : 8, background: b.value == null ? 'var(--outline-variant)' : b.worst ? 'var(--tertiary)' : 'var(--primary)', opacity: b.thin ? 0.55 : 1 }} />
                <span className="t-ts ellipsis" style={{ maxWidth: '100%' }}>{b.label}</span>
                <span className="t-bs" style={{ color: b.thin ? 'var(--tertiary)' : 'var(--on-surface-variant)' }}>{b.days} {b.days === 1 ? 'day' : 'days'}</span>
              </div>
            ))}
          </div>
        )}
        {res.n > 0 && (
          <div className="row gap-12" style={{ alignItems: 'flex-start', background: 'var(--primary-container)', color: 'var(--on-primary-container)', borderRadius: 12, padding: '12px 16px 12px 14px' }}>
            <Icon name="lightbulb" />
            <div className="col gap-2">{res.finding && <span className="t-ts">{res.finding}</span>}<span className="t-bs">{res.caveat}</span></div>
          </div>
        )}
      </div>
      <div className="card col" style={{ padding: '20px 24px 12px' }}>
        <div className="col gap-2" style={{ paddingBottom: 4 }}><span className="t-tm">Patterns we found</span><span className="t-bs c-muted">Checked across all your trackers and task results, {periodLabel.toLowerCase()}. Strongest first.</span></div>
        {!patterns.length && <span className="t-bm c-muted" style={{ padding: '16px 0' }}>Nothing stands out yet. Patterns appear after about a week of check-ins.</span>}
        {patterns.map((p, i) => (
          <div key={i} className="row" style={{ gap: 14, padding: '14px 0', borderTop: i ? '1px solid var(--outline-variant)' : undefined }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', flex: 'none' }}><Icon name={p.x.icon} /></span>
            <div className="col gap-2 grow"><span className="t-ts">{p.text}</span><span className="t-bs c-muted">{p.sub}</span></div>
            <span className="vpill" style={p.strength === 'Strong' ? { background: 'var(--primary-container)', color: 'var(--on-primary-container)' } : p.strength === 'Moderate' ? { background: 'var(--secondary-container)', color: 'var(--on-secondary-container)' } : undefined}>{p.strength}</span>
            <Btn kind="text" onClick={() => { setXId(p.x.id); setY(p.y); document.querySelector('.main')?.scrollTo({ top: 0, behavior: 'smooth' }); }}>Compare</Btn>
          </div>
        ))}
      </div>
      {xa.isOpen && <Popover anchor={xa.el} onClose={xa.close}><MenuList width={300} onClose={xa.close} items={[{ label: 'Your trackers' }, ...active.map(t => ({ t: t.name, ic: t.icon, sel: t.id === x.id, sup: t.askOn === 'checkin' ? 'Check-in' : 'Entries', onClick: () => setXId(t.id) }))]} /></Popover>}
      {ya.isOpen && <Popover anchor={ya.el} onClose={ya.close}><MenuList width={320} onClose={ya.close} items={[
        { label: 'From your tasks' },
        ...METRICS.map(m => ({ t: m.label, ic: m.icon, sel: y.kind === 'metric' && y.id === m.id, onClick: () => setY({ kind: 'metric', id: m.id }) })),
        { divider: true }, { label: 'Your trackers' },
        ...active.filter(t => t.id !== x.id && t.type !== 'group').map(t => ({ t: t.name, ic: t.icon, sup: TYPE_LABEL[t.type], sel: y.kind === 'tracker' && y.id === t.id, onClick: () => setY({ kind: 'tracker', id: t.id }) })),
      ]} /></Popover>}
    </>
  );
}
