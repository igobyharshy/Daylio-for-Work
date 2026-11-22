import type { Entry, Settings, Task } from './types';
import type { Checkin, Tracker } from './trackers';
import { numeric } from './trackers';
import { addDays, dueAt, elapsed, fmtHHMM, fmtMin, isoDate, parseDate } from './time';
import type { InsightRange } from './select';
import type { IconName } from '../ui/Icon';

export type MetricId = 'within' | 'overrun' | 'due' | 'mistakes' | 'reest' | 'tracked';
export const METRICS: { id: MetricId; label: string; icon: IconName; higherBetter: boolean }[] = [
  { id: 'within', label: 'Within estimate %', icon: 'checkCircle', higherBetter: true },
  { id: 'overrun', label: 'Average overrun', icon: 'trendUp', higherBetter: false },
  { id: 'due', label: 'Due dates met', icon: 'flag', higherBetter: true },
  { id: 'mistakes', label: 'Mistakes logged', icon: 'warn', higherBetter: false },
  { id: 'reest', label: 'Re-estimates', icon: 'refresh', higherBetter: false },
  { id: 'tracked', label: 'Time tracked', icon: 'timer', higherBetter: true },
];
export type YRef = { kind: 'metric'; id: MetricId } | { kind: 'tracker'; id: string };

interface DayData { day: string; tasks: Task[]; entries: Entry[]; checkin?: Checkin }

function days(r: InsightRange) { const out: string[] = []; for (let i = 0; i < r.days; i++) out.push(isoDate(addDays(parseDate(r.from), i))); return out; }

export function buildDays(r: InsightRange, tasks: Task[], entries: Entry[], checkins: Checkin[]): DayData[] {
  const cMap = new Map(checkins.filter(c => !c.skipped).map(c => [c.day, c]));
  return days(r).map(day => ({
    day,
    tasks: tasks.filter(t => t.finishedAt && t.estimateMin && isoDate(new Date(t.finishedAt)) === day),
    entries: entries.filter(e => isoDate(new Date(e.whenAt)) === day),
    checkin: cMap.get(day),
  }));
}

