import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useUI } from '../app/ui';
import { Icon } from '../ui/Icon';
import { Btn, IBtn, Popover, Seg, useAnchor } from '../ui/kit';
import { AddTaskBar, FilterButton, FilterChips, NothingRunning, ProjectLabel, RunCard, TaskBoard, TaskGroups, applyTaskFilter, EMPTY_FILTER, DueText, type TaskFilter } from './tasks';
import { activeTask, archivedIds, isLive, myDayTasks } from '../lib/select';
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

  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">My Day</span><span className="t-bm c-muted">{fmtDayLong(new Date())} · {left} to do{done ? ` · ${done} done` : ''}</span></div>
        <div className="actions">
          {view !== 'timeline' && <FilterButton value={filter} onChange={setFilter} showProjects />}
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
        : view === 'board' ? <TaskBoard tasks={tasks} /> : <TaskGroups tasks={tasks} carry scope="myday" />}
      <div className="grow" />
      <div className="bottom-bar"><AddTaskBar /></div>
    </>
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
