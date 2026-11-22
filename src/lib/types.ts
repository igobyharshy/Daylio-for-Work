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
  sort: number;
  isSample: boolean;
  createdAt: string;
}

export interface Step { id: string; title: string; done: boolean }
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
  firstStartedAt: string | null;
  finishedAt: string | null;
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
  myDayView: 'list' | 'board';
  projectsView: 'list' | 'gallery' | 'board';
  journalView: 'calendar' | 'list';
  lastReflectionPrompt?: string; // YYYY-MM-DD
  trackers: Tracker[];
  checkinRemind: string | null; // HH:MM
  lastCheckinPrompt?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  workStart: '09:00',
  workEnd: '18:00',
  projectDefaultTags: ['Work'],
  journalDefaults: { overEstimate: 'Task delay', late: 'Task delay', review: 'Task delay', manual: 'Mistake', fromTask: 'Task delay' },
  taskStatuses: [
    { name: 'Backlog', tone: 'grey' },
    { name: 'Not started', tone: 'neutral', note: 'Default for new tasks' },
    { name: 'Planned', tone: 'secondary' },
    { name: 'In progress', tone: 'blue', note: 'Set when you press ▶' },
    { name: 'Done', tone: 'green', note: 'Set when you tick the checkbox' },
    { name: 'Reviewed', tone: 'purple' },
    { name: 'Archived', tone: 'grey', note: 'Hidden from My Day' },
  ],
  projectStatuses: [
    { name: 'Backlog', tone: 'grey' },
    { name: 'Not started', tone: 'neutral' },
    { name: 'In progress', tone: 'blue' },
    { name: 'Done', tone: 'green' },
    { name: 'Archived', tone: 'grey' },
  ],
  projectTags: ['Work', 'Personal', 'Graphic design', 'Motion design'],
  journalTags: ['Task delay', 'Mistake', 'Lesson', 'Idea'],
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
};
