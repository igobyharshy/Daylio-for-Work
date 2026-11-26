import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useUI } from '../app/ui';
import { Icon } from '../ui/Icon';
import { Btn, IBtn, Popover, Seg, Switch, cx, useAnchor } from '../ui/kit';
import { AddTaskBar, FilterButton, FilterChips, NothingRunning, ProjectLabel, RunCard, TaskBoard, TaskGroups, applyTaskFilter, EMPTY_FILTER, DueText, toneDot, type TaskFilter } from './tasks';
import { activeTask, archivedIds, hiddenTasks, isLive, myDayTasks, shownInMyDay } from '../lib/select';
import { CORE_STATUSES } from '../lib/types';
import { fmtDayLong, isDone, isOverdue, todayISO } from '../lib/time';
import { useMiniTimer } from './mini';
import { SampleBanner } from './common';
import { TimelineView } from './timeline';

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
function ViewOptions({ anchor, onClose, showRows }: { anchor: HTMLElement | null; onClose: () => void; showRows: boolean }) {
  const st = useStore();
  const nav = useNavigate();
  const list = st.settings.taskStatuses.filter(s => s.name !== 'Archived');
  const used = new Set(myDayTasks(st.tasks, st.projects).map(t => t.status));
  const set = (name: string, on: boolean) =>
    st.updateSettings({ taskStatuses: st.settings.taskStatuses.map(s => (s.name === name ? { ...s, myDay: on ? 'show' : 'hide' } : s)) });
  return (
    <Popover anchor={anchor} onClose={onClose} placement="below-end">
      <div className="menu view-opts" style={{ width: 320, padding: '12px 0 8px' }}>
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
        {showRows && <>
          <div className="divider" style={{ margin: '8px 0' }} />
          <span className="t-ts" style={{ padding: '0 16px' }}>Task details</span>
          <span className="t-bs c-muted" style={{ padding: '2px 16px 8px' }}>Project, dates, due and estimate on each row.</span>
          <div style={{ padding: '0 16px 4px' }}>
            <Seg value={st.settings.rowDetails ?? 'hover'} onChange={v => st.updateSettings({ rowDetails: v })} items={[{ value: 'hover', label: 'On hover' }, { value: 'always', label: 'Always' }]} />
          </div>
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
  const arch = useMemo(() => archivedIds(st.projects), [st.projects]);
  const list = st.tasks.filter(t => !isDone(t) && isLive(t, arch) && !(t.myDayDate && t.myDayDate <= today) && t.dueDate && t.dueDate <= today)
    .sort((x, y) => (x.dueDate ?? '').localeCompare(y.dueDate ?? ''));
  if (!list.length) return null;
  const overdue = list.filter(t => isOverdue(t, st.settings)).length;
  const add = (ids: string[]) => ids.forEach(id => st.updateTask(id, { myDayDate: today }));
  return (
    <div className="plan-line">
      <Icon name="event" />
      <span className="t-bm grow">{list.length} {list.length === 1 ? 'task is' : 'tasks are'} due today{overdue ? ` or overdue (${overdue} overdue)` : ''} but not on My Day.</span>
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
