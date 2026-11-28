import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useUI } from '../app/ui';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, IBtn, Popover, Seg, Switch, cx, useAnchor } from '../ui/kit';
import { AddTaskBar, FilterButton, FilterChips, NothingRunning, ProjectLabel, RunCard, TaskBoard, TaskGroups, applyTaskFilter, EMPTY_FILTER, DueText, toneDot, type TaskFilter } from './tasks';
import { activeTask, archivedIds, hiddenTasks, isLive, myDayTasks, shownInMyDay } from '../lib/select';
import { CORE_STATUSES, rowFields, type RowField, type RowFieldPref } from '../lib/types';
import { fmtDayLong, isDone, isOverdue, todayISO } from '../lib/time';
import { useMiniTimer } from './mini';
import { SampleBanner } from './common';
import { TimelineView } from './timeline';
import { useIsMobile } from '../lib/native';
import { GettingStarted } from './onboarding';

export function MyDayPage() {
  const st = useStore();
  const mini = useMiniTimer();
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const view = st.settings.myDayView;
  const all = myDayTasks(st.tasks, st.projects);
  const tasks = applyTaskFilter(all, filter, st.settings);
  const active = activeTask(st.tasks, st.projects);
  const left = all.filter(t => !isDone(t)).length, done = all.length - left;
  const va = useAnchor();
  const hidden = view === 'timeline' ? [] : hiddenTasks(st.settings.taskStatuses, tasks);
  const hiddenNames = [...new Set(hidden.map(t => t.status))];
  const phone = useIsMobile();

  // phones: one quiet header button (view, filter, groups), the timer only when one runs, roomy rows
  if (phone) return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">My Day</span><span className="t-bm c-muted">{fmtDayShortish()} · {left ? `${left} to do` : 'all done'}{done ? ` · ${done} done` : ''}</span></div>
        <div className="actions"><IBtn icon="tune" label="View and filter" tip={false} kind={va.isOpen || filterOn(filter) ? 'selected' : 'standard'} onClick={e => va.open(e)} /></div>
      </div>
      {active && <RunCard t={active} onPopOut={() => mini.open()} />}
      <GettingStarted />
      <SampleBanner />
      {view !== 'timeline' && <FilterChips value={filter} onChange={setFilter} shown={tasks.length} total={all.length} />}
      <PlanLine />
      {view === 'timeline' ? <TimelineView /> : all.length === 0
        ? <div className="empty"><Icon name="sun" /><div className="t-tm" style={{ color: 'var(--on-surface)' }}>Plan your day</div><div className="t-bm" style={{ maxWidth: 320 }}>Add what you’ll do today, give it an estimate, then press ▶ and try to beat it.</div></div>
        : view === 'board' ? <TaskBoard tasks={tasks} myDay /> : <TaskGroups tasks={tasks} carry scope="myday" myDay />}
      {hidden.length > 0 && (
        <button className="row gap-8 t-bs c-muted hidden-note" onClick={e => va.open(e)}>
          <Icon name="eyeOff" size={18} /><span>{hidden.length} hidden in {hiddenNames.join(', ')}</span>
        </button>
      )}
      {va.isOpen && <ViewOptions anchor={va.el} onClose={va.close} showRows={view !== 'timeline'} phoneView={{ view, filter, setFilter }} />}
      <div className="grow" />
      <div className="bottom-bar"><AddTaskBar /></div>
    </>
  );

  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">My Day</span><span className="t-bm c-muted">{fmtDayLong(new Date())} · {left} to do{done ? ` · ${done} done` : ''}</span></div>
        <div className="actions">
          {view !== 'timeline' && <FilterButton value={filter} onChange={setFilter} showProjects />}
          {view !== 'timeline' && <IBtn icon="tune" label="View options: groups and task details" kind={va.isOpen ? 'selected' : 'outlined'} onClick={e => va.open(e)} />}
          <Seg value={view} onChange={v => st.updateSettings({ myDayView: v })} items={[{ value: 'list', icon: 'list', tip: 'List' }, { value: 'board', icon: 'board', tip: 'Board' }, { value: 'timeline', icon: 'timeline', tip: 'Timeline' }]} />
        </div>
      </div>
      <GettingStarted />
      <SampleBanner />
      {view !== 'timeline' && <FilterChips value={filter} onChange={setFilter} shown={tasks.length} total={all.length} />}

      <div className="col gap-8">
        <div className="section-label">Now</div>
        {active ? <RunCard t={active} onPopOut={() => mini.open()} /> : <NothingRunning />}
      </div>
      <PlanLine />

      {view === 'timeline' ? <TimelineView /> : all.length === 0
        ? <div className="empty"><Icon name="sun" /><div className="t-tm" style={{ color: 'var(--on-surface)' }}>Plan your day</div><div className="t-bm" style={{ maxWidth: 420 }}>Add what you’ll do today. Give each task an estimate, then press ▶ and try to beat it.</div></div>
        : view === 'board' ? <TaskBoard tasks={tasks} myDay /> : <TaskGroups tasks={tasks} carry scope="myday" myDay />}
      {hidden.length > 0 && (
        <div className="row gap-8 t-bs c-muted hidden-note">
          <Icon name="eyeOff" size={18} />
          <span>{hidden.length} {hidden.length === 1 ? 'task is' : 'tasks are'} in hidden {hiddenNames.length === 1 ? 'group' : 'groups'}: {hiddenNames.join(', ')}</span>
          <Btn kind="text" onClick={e => va.open(e)}>Show groups</Btn>
        </div>
      )}
      {va.isOpen && <ViewOptions anchor={va.el} onClose={va.close} showRows={view === 'list'} />}
      <div className="grow" />
      <div className="bottom-bar"><AddTaskBar /></div>
    </>
  );
}

