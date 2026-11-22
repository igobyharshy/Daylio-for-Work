import type { IconName } from '../ui/Icon';
import { fmtHHMM, fmtMin } from './time';

export type TrackerType = 'points' | 'levels' | 'duration' | 'time' | 'count' | 'group';
export type AskOn = 'checkin' | 'every' | 'tagged';

export interface Tracker {
  id: string;
  name: string;
  icon: IconName;
  question: string;
  type: TrackerType;
  // points
  min?: number; max?: number; minLabel?: string; maxLabel?: string; higherIs?: 'better' | 'worse';
  // levels (worst → best); value = index
  levels?: string[];
  // count
  unit?: string;
  // group
  options?: string[]; multi?: boolean;
  askOn: AskOn;
  tags: string[];
  archived?: boolean;
}
/** points/levels/count/duration(min) → number, time → 'HH:MM', group → string[] */
export type TrackerValue = number | string | string[];
export type TrackerValues = Record<string, TrackerValue>;

export interface Checkin { id: string; day: string; values: TrackerValues; skipped: boolean; isSample: boolean }

export const TYPE_LABEL: Record<TrackerType, string> = { points: 'Points', levels: 'Levels', duration: 'Duration', time: 'Time of day', count: 'Count', group: 'Group' };
export const TYPE_ICON: Record<TrackerType, IconName> = { points: 'bar', levels: 'list', duration: 'timer', time: 'clock', count: 'checklist', group: 'tag' };
export const TYPE_HELP: Record<TrackerType, string> = {
  points: 'A number on a range, like 1–5 or 0–10. Name the two ends.',
  levels: '3 to 7 named steps, like Poor → Great.',
  duration: 'Hours and minutes, like sleep or hours worked.',
  time: 'A clock time, like bedtime or wake-up.',
  count: 'How many, with a unit: coffees, meetings.',
  group: 'A list to pick from, one or many: causes, places.',
};
export const ICON_CHOICES: IconName[] = ['moon', 'clock', 'snooze', 'bolt', 'warn', 'list', 'sun', 'alarm', 'err', 'lightbulb', 'timer', 'checklist', 'event', 'mood', 'coffee', 'groups', 'calm', 'fitness', 'water', 'brain', 'tag', 'flag'];

export const DEFAULT_TRACKERS: Tracker[] = [
  { id: 'sleep_quality', name: 'Sleep quality', icon: 'moon', question: 'How well did you sleep?', type: 'levels', levels: ['Poor', 'Fair', 'OK', 'Good', 'Great'], askOn: 'checkin', tags: [] },
  { id: 'sleep_time', name: 'Sleep time', icon: 'clock', question: 'How long did you sleep?', type: 'duration', askOn: 'checkin', tags: [] },
  { id: 'bedtime', name: 'Bedtime', icon: 'snooze', question: 'When did you go to bed?', type: 'time', askOn: 'checkin', tags: [] },
  { id: 'energy', name: 'Energy', icon: 'bolt', question: 'How’s your energy?', type: 'points', min: 1, max: 5, minLabel: 'Drained', maxLabel: 'Full', higherIs: 'better', askOn: 'checkin', tags: [] },
  { id: 'severity', name: 'Severity', icon: 'warn', question: 'How bad was it?', type: 'points', min: 1, max: 5, minLabel: 'Minor', maxLabel: 'Critical', higherIs: 'worse', askOn: 'tagged', tags: ['Mistake'] },
  { id: 'cause', name: 'Cause', icon: 'list', question: 'What caused it?', type: 'group', options: ['Rushed', 'Unclear brief', 'Missed a step', 'Scope grew', 'Distracted', 'Stress'], multi: true, askOn: 'tagged', tags: ['Mistake', 'Task delay'] },
  { id: 'mood', name: 'Mood', icon: 'mood', question: 'How’s your mood?', type: 'levels', levels: ['Low', 'Meh', 'OK', 'Good', 'Great'], askOn: 'checkin', tags: [], archived: true },
];

