import { MdFullscreen, MdOutlineHome, MdAdd, MdArrowBack, MdArrowForward, MdBook, MdCheck, MdCheckCircle, MdCheckCircleOutline, MdChevronLeft, MdChevronRight, MdClose, MdContentCopy, MdDeleteOutline, MdDoneAll, MdDragIndicator, MdEditNote, MdExpandLess, MdExpandMore, MdFilterList, MdFolder, MdHourglassEmpty, MdInsights, MdLink, MdLockOutline, MdLogout, MdMoreHoriz, MdMoreVert, MdNotes, MdNotificationsActive, MdOpenInNew, MdOutlineAccessTime, MdOutlineAlarm, MdOutlineBook, MdOutlineCalendarMonth, MdOutlineChecklist, MdOutlineDarkMode, MdOutlineEdit, MdOutlineEvent, MdOutlineFileDownload, MdOutlineFlag, MdOutlineFolder, MdOutlineGridView, MdOutlineHistory, MdOutlineImage, MdOutlineInbox, MdOutlineInfo, MdOutlineKey, MdOutlineKeyboard, MdOutlineLightbulb, MdOutlineNotifications, MdOutlineNotificationsOff, MdOutlinePalette, MdOutlinePerson, MdOutlineRateReview, MdOutlineSchedule, MdOutlineSell, MdOutlineSettings, MdOutlineSnooze, MdOutlineTimer, MdOutlineViewAgenda, MdOutlineViewKanban, MdOutlineVisibility, MdOutlineVisibilityOff, MdOutlineWarningAmber, MdOutlineWbSunny, MdPause, MdPictureInPictureAlt, MdPlayArrow, MdRadioButtonUnchecked, MdRefresh, MdRemove, MdSearch, MdSort, MdSubdirectoryArrowRight, MdTrendingDown, MdTrendingUp, MdWbSunny , MdOutlineBedtime, MdOutlineBolt, MdErrorOutline, MdBarChart, MdOutlineMood, MdOutlineCoffee, MdOutlineGroups, MdOutlineSelfImprovement, MdOutlineFitnessCenter, MdOutlineWaterDrop, MdOutlinePsychology, MdRadioButtonChecked, MdOutlineLightMode, MdOutlineSettingsBrightness, MdUnfoldMore, MdOutlineRestaurant, MdOutlineViewTimeline, MdOutlineTune, MdSwapVert, MdOutlineLogin, MdOutlineLogout, MdOutlineMoreTime } from 'react-icons/md';
import type { IconType } from 'react-icons';

const MAP = {
  search: MdSearch, close: MdClose, add: MdAdd, check: MdCheck, play: MdPlayArrow, pause: MdPause,
  timer: MdOutlineTimer, hourglass: MdHourglassEmpty, sun: MdOutlineWbSunny, sunFill: MdWbSunny,
  folder: MdOutlineFolder, folderFill: MdFolder, book: MdOutlineBook, bookFill: MdBook, insights: MdInsights,
  settings: MdOutlineSettings, bell: MdOutlineNotifications, bellOn: MdNotificationsActive, dark: MdOutlineDarkMode,
  open: MdOpenInNew, edit: MdOutlineEdit, trash: MdDeleteOutline, event: MdOutlineEvent, calendar: MdOutlineCalendarMonth,
  chevLeft: MdChevronLeft, chevRight: MdChevronRight, chevDown: MdExpandMore, chevUp: MdExpandLess, filter: MdFilterList,
  list: MdOutlineViewAgenda, board: MdOutlineViewKanban, gallery: MdOutlineGridView, circle: MdRadioButtonUnchecked,
  checkCircle: MdCheckCircle, checkCircleO: MdCheckCircleOutline, flag: MdOutlineFlag, tag: MdOutlineSell, link: MdLink,
  subdir: MdSubdirectoryArrowRight, warn: MdOutlineWarningAmber, snooze: MdOutlineSnooze, clock: MdOutlineAccessTime,
  alarm: MdOutlineAlarm, more: MdMoreHoriz, moreV: MdMoreVert, drag: MdDragIndicator, back: MdArrowBack, info: MdOutlineInfo,
  lightbulb: MdOutlineLightbulb, trendUp: MdTrendingUp, trendDown: MdTrendingDown, logout: MdLogout, image: MdOutlineImage,
  download: MdOutlineFileDownload, lock: MdLockOutline, inbox: MdOutlineInbox, checklist: MdOutlineChecklist,
  review: MdOutlineRateReview, history: MdOutlineHistory, draw: MdEditNote, keyboard: MdOutlineKeyboard, refresh: MdRefresh,
  copy: MdContentCopy, person: MdOutlinePerson, eye: MdOutlineVisibility, eyeOff: MdOutlineVisibilityOff, remove: MdRemove,
  note: MdNotes, pip: MdPictureInPictureAlt, schedule: MdOutlineSchedule, sort: MdSort, palette: MdOutlinePalette,
  doneAll: MdDoneAll, moon: MdOutlineBedtime, bolt: MdOutlineBolt, err: MdErrorOutline, bar: MdBarChart, mood: MdOutlineMood, coffee: MdOutlineCoffee, groups: MdOutlineGroups, calm: MdOutlineSelfImprovement, fitness: MdOutlineFitnessCenter, water: MdOutlineWaterDrop, brain: MdOutlinePsychology, radioOn: MdRadioButtonChecked, key: MdOutlineKey, bellOff: MdOutlineNotificationsOff, forward: MdArrowForward, light: MdOutlineLightMode, autoTheme: MdOutlineSettingsBrightness, unfold: MdUnfoldMore, restaurant: MdOutlineRestaurant, timeline: MdOutlineViewTimeline, tune: MdOutlineTune, swap: MdSwapVert, fullscreen: MdFullscreen, home: MdOutlineHome, punchIn: MdOutlineLogin, punchOut: MdOutlineLogout, moreTime: MdOutlineMoreTime,
} satisfies Record<string, IconType>;

export type IconName = keyof typeof MAP;

export function Icon({ name, size, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  const C = MAP[name];
  return <C className={'icon' + (className ? ' ' + className : '')} style={size ? { width: size, height: size, ...style } : style} aria-hidden />;
}