/** My Day view options: which status groups show (list + board) and how much each task row shows */
function ViewOptions({ anchor, onClose, showRows, phoneView }: { anchor: HTMLElement | null; onClose: () => void; showRows: boolean; phoneView?: { view: 'list' | 'board' | 'timeline'; filter: TaskFilter; setFilter: (f: TaskFilter) => void } }) {
  const st = useStore();
  const nav = useNavigate();
  const list = st.settings.taskStatuses.filter(s => s.name !== 'Archived');
  const used = new Set(myDayTasks(st.tasks, st.projects).map(t => t.status));
  const set = (name: string, on: boolean) =>
    st.updateSettings({ taskStatuses: st.settings.taskStatuses.map(s => (s.name === name ? { ...s, myDay: on ? 'show' : 'hide' } : s)) });
  return (
    <Popover anchor={anchor} onClose={onClose} placement="below-end">
      <div className="menu view-opts" style={{ width: 320, padding: '12px 0 8px' }}>
        {phoneView && <>
          <span className="t-ts" style={{ padding: '0 16px 8px' }}>View</span>
          <div className="row gap-8" style={{ padding: '0 16px 4px' }}>
            <Seg value={phoneView.view} onChange={v => st.updateSettings({ myDayView: v })} items={[{ value: 'list', icon: 'list', label: 'List' }, { value: 'board', icon: 'board', label: 'Board' }, { value: 'timeline', icon: 'timeline', label: 'Timeline' }]} />
            <span className="grow" />
            {phoneView.view !== 'timeline' && <FilterButton value={phoneView.filter} onChange={phoneView.setFilter} showProjects />}
          </div>
          {phoneView.view === 'timeline' ? null : <div className="divider" style={{ margin: '12px 0' }} />}
        </>}
        {phoneView?.view === 'timeline' ? null : <>
        <span className="t-ts" style={{ padding: '0 16px' }}>Groups in My Day</span>
        <span className="t-bs c-muted" style={{ padding: '2px 16px 6px' }}>Turn a group off to hide it, and its tasks, from My Day.</span>
        {list.map(s => {
          const on = shownInMyDay(s, used.has(s.name));
          const auto = !s.myDay && !CORE_STATUSES.includes(s.name);
          return (
            <label key={s.name} className="row gap-12 vo-row">
              <span className="dot" style={{ background: toneDot(s.tone) }} />
              <span className="col grow" style={{ minWidth: 0 }}>
                <span className="t-bm ellipsis">{s.name}</span>
                {auto && <span className="t-bs c-muted">{on ? 'Showing because a task has it' : 'Shows when a task has it'}</span>}
                {s.myDay === 'hide' && used.has(s.name) && <span className="t-bs c-muted">Hidden, with its tasks</span>}
              </span>
              <Switch on={on} onChange={v => set(s.name, v)} label={`Show ${s.name} in My Day`} />
            </label>
          );
        })}
        </>}
        {showRows && <>
          <div className="divider" style={{ margin: '8px 0' }} />
          {phoneView ? <RowFieldsEditor /> : <>
          <span className="t-ts" style={{ padding: '0 16px' }}>Task details</span>
          <span className="t-bs c-muted" style={{ padding: '2px 16px 8px' }}>Project, dates, due and estimate on each row.</span>
          <div style={{ padding: '0 16px 4px' }}>
            <Seg value={st.settings.rowDetails ?? 'hover'} onChange={v => st.updateSettings({ rowDetails: v })} items={[{ value: 'hover', label: 'On hover' }, { value: 'always', label: 'Always' }]} />
          </div>
          </>}
        </>}
        <div className="divider" style={{ margin: '8px 0 4px' }} />
        <div className={cx('row')} style={{ padding: '0 8px' }}>
          <Btn kind="text" icon="edit" onClick={() => { onClose(); nav('/settings/statuses'); }}>Add or edit statuses</Btn>
        </div>
      </div>
    </Popover>
  );
}