export const SUGGESTIONS: Omit<Tracker, 'id'>[] = [
  DEFAULT_TRACKERS[4], DEFAULT_TRACKERS[0], DEFAULT_TRACKERS[1], DEFAULT_TRACKERS[2],
  { name: 'Wake-up', icon: 'alarm', question: 'When did you wake up?', type: 'time', askOn: 'checkin', tags: [] },
  DEFAULT_TRACKERS[3],
  { name: 'Stress', icon: 'err', question: 'How stressed are you?', type: 'points', min: 1, max: 10, minLabel: 'Calm', maxLabel: 'Very stressed', higherIs: 'worse', askOn: 'checkin', tags: [] },
  { name: 'Focus', icon: 'lightbulb', question: 'How focused were you?', type: 'levels', levels: ['Scattered', 'Patchy', 'OK', 'Focused', 'In the zone'], askOn: 'checkin', tags: [] },
  { name: 'Mood', icon: 'sun', question: 'How’s your mood?', type: 'levels', levels: ['Low', 'Meh', 'OK', 'Good', 'Great'], askOn: 'checkin', tags: [] },
  { name: 'Hours worked', icon: 'timer', question: 'How long did you work?', type: 'duration', askOn: 'checkin', tags: [] },
  { name: 'Caffeine', icon: 'checklist', question: 'How many coffees?', type: 'count', unit: 'coffees', askOn: 'checkin', tags: [] },
  { name: 'Meetings', icon: 'event', question: 'How many meetings?', type: 'count', unit: 'meetings', askOn: 'checkin', tags: [] },
].map(({ id: _id, ...t }: any) => t);

export function blankTracker(type: TrackerType): Omit<Tracker, 'id'> {
  const base = { name: '', icon: TYPE_ICON[type], question: '', type, askOn: 'checkin' as AskOn, tags: [] as string[] };
  if (type === 'points') return { ...base, min: 1, max: 5, minLabel: 'Low', maxLabel: 'High', higherIs: 'better' };
  if (type === 'levels') return { ...base, levels: ['Poor', 'OK', 'Good'] };
  if (type === 'count') return { ...base, unit: '' };
  if (type === 'group') return { ...base, options: ['Option 1', 'Option 2'], multi: true, askOn: 'tagged' };
  return base;
}

/** "Levels · 5 named levels", "Points · 1 to 5 · Drained → Full" */
export function describe(t: Tracker) {
  switch (t.type) {
    case 'points': return `Points · ${t.min} to ${t.max}${t.minLabel || t.maxLabel ? ` · ${t.minLabel || t.min} → ${t.maxLabel || t.max}` : ''}`;
    case 'levels': return `Levels · ${t.levels?.length ?? 0} named levels`;
    case 'duration': return 'Duration · hours and minutes';
    case 'time': return 'Time of day';
    case 'count': return `Count${t.unit ? ` · ${t.unit}` : ''}`;
    case 'group': return `Group · pick ${t.multi ? 'any' : 'one'} · ${t.options?.length ?? 0} options`;
  }
}
export const shortType = (t: Tracker) => t.type === 'points' ? `Points ${t.min}–${t.max}` : TYPE_LABEL[t.type];

export function fmtValue(t: Tracker, v: TrackerValue | undefined): string {
  if (v == null || (Array.isArray(v) && !v.length)) return '—';
  switch (t.type) {
    case 'points': return `${v} / ${t.max}`;
    case 'levels': return t.levels?.[v as number] ?? '—';
    case 'duration': return fmtMin(v as number);
    case 'time': return fmtHHMM(v as string);
    case 'count': return `${v}${t.unit ? ' ' + t.unit : ''}`;
    case 'group': return (v as string[]).join(', ');
  }
}

/** numeric value for analysis: points/count as-is, levels index, duration minutes, time minutes after 18:00 (so bedtime past midnight sorts later) */
export function numeric(t: Tracker, v: TrackerValue | undefined): number | null {
  if (v == null) return null;
  if (t.type === 'group') return null;
  if (t.type === 'time') { const [h, m] = String(v).split(':').map(Number); const mins = h * 60 + m; return (mins - 18 * 60 + 1440) % 1440; }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** trackers asked on an entry with these tags */
export function entryTrackers(all: Tracker[], tags: string[]) {
  return all.filter(t => !t.archived && (t.askOn === 'every' || (t.askOn === 'tagged' && t.tags.some(x => tags.includes(x)))));
}
export const checkinTrackers = (all: Tracker[]) => all.filter(t => !t.archived && t.askOn === 'checkin');
export const trackerId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Math.random().toString(36).slice(2, 6);
