import type { Tracker, TrackerValues } from './trackers';
import { DEFAULT_TRACKERS } from './trackers';
export type ID = string;

export type Cover = 'blue' | 'teal' | 'green' | 'amber' | 'rose' | 'purple' | 'grey';

export interface Project {
  id: ID;
  name: string;
  emoji: string;
  cover: Cover;
  status: string;
  startDate: string | null; // YYYY-MM-DD
  dueDate: string | null;
  dueTime: string | null; // HH:MM
  tags: string[];
  isInbox: boolean;
  /** archive is a flag, separate from status, so unarchiving keeps the status */
  archived: boolean;
  sort: number;
  isSample: boolean;
  createdAt: string;
}

export interface Step { id: string; title: string; done: boolean }
/** one stretch of timer work: start, end (null while it runs) */
export interface WorkSession { s: string; e: string | null }
export interface ReEstimate { at: string; addMin: number }

export type Reflection = 'none' | 'needed' | 'done' | 'dismissed';

export interface Task {
  id: ID;
  projectId: ID | null;
  title: string;
  status: string;
  dueDate: string | null;
  dueTime: string | null;
  estimateMin: number | null;
  reEstimates: ReEstimate[];
  myDayDate: string | null;
  remindAt: string | null;
  remindedAt: string | null;
  steps: Step[];
  note: string;
  elapsedMs: number;
  runStartedAt: string | null;
  /** last time the timer was paused (decides which paused timer the Now card shows) */
  pausedAt: string | null;
  firstStartedAt: string | null;
  finishedAt: string | null;
  /** when you plan to work on it (Timeline); the planned length is the estimate. Separate from the due date. */
  plannedStart: string | null;
  /** timer sessions, logged from the Timeline release on; older tasks have [] */
  sessions: WorkSession[];
  reflection: Reflection;
  snoozeUntil: string | null;
  sort: number;
  isSample: boolean;
  createdAt: string;
}

export interface Entry {
  id: ID;
  body: string;
  whenAt: string;
  tags: string[];
  taskIds: ID[];
  trackerValues: TrackerValues;
  isSample: boolean;
  createdAt: string;
}

export type BlockKind = 'meeting' | 'lunch' | 'break' | 'other';
/** non-task time on the Timeline: meetings, lunch, breaks */
export interface TimeBlock {
  id: ID;
  title: string;
  kind: BlockKind;
  startAt: string;
  endAt: string;
  note: string;
  createdAt: string;
}

export interface Notif {
  id: ID;
  kind: 'reminder' | 'reflection' | 'over' | 'info';
  title: string;
  body: string;
  taskId: ID | null;
  readAt: string | null;
  createdAt: string;
}

export type Tone = 'neutral' | 'grey' | 'secondary' | 'blue' | 'green' | 'purple' | 'amber' | 'red';

export interface StatusDef { name: string; tone: Tone; note?: string }

export interface JournalDefaults {
  overEstimate: string;
  late: string;
  review: string;
  manual: string;
  fromTask: string;
}

export interface NotifPrefs {
  taskReminder: boolean;
  estimateUsedUp: boolean;
  reflectionReminder: boolean;
  overNudge: boolean;
  finishToast: boolean;
  bellBadge: boolean;
  sound: boolean;
  quietOutsideWorkDay: boolean;
}

export interface Settings {
  workStart: string; // HH:MM
  workEnd: string;
  projectDefaultTags: string[];
  journalDefaults: JournalDefaults;
  taskStatuses: StatusDef[];
  projectStatuses: StatusDef[];
  projectTags: string[];
  journalTags: string[];
  notif: NotifPrefs;
  myDayView: 'list' | 'board' | 'timeline';
  /** Timeline: show the plan, what actually happened, or both */
  timelineMode?: 'plan' | 'actual' | 'both';
  projectsView: 'list' | 'gallery' | 'board';
  journalView: 'calendar' | 'list';
  lastReflectionPrompt?: string; // YYYY-MM-DD
  trackers: Tracker[];
  checkinRemind: string | null; // HH:MM
  lastCheckinPrompt?: string;
  /** check-in tracker shown as a colour strip on Journal calendar days */
  calendarTracker?: string | null;
  /** colour theme; 'system' follows the device */
  theme?: 'light' | 'dark' | 'system';
}

export const DEFAULT_SETTINGS: Settings = {
  workStart: '09:00',
  workEnd: '18:00',
  projectDefaultTags: ['Work'],
  journalDefaults: { overEstimate: 'Task delay', late: 'Task delay', review: 'Task delay', manual: '', fromTask: '' },
  taskStatuses: [
    { name: 'Not started', tone: 'neutral', note: 'Default for new tasks' },
    { name: 'In progress', tone: 'blue', note: 'Set when you press ▶' },
    { name: 'Done', tone: 'green', note: 'Set when you tick a task. Choosing it doesn’t tick the task.' },
    { name: 'Archived', tone: 'grey', note: 'Hidden from My Day' },
  ],
  projectStatuses: [
    { name: 'Backlog', tone: 'grey' },
    { name: 'Not started', tone: 'neutral' },
    { name: 'In progress', tone: 'blue' },
    { name: 'Done', tone: 'green' },
  ],
  projectTags: ['Work', 'Personal', 'Graphic design', 'Motion design'],
  journalTags: ['Task delay', 'Mistake', 'Lesson', 'Idea', 'Win'],
  notif: {
    taskReminder: true,
    estimateUsedUp: true,
    reflectionReminder: true,
    overNudge: false,
    finishToast: true,
    bellBadge: true,
    sound: false,
    quietOutsideWorkDay: true,
  },
  myDayView: 'list',
  projectsView: 'list',
  journalView: 'calendar',
  trackers: DEFAULT_TRACKERS,
  checkinRemind: '09:00',
  calendarTracker: 'energy',
};

/** statuses that always show as groups / columns */
export const CORE_STATUSES = ['Not started', 'In progress', 'Done'];