/** "3 tasks are due today or overdue but not on My Day · Plan" */
function PlanLine() {
  const st = useStore();
  const ui = useUI();
  const a = useAnchor();
  const today = todayISO();
  const phone = useIsMobile();
  const arch = useMemo(() => archivedIds(st.projects), [st.projects]);
  const list = st.tasks.filter(t => !isDone(t) && isLive(t, arch) && !(t.myDayDate && t.myDayDate <= today) && t.dueDate && t.dueDate <= today)
    .sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
  if (!list.length) return null;
  const overdue = list.filter(t => isOverdue(t, st.settings)).length;
  const add = (ids: string[]) => ids.forEach(id => st.updateTask(id, { myDayDate: today }));
  return (
    <div className="plan-line">
      <Icon name="event" />
      <span className="t-bm grow">{phone ? `${list.length} more ${list.length === 1 ? 'task' : 'tasks'} due${overdue ? ` (${overdue} overdue)` : ' today'}` : `${list.length} ${list.length === 1 ? 'task is' : 'tasks are'} due today${overdue ? ` or overdue (${overdue} overdue)` : ''} but not on My Day.`}</span>
      <Btn kind="tonal" onClick={e => a.open(e)}>Plan</Btn>
      {a.isOpen && (
        <Popover anchor={a.el} onClose={a.close} placement="below-end">
          <div className="menu" style={{ width: 440, padding: '8px 0' }}>
            <div className="row" style={{ padding: '4px 8px 4px 16px' }}><span className="t-ts grow">Add to today</span><Btn kind="text" onClick={() => { add(list.map(t => t.id)); a.close(); }}>Add all</Btn></div>
            {list.map(t => (
              <div key={t.id} className="row gap-12" style={{ padding: '6px 8px 6px 16px', minHeight: 56 }}>
                <button className="col grow" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => { ui.openTask(t.id); a.close(); }}>
                  <span className="t-bl ellipsis">{t.title}</span>
                  <span className="meta"><ProjectLabel p={st.projectById(t.projectId)} /><span className="sep">·</span><DueText t={t} settings={st.settings} /></span>
                </button>
                <IBtn icon="sun" label="Add to My Day" kind="pc" onClick={() => add([t.id])} />
              </div>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

const filterOn = (f: TaskFilter) => JSON.stringify(f) !== JSON.stringify(EMPTY_FILTER);
/** "Thu 26 Nov" — short enough for one line on a phone */
const fmtDayShortish = () => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const FIELD_INFO: Record<RowField, { label: string; icon: IconName }> = {
  timer: { label: 'Timer', icon: 'timer' }, project: { label: 'Project', icon: 'folder' }, due: { label: 'Due', icon: 'event' },
  estimate: { label: 'Estimate', icon: 'hourglass' }, steps: { label: 'Steps', icon: 'checklist' }, planned: { label: 'Planned time', icon: 'schedule' },
  status: { label: 'Status', icon: 'flag' }, repeat: { label: 'Repeat', icon: 'repeat' }, remind: { label: 'Reminder', icon: 'bell' },
};
/** phones: pick which details sit on the line under each task title, and their order (eye = show / hide) */
function RowFieldsEditor() {
  const st = useStore();
  const list = rowFields(st.settings);
  const save = (next: RowFieldPref[]) => st.updateSettings({ rowFields: next });
  const move = (i: number, d: -1 | 1) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); save(n); };
  return (
    <>
      <span className="t-ts" style={{ padding: '0 16px' }}>Show on each task</span>
      <span className="t-bs c-muted" style={{ padding: '2px 16px 6px' }}>One quiet line under the title. Put what matters most first: the end fades out if it’s long.</span>
      <div className="rf-list">
        {list.map((f, i) => {
          const info = FIELD_INFO[f.id];
          return (
            <div key={f.id} className={cx('rf-row', !f.on && 'off')}>
              <IBtn icon={f.on ? 'eye' : 'eyeOff'} label={`${f.on ? 'Hide' : 'Show'} ${info.label.toLowerCase()}`} tip={false} className={cx(f.on && 'on')}
                onClick={() => save(list.map(x => (x.id === f.id ? { ...x, on: !x.on } : x)))} />
              <Icon name={info.icon} size={18} className="rf-ic" />
              <span className="t-bm grow">{info.label}</span>
              <IBtn sm icon="chevUp" label={`Move ${info.label.toLowerCase()} up`} tip={false} disabled={i === 0} onClick={() => move(i, -1)} />
              <IBtn sm icon="chevDown" label={`Move ${info.label.toLowerCase()} down`} tip={false} disabled={i === list.length - 1} onClick={() => move(i, 1)} />
            </div>
          );
        })}
      </div>
    </>
  );
}