/** X value for a day (null when not logged). Entry trackers average over that day’s entries. */
function xValue(t: Tracker, d: DayData): number | null {
  if (t.askOn === 'checkin') return numeric(t, d.checkin?.values[t.id]);
  const vals = d.entries.map(e => numeric(t, e.trackerValues[t.id])).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** pooled aggregate of a metric over a set of days */
function aggregate(y: YRef, ds: DayData[], trackers: Tracker[], s: Settings): number | null {
  if (y.kind === 'tracker') {
    const t = trackers.find(x => x.id === y.id); if (!t) return null;
    const vals = ds.map(d => xValue(t, d)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  const tasks = ds.flatMap(d => d.tasks);
  switch (y.id) {
    case 'within': return tasks.length ? (tasks.filter(t => elapsed(t) <= t.estimateMin! * 60000 + 59999).length / tasks.length) * 100 : null;
    case 'overrun': return tasks.length ? tasks.reduce((a, t) => a + Math.max(0, elapsed(t) / 60000 - t.estimateMin!), 0) / tasks.length : null;
    case 'due': { const l = tasks.filter(t => t.dueDate); return l.length ? (l.filter(t => new Date(t.finishedAt!).getTime() <= dueAt(t, s)!.getTime()).length / l.length) * 100 : null; }
    case 'mistakes': return ds.length ? ds.reduce((a, d) => a + d.entries.filter(e => e.tags.includes('Mistake')).length, 0) / ds.length : null;
    case 'reest': return ds.length ? ds.reduce((a, d) => a + d.tasks.reduce((x, t) => x + t.reEstimates.length, 0), 0) / ds.length : null;
    case 'tracked': return ds.length ? ds.reduce((a, d) => a + d.tasks.reduce((x, t) => x + elapsed(t) / 60000, 0), 0) / ds.length : null;
  }
}
function hasY(y: YRef, d: DayData, trackers: Tracker[]) {
  if (y.kind === 'tracker') { const t = trackers.find(x => x.id === y.id); return !!t && xValue(t, d) != null; }
  if (y.id === 'within' || y.id === 'overrun') return d.tasks.length > 0;
  if (y.id === 'due') return d.tasks.some(t => t.dueDate);
  return true;
}

export function fmtY(y: YRef, v: number | null, trackers: Tracker[]): string {
  if (v == null) return '—';
  if (y.kind === 'tracker') { const t = trackers.find(x => x.id === y.id); return t?.type === 'duration' ? fmtMin(v) : v.toFixed(1); }
  switch (y.id) {
    case 'within': case 'due': return `${Math.round(v)}%`;
    case 'overrun': return `+${fmtMin(v)}`;
    case 'tracked': return fmtMin(v);
    default: return v.toFixed(1);
  }
}
export const yLabel = (y: YRef, trackers: Tracker[]) => y.kind === 'metric' ? METRICS.find(m => m.id === y.id)!.label : trackers.find(t => t.id === y.id)?.name ?? '';
function yBetterHigh(y: YRef, trackers: Tracker[]) {
  if (y.kind === 'metric') return METRICS.find(m => m.id === y.id)!.higherBetter;
  const t = trackers.find(x => x.id === y.id); return !(t?.type === 'points' && t.higherIs === 'worse');
}

// ---------- buckets ----------
interface Bucket { label: string; test: (v: number) => boolean }
function bucketsFor(t: Tracker, values: number[]): Bucket[] {
  if (t.type === 'levels') return (t.levels ?? []).map((l, i) => ({ label: l, test: v => Math.round(v) === i }));
  if (t.type === 'points') {
    const lo = t.min ?? 1, hi = t.max ?? 5;
    if (hi - lo <= 5) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(p => ({ label: String(p), test: v => Math.round(v) === p }));
    const a = lo + (hi - lo) / 3, b = lo + (2 * (hi - lo)) / 3;
    return [{ label: `${lo}–${Math.floor(a)}`, test: v => v <= a }, { label: `${Math.ceil(a)}–${Math.floor(b)}`, test: v => v > a && v <= b }, { label: `${Math.ceil(b)}–${hi}`, test: v => v > b }];
  }
  if (t.type === 'count') return [{ label: '0', test: v => v < 0.5 }, { label: '1–2', test: v => v >= 0.5 && v < 2.5 }, { label: '3–4', test: v => v >= 2.5 && v < 4.5 }, { label: '5+', test: v => v >= 4.5 }];
  // duration / time: quartiles rounded to 15 min
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length < 4) return [{ label: 'All', test: () => true }];
  const q = (p: number) => Math.round(sorted[Math.floor(p * (sorted.length - 1))] / 15) * 15;
  const cuts = [...new Set([q(0.25), q(0.5), q(0.75)])];
  const fmt = (m: number) => t.type === 'duration' ? fmtMin(m) : fmtHHMM(`${String(Math.floor(((m + 18 * 60) % 1440) / 60)).padStart(2, '0')}:${String((m + 18 * 60) % 60).padStart(2, '0')}`);
  const out: Bucket[] = [];
  cuts.forEach((c, i) => out.push({ label: i === 0 ? `Before ${fmt(c)}`.replace('Before', t.type === 'duration' ? 'Under' : 'Before') : `${fmt(cuts[i - 1])}–${fmt(c)}`, test: v => (i === 0 ? v < c : v >= cuts[i - 1] && v < c) }));
  out.push({ label: `${t.type === 'duration' ? '' : 'After '}${fmt(cuts[cuts.length - 1])}${t.type === 'duration' ? '+' : ''}`, test: v => v >= cuts[cuts.length - 1] });
  return out;
}

export interface CompareResult {
  bars: { label: string; value: number | null; days: number; worst: boolean; thin: boolean }[];
  n: number; finding: string | null; caveat: string; unitDays: string;
}

export function compare(x: Tracker, y: YRef, ds: DayData[], trackers: Tracker[], s: Settings): CompareResult {
  const both = ds.filter(d => xValue(x, d) != null && hasY(y, d, trackers));
  const vals = both.map(d => xValue(x, d)!);
  let bars: CompareResult['bars'];
  if (x.type === 'group') {
    bars = (x.options ?? []).map(o => {
      const dd = ds.filter(d => d.entries.some(e => Array.isArray(e.trackerValues[x.id]) && (e.trackerValues[x.id] as string[]).includes(o)) && hasY(y, d, trackers));
      return { label: o, value: aggregate(y, dd, trackers, s), days: dd.length, worst: false, thin: dd.length < 3 };
    });
  } else {
    bars = bucketsFor(x, vals).map(b => { const dd = both.filter(d => b.test(xValue(x, d)!)); return { label: b.label, value: aggregate(y, dd, trackers, s), days: dd.length, worst: false, thin: dd.length > 0 && dd.length < 3 }; });
  }
  const scored = bars.filter(b => b.value != null && b.days > 0);
  const hb = yBetterHigh(y, trackers);
  if (scored.length > 1) { const w = scored.reduce((a, b) => ((hb ? b.value! < a.value! : b.value! > a.value!) ? b : a)); w.worst = true; }
  // finding: top half vs bottom half of an ordered X
  let finding: string | null = null;
  const ordered = x.type !== 'group' && scored.length >= 2;
  if (ordered) {
    const idx = bars.map((b, i) => (b.value != null && b.days > 0 ? i : -1)).filter(i => i >= 0);
    const half = Math.ceil(idx.length / 2);
    const lowI = idx.slice(0, Math.floor(idx.length / 2)), highI = idx.slice(half);
    const pick = (is: number[]) => both.filter(d => is.some(i => bucketsFor(x, vals)[i]?.test(xValue(x, d)!)));
    const lo = aggregate(y, pick(lowI), trackers, s), hi = aggregate(y, pick(highI), trackers, s);
    const names = (is: number[]) => is.map(i => bars[i].label).join(is.length === 2 ? ' or ' : ', ');
    if (lo != null && hi != null && lowI.length && highI.length) {
      const subject = x.askOn === 'checkin' && /sleep|bed/i.test(x.name) ? 'nights' : 'days';
      const yl = yLabel(y, trackers);
      const phrase = (v: number) => y.kind === 'metric' && y.id === 'within' ? `${Math.round(v)}% of tasks finished within estimate` : `${yl.toLowerCase()} was ${fmtY(y, v, trackers)}`;
      const sleepish = x.askOn === 'checkin' && /sleep|bed/i.test(x.name);
      if (x.type === 'levels') finding = `${sleepish ? 'After' : 'On'} ${names(highI)} ${subject}, ${phrase(hi)}. ${sleepish ? 'After' : 'On'} ${names(lowI)} ${subject}, ${phrase(lo)}.`;
      else if (x.type === 'points' || x.type === 'count') finding = `With ${x.name.toLowerCase()} at ${names(highI)}, ${phrase(hi)}. At ${names(lowI)}, ${phrase(lo)}.`;
      else finding = `${x.name} ${names(highI)}: ${phrase(hi)}. ${x.name} ${names(lowI)}: ${phrase(lo)}.`;
    }
  }
  const thin = bars.filter(b => b.thin);
  const caveat = `${thin.length ? `${thin.map(b => b.label).join(', ')} ${thin.length === 1 ? 'has' : 'have'} only ${thin.map(b => b.days).join('/')} ${thin.length === 1 && thin[0].days === 1 ? 'day' : 'days'} so far, so treat ${thin.length === 1 ? 'that bar' : 'those bars'} as a hint. ` : ''}Patterns show what tends to go together, not what causes what.`;
  const n = x.type === 'group' ? ds.filter(d => d.entries.some(e => Array.isArray(e.trackerValues[x.id]) && (e.trackerValues[x.id] as string[]).length) && hasY(y, d, trackers)).length : both.length;
  return { bars, n, finding, caveat, unitDays: 'days' };
}

export interface Pattern { x: Tracker; y: YRef; text: string; sub: string; strength: 'Strong' | 'Moderate' | 'Weak'; score: number }

export function findPatterns(ds: DayData[], trackers: Tracker[], s: Settings): Pattern[] {
  const xs = trackers.filter(t => !t.archived && t.type !== 'group');
  const ys: YRef[] = [...METRICS.map(m => ({ kind: 'metric' as const, id: m.id })), ...trackers.filter(t => !t.archived && t.askOn !== 'checkin' && t.type === 'points').map(t => ({ kind: 'tracker' as const, id: t.id }))];
  const out: Pattern[] = [];
  for (const x of xs) {
    for (const y of ys) {
      if (y.kind === 'tracker' && y.id === x.id) continue;
      const both = ds.filter(d => xValue(x, d) != null && hasY(y, d, trackers));
      if (both.length < 6) continue;
      const vals = both.map(d => xValue(x, d)!).sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)];
      let low = both.filter(d => xValue(x, d)! < med), high = both.filter(d => xValue(x, d)! >= med);
      if (low.length < 3 || high.length < 3) { low = both.filter(d => xValue(x, d)! <= med); high = both.filter(d => xValue(x, d)! > med); }
      if (low.length < 3 || high.length < 3) continue;
      const a = aggregate(y, low, trackers, s), b = aggregate(y, high, trackers, s);
      if (a == null || b == null) continue;
      const isPct = y.kind === 'metric' && (y.id === 'within' || y.id === 'due');
      const yt = y.kind === 'tracker' ? trackers.find(t => t.id === y.id) : undefined;
      const scale = isPct ? 100 : y.kind === 'metric' && (y.id === 'overrun' || y.id === 'tracked') ? Math.max(15, (a + b) / 2) : yt ? Math.max(1, (yt.max ?? 5) - (yt.min ?? 1)) : Math.max(0.5, (a + b) / 2);
      const effect = Math.abs(a - b) / scale;
      const score = effect * Math.sqrt(Math.min(low.length, high.length));
      if (score < 0.35) continue;
      const strength = score >= 1.1 ? 'Strong' : score >= 0.6 ? 'Moderate' : 'Weak';
      // describe the low side of X
      const fmtX = (v: number) => x.type === 'duration' ? fmtMin(v) : x.type === 'time' ? fmtHHMM(`${String(Math.floor(((v + 18 * 60) % 1440) / 60)).padStart(2, '0')}:${String(Math.round(v + 18 * 60) % 60).padStart(2, '0')}`) : x.type === 'levels' ? (x.levels?.[Math.round(v)] ?? String(v)) : String(Math.round(v * 10) / 10);
      const better = yBetterHigh(y, trackers);
      const lowWorse = better ? a < b : a > b;
      const [w, o] = lowWorse ? [a, b] : [b, a];
      const cond = lowWorse
        ? (x.type === 'duration' ? `Under ${fmtX(med)} of ${x.name.toLowerCase()}` : x.type === 'time' ? `${x.name} before ${fmtX(med)}` : x.type === 'levels' ? `${x.name} below ${fmtX(med)}` : `Low ${x.name.toLowerCase()} (under ${fmtX(med)})`)
        : (x.type === 'duration' ? `${fmtX(med)}+ of ${x.name.toLowerCase()}` : x.type === 'time' ? `${x.name} after ${fmtX(med)}` : x.type === 'levels' ? `${x.name} ${fmtX(med)} or better` : `High ${x.name.toLowerCase()} (${fmtX(med)}+)`);
      const yl = yLabel(y, trackers);
      let text: string;
      if (y.kind === 'metric' && y.id === 'within') text = `${cond} → ${Math.round(w)}% of tasks within estimate, vs ${Math.round(o)}% otherwise`;
      else if (y.kind === 'metric' && y.id === 'overrun') text = `${cond} → tasks ran ${fmtMin(w - o)} further over estimate`;
      else if (y.kind === 'metric' && y.id === 'due') text = `${cond} → ${Math.round(w)}% of due dates met, vs ${Math.round(o)}% otherwise`;
      else if (y.kind === 'tracker') text = `${yl} was ${w > o ? 'higher' : 'lower'} with ${cond.charAt(0).toLowerCase() + cond.slice(1)}: ${w.toFixed(1)} vs ${o.toFixed(1)} on average`;
      else text = `${cond} → ${fmtY(y, w, trackers)} ${yl.toLowerCase()} a day, vs ${fmtY(y, o, trackers)} otherwise`;
      out.push({ x, y, text, sub: `${x.name} × ${yl} · ${both.length} days`, strength, score });
    }
  }
  return out.sort((p, q) => q.score - p.score).slice(0, 5);
}
