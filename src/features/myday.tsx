import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../ui/Icon';
import { IBtn, MenuList, Popover, Seg, Chip, useAnchor, Empty } from '../ui/kit';
import { AddTaskBar, NothingRunning, RunCard, TaskBoard, TaskRow } from './tasks';
import { activeTask, myDayTasks } from '../lib/select';
import { fmtDayLong, isDone, startBy } from '../lib/time';
import { useMiniTimer } from './mini';

export function MyDayPage() {
  const st = useStore();
  const mini = useMiniTimer();
  const [tag, setTag] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(true);
  const fa = useAnchor();
  const view = st.settings.myDayView;
  const all = myDayTasks(st.tasks);
  const tasks = tag ? all.filter(t => st.projectById(t.projectId)?.tags.includes(tag)) : all;
  const active = activeTask(st.tasks);
  const open = tasks.filter(t => !isDone(t) && t.id !== active?.id)
    .sort((a, b) => (startBy(a, st.settings)?.getTime() ?? Infinity) - (startBy(b, st.settings)?.getTime() ?? Infinity) || a.sort - b.sort);
  const done = tasks.filter(isDone).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const left = all.filter(t => !isDone(t)).length;
  const tags = useMemo(() => [...new Set(st.projects.flatMap(p => p.tags))], [st.projects]);
  const boardCols = useMemo(() => {
    const core = ['Not started', 'In progress', 'Done'];
    const present = new Set(tasks.map(t => t.status));
    return st.settings.taskStatuses.map(s => s.name).filter(n => core.includes(n) || (present.has(n) && n !== 'Archived'));
  }, [tasks, st.settings.taskStatuses]);

  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">My Day</span><span className="t-bm c-muted">{fmtDayLong(new Date())} · {left} {left === 1 ? 'task' : 'tasks'} left</span></div>
        <div className="actions">
          <IBtn icon="filter" label="Filter by project tag" kind={tag || fa.isOpen ? 'selected' : 'outlined'} onClick={e => fa.open(e)} />
          <Seg value={view} onChange={v => st.updateSettings({ myDayView: v })} items={[{ value: 'list', icon: 'list', tip: 'List' }, { value: 'board', icon: 'board', tip: 'Board' }]} />
        </div>
      </div>
      {tag && <div className="row gap-8"><Chip icon="tag" sel onRemove={() => setTag(null)}>{tag}</Chip><span className="t-bs c-muted">{tasks.length} of {all.length} tasks</span></div>}

      {view === 'board' ? <TaskBoard tasks={tasks} columns={boardCols} /> : (
        <>
          <div className="col gap-8">
            <div className="section-label">In progress</div>
            {active ? <RunCard t={active} onPopOut={() => mini.open()} /> : <NothingRunning />}
          </div>
          <div className="col gap-8">
            <div className="section-label">Up next <span className="n">{open.length}</span></div>
            {open.length ? <div className="list">{open.map(t => <TaskRow key={t.id} t={t} />)}</div>
              : <Empty icon="sun" title={all.length ? 'Nothing else planned' : 'Plan your day'} body={all.length ? 'Add a task below, or pick one from a project with ☀.' : 'Add what you will do today. Give each task an estimate, then press ▶ and try to beat it.'} />}
          </div>
          {done.length > 0 && (
            <div className="col gap-8">
              <button className="row gap-8 state" style={{ height: 40, padding: '0 12px 0 8px', borderRadius: 20, alignSelf: 'flex-start' }} onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                <Icon name={showDone ? 'chevDown' : 'chevRight'} size={20} style={{ color: 'var(--on-surface-variant)' }} />
                <span className="t-ts c-muted">Completed</span><span className="t-ts c-faint">{done.length}</span>
              </button>
              {showDone && <div className="list">{done.map(t => <TaskRow key={t.id} t={t} />)}</div>}
            </div>
          )}
        </>
      )}
      <div className="grow" />
      <div className="bottom-bar"><AddTaskBar /></div>

      {fa.isOpen && (
        <Popover anchor={fa.el} onClose={fa.close} placement="below-end">
          <MenuList width={280} onClose={fa.close} items={[
            { label: 'Show projects tagged' },
            ...tags.map(t => ({ t, ic: 'tag' as const, sel: tag === t, sup: String(all.filter(x => st.projectById(x.projectId)?.tags.includes(t)).length), onClick: () => setTag(tag === t ? null : t) })),
            { divider: true }, { t: 'Show all', ic: 'close', disabled: !tag, onClick: () => setTag(null) },
          ]} />
        </Popover>
      )}
    </>
  );
}
