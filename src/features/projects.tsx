import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../ui/Toast';
import { useDragSort } from './dnd';
import { useIsMobile } from '../lib/native';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useUI } from '../app/ui';
import type { Cover, Project } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Confirm, Dialog, Field, IBtn, Lin, MenuList, Pill, Popover, Ring, Seg, Switch, Tag, cx, useAnchor, Empty } from '../ui/kit';
import { Calendar, TimeInput } from '../ui/pickers';
import { AddTaskBar, TaskBoard, TaskGroups, FilterButton, FilterChips, applyTaskFilter, EMPTY_FILTER, toneDot, type TaskFilter } from './tasks';
import { SampleBanner } from './common';
import { COVER_NAMES, coverColor, projectProgress, projectStats, statusTone } from '../lib/select';
import { fmtHHMM, fmtMin, fmtMs, fmtMonDay } from '../lib/time';

// 📥 is reserved for Inbox
const EMOJIS = ['📁', '🗂️', '📦', '🎬', '🎨', '✏️', '🖌️', '📷', '🎧', '🎵', '🌐', '🖥️', '📱', '⚙️', '🛠️', '🧪', '📈', '📊', '💼', '💰', '🧾', '📝', '📚', '🎓',
  '✦', '⭐', '🎯', '🚀', '💡', '🧭', '🗺️', '✈️', '🏠', '🌱', '🌿', '☕', '🍳', '🏃', '🧘', '❤️', '👥', '💬', '📣', '🔒', '🧩', '🎮', '📅', '🔥'];
const COVERS: Cover[] = ['purple', 'blue', 'teal', 'green', 'amber', 'rose', 'grey'];

export function datesText(p: Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>, withTime = false) {
  if (!p.startDate && !p.dueDate) return null;
  const a = p.startDate ? fmtMonDay(p.startDate) : null;
  const b = p.dueDate ? fmtMonDay(p.dueDate) + (withTime && p.dueTime ? ', ' + fmtHHMM(p.dueTime) : '') : null;
  return a && b ? `${a} → ${b}` : a ? `From ${a}` : `Due ${b}`;
}

// ---------- Dates popover (G16 / G18 / G20) ----------
export function DatesPopover({ value, onSave, onClose, anchor, placement = 'below-start' }: {
  value: Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>; onSave: (v: Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>) => void; onClose: () => void; anchor: HTMLElement | null; placement?: 'below-start' | 'right' | 'left';
}) {
  // starts empty on the current month: nothing is pre-filled
  const [start, setStart] = useState<string | null>(value.startDate);
  const [due, setDue] = useState<string | null>(value.dueDate);
  const [time, setTime] = useState(value.dueTime ?? '18:00');
  const [withTime, setWithTime] = useState(!!value.dueTime);
  const [active, setActive] = useState<'start' | 'due'>(value.startDate && !value.dueDate ? 'due' : value.dueDate ? 'due' : 'start');
  const pick = (iso: string) => {
    if (active === 'start') { setStart(iso); if (due && iso > due) setDue(null); setActive('due'); }
    else { if (start && iso < start) { setStart(iso); } else setDue(iso); }
  };
  const slot = (k: 'start' | 'due', label: string, v: string | null, clear: () => void) => (
    <button type="button" className={cx('date-slot state', active === k && 'active')} onClick={() => setActive(k)}>
      <span className="t-bs c-muted">{label}</span>
      <span className="row gap-4"><span className="t-ts">{v ? fmtMonDay(v) : 'Not set'}</span>{v && <span role="button" aria-label={`Clear ${label}`} className="x" onClick={e => { e.stopPropagation(); clear(); }}><Icon name="close" size={16} /></span>}</span>
    </button>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} placement={placement}>
      <div className="menu" style={{ width: 360, padding: '12px 16px 16px', gap: 8 }}>
        <div className="row gap-8">{slot('start', 'Start', start, () => setStart(null))}{slot('due', 'Due', due, () => setDue(null))}</div>
        <Calendar key={active} range={[start, due]} onPick={pick} month={(active === 'start' ? start : due) ?? undefined} />
        {due && <div className="row gap-12" style={{ minHeight: 48 }}><span className="t-bm grow">Due time</span><Switch on={withTime} onChange={setWithTime} label="Include a due time" />{withTime && <TimeInput value={time} onChange={setTime} label="Due time" />}</div>}
        <div className="dialog-actions">
          <Btn kind="text" onClick={() => { onSave({ startDate: null, dueDate: null, dueTime: null }); onClose(); }}>Remove dates</Btn>
          <span className="spacer" />
          <Btn onClick={() => { onSave({ startDate: start, dueDate: due, dueTime: due && withTime ? time : null }); onClose(); }}>Save</Btn>
        </div>
      </div>
    </Popover>
  );
}

export function StatusMenu({ anchor, onClose, value, onPick }: { anchor: HTMLElement | null; onClose: () => void; value: string; onPick: (s: string) => void }) {
  const st = useStore();
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <MenuList width={240} onClose={onClose} items={[{ label: 'Project status' }, ...st.settings.projectStatuses.map(s => ({
        t: s.name, sel: s.name === value, dot: `var(--${({ blue: 'primary', green: 'success', purple: 'tertiary', amber: 'warning', red: 'error', secondary: 'secondary' } as Record<string, string>)[s.tone] ?? 'outline'})`, onClick: () => onPick(s.name),
      }))]} />
    </Popover>
  );
}

function EmojiPicker({ anchor, onClose, onPick, value }: { anchor: HTMLElement | null; onClose: () => void; onPick: (e: string) => void; value?: string }) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="menu" style={{ padding: 12, width: 'auto' }}>
        <div className="t-lm c-muted" style={{ padding: '0 4px 8px' }}>Icon</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 40px)', gap: 4 }}>
          {EMOJIS.map(e => <button key={e} className={cx('ibtn state emoji', e === value && 'selected')} style={{ fontSize: 22 }} onClick={() => { onPick(e); onClose(); }} aria-label={`Icon ${e}`} aria-pressed={e === value}>{e}</button>)}
        </div>
      </div>
    </Popover>
  );
}
function CoverPicker({ anchor, onClose, onPick, value }: { anchor: HTMLElement | null; onClose: () => void; onPick: (c: Cover) => void; value: Cover }) {
  return (
    <Popover anchor={anchor} onClose={onClose} placement="below-end">
      <div className="menu" style={{ padding: 12, width: 'auto', minWidth: 0 }}>
        <div className="t-lm c-muted" style={{ padding: '0 4px 8px' }}>Cover</div>
        <div className="row gap-8">
          {COVERS.map(c => <button key={c} aria-label={`Cover ${COVER_NAMES[c]}`} data-tip={COVER_NAMES[c]} onClick={() => { onPick(c); onClose(); }} style={{ width: 40, height: 40, borderRadius: 12, background: coverColor[c][0], outline: c === value ? '2px solid var(--primary)' : '1px solid var(--outline-variant)', outlineOffset: 2 }} />)}
        </div>
      </div>
    </Popover>
  );
}

function TagsEditor({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const st = useStore();
  const a = useAnchor();
  const [q, setQ] = useState('');
  const opts = st.settings.projectTags.filter(t => !value.includes(t) && t.toLowerCase().includes(q.toLowerCase()));
  const add = (t: string) => { onChange([...value, t]); if (!st.settings.projectTags.includes(t)) st.updateSettings({ projectTags: [...st.settings.projectTags, t] }); setQ(''); a.close(); };
  return (
    <>
      {value.map(t => <Chip key={t} icon="tag" onRemove={() => onChange(value.filter(x => x !== t))}>{t}</Chip>)}
      <Btn kind="text" icon="add" onClick={e => a.open(e as any)}>Add tag</Btn>
      {a.isOpen && <Popover anchor={a.el} onClose={a.close}><MenuList width={240} onClose={a.close}
        header={<div style={{ padding: '4px 12px 8px' }}><Field sm value={q} onChange={setQ} placeholder="Find or create a tag" autoFocus bg="var(--surface-container)" onKeyDown={e => { if (e.key === 'Enter' && q.trim()) add(opts[0] ?? q.trim()); }} /></div>}
        items={[...opts.map(t => ({ t, ic: 'tag' as const, onClick: () => add(t) })), ...(q.trim() && !st.settings.projectTags.includes(q.trim()) ? [{ t: `Create “${q.trim()}”`, ic: 'add' as const, onClick: () => add(q.trim()) }] : []), ...(!opts.length && !q.trim() ? [{ note: 'All tags added.' }] : [])]} /></Popover>}
    </>
  );
}

// ---------- New project (E39 / G14 / G15 / G17 / G16 / G18) ----------
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [cover, setCover] = useState<Cover>('purple');
  const [status, setStatus] = useState('Not started');
  const [dates, setDates] = useState<Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>>({ startDate: null, dueDate: null, dueTime: null });
  const [tags, setTags] = useState<string[]>(st.settings.projectDefaultTags);
  const ea = useAnchor(), ca = useAnchor(), sa = useAnchor(), da = useAnchor();
  const create = () => { if (!name.trim()) return; const p = st.addProject({ name: name.trim(), emoji, cover, status, tags, ...dates }); onClose(); nav(`/projects/${p.id}`); };
  return (
    <Dialog onClose={onClose} width={560} className="" label="New project">
      <div style={{ margin: -24, marginBottom: 0, position: 'relative' }}>
        <div style={{ height: 112, background: coverColor[cover][0], borderRadius: '24px 24px 0 0', position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', padding: 12 }}>
          <Btn kind="elevated" icon="palette" onClick={e => ca.open(e as any)}>Cover</Btn>
        </div>
        <button onClick={e => ea.open(e)} aria-label="Change icon" data-tip="Change icon"
          style={{ position: 'absolute', left: 24, top: 92, width: 72, height: 72, borderRadius: 16, background: 'var(--surface-lowest)', boxShadow: 'var(--elev-2)', display: 'grid', placeItems: 'center' }}>
          <span className="emoji" style={{ fontSize: 36 }}>{emoji}</span>
          <span style={{ position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: 14, background: 'var(--primary)', color: 'var(--on-primary)', display: 'grid', placeItems: 'center' }}><Icon name="edit" size={16} /></span>
        </button>
      </div>
      <div style={{ height: 40 }} />
      <input className="inline-input t-hm" placeholder="Project name" value={name} onChange={e => setName(e.target.value)} autoFocus aria-label="Project name" onKeyDown={e => { if (e.key === 'Enter') create(); }} />
      <div className="col">
        <div className="prop-row"><span className="k"><Icon name="flag" />Status</span><div className="v"><Pill name={status} tone={statusTone(status, st.settings.projectStatuses)} menu onClick={e => sa.open(e)} /></div></div>
        <div className="prop-row"><span className="k"><Icon name="event" />Dates</span><div className="v">{datesText(dates) ? <button className="select-btn state" onClick={e => da.open(e)}><Icon name="event" />{datesText(dates, true)}</button> : <Btn kind="text" icon="add" onClick={e => da.open(e as any)}>Add dates</Btn>}</div></div>
        <div className="prop-row" style={{ alignItems: 'flex-start', paddingTop: 8 }}><span className="k" style={{ minHeight: 32 }}><Icon name="tag" />Tags</span><div className="v col" style={{ alignItems: 'flex-start' }}><div className="row gap-8" style={{ flexWrap: 'wrap' }}><TagsEditor value={tags} onChange={setTags} /></div>{st.settings.projectDefaultTags.length > 0 && <span className="t-bs c-muted">“{st.settings.projectDefaultTags.join('”, “')}” comes from Settings → Default tags</span>}</div></div>
      </div>
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn disabled={!name.trim()} onClick={create}>Create project</Btn></div>
      {ea.isOpen && <EmojiPicker anchor={ea.el} onClose={ea.close} onPick={setEmoji} value={emoji} />}
      {ca.isOpen && <CoverPicker anchor={ca.el} onClose={ca.close} onPick={setCover} value={cover} />}
      {sa.isOpen && <StatusMenu anchor={sa.el} onClose={sa.close} value={status} onPick={setStatus} />}
      {da.isOpen && <DatesPopover anchor={da.el} onClose={da.close} value={dates} onSave={setDates} placement="right" />}
    </Dialog>
  );
}

// ---------- project actions (archive / status / delete) ----------
export function useProjectActions() {
  const st = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [del, setDel] = useState<Project | null>(null);
  const [doneAsk, setDoneAsk] = useState<{ p: Project; status: string; open: number } | null>(null);
  const archive = (p: Project) => {
    const on = !p.archived;
    st.updateProject(p.id, { archived: on });
    toast.show(on ? `Archived “${p.name}”. Its tasks are off My Day and won’t remind you.` : `“${p.name}” is back`, { icon: 'inbox', action: { label: 'Undo', onClick: () => st.updateProject(p.id, { archived: !on }) } });
  };
  const setStatus = (p: Project, status: string) => {
    const open = projectProgress(st.tasks, p).open;
    if (status === 'Done' && open > 0) { setDoneAsk({ p, status, open }); return; }
    st.updateProject(p.id, { status });
  };
  const dialogs = (
    <>
      {del && <DeleteProjectDialog p={del} onClose={() => setDel(null)} onDone={() => nav('/projects')} />}
      {doneAsk && <Confirm title={`Mark “${doneAsk.p.name}” done?`} body={`${doneAsk.open} ${doneAsk.open === 1 ? 'task is' : 'tasks are'} still open. They stay open; only the project status changes.`} confirm="Mark done"
        onClose={() => setDoneAsk(null)} onConfirm={() => st.updateProject(doneAsk.p.id, { status: doneAsk.status })} />}
    </>
  );
  return { archive, setStatus, remove: (p: Project) => setDel(p), dialogs };
}

function DeleteProjectDialog({ p, onClose, onDone }: { p: Project; onClose: () => void; onDone: () => void }) {
  const st = useStore();
  const toast = useToast();
  const n = st.tasks.filter(t => t.projectId === p.id).length;
  const [mode, setMode] = useState<'move' | 'delete'>('move');
  const opt = (m: 'move' | 'delete', title: string, sub: string) => (
    <button type="button" className={cx('choice state', mode === m && 'on')} onClick={() => setMode(m)} aria-pressed={mode === m}>
      <Icon name={mode === m ? 'radioOn' : 'circle'} /><span className="col"><span className="t-ts">{title}</span><span className="t-bs c-muted">{sub}</span></span>
    </button>
  );
  return (
    <Dialog onClose={onClose} width={440} label={`Delete ${p.name}`}>
      <div className="t-hs">Delete “{p.name}”?</div>
      {n > 0 ? (
        <div className="col gap-8">
          <span className="t-bm c-muted">It has {n} {n === 1 ? 'task' : 'tasks'}. What should happen to {n === 1 ? 'it' : 'them'}?</span>
          {opt('move', `Move ${n === 1 ? 'it' : `all ${n}`} to Inbox`, 'Keeps the tasks and their time history')}
          {opt('delete', `Delete ${n === 1 ? 'it' : `all ${n}`} too`, 'Journal entries stay but lose the link')}
        </div>
      ) : <span className="t-bm c-muted">The project has no tasks.</span>}
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn>
        <Btn kind="error" onClick={() => {
          const undo = st.removeProject(p.id, mode);
          onClose(); onDone();
          toast.show(`Deleted “${p.name}”${n && mode === 'move' ? ` · ${n} ${n === 1 ? 'task' : 'tasks'} moved to Inbox` : ''}`, { icon: 'trash', action: { label: 'Undo', onClick: undo }, duration: 6000 });
        }}>Delete project</Btn>
      </div>
    </Dialog>
  );
}

/** ⋮ menu on every project row / card / board card */
function ProjectMenu({ p, anchor, onClose, acts }: { p: Project; anchor: HTMLElement | null; onClose: () => void; acts: ReturnType<typeof useProjectActions> }) {
  const st = useStore();
  const nav = useNavigate();
  const items = p.isInbox ? [{ t: 'Open', ic: 'open' as const, onClick: () => nav(`/projects/${p.id}`) }, { note: 'Inbox can’t be archived or deleted.' }] : [
    { t: 'Open', ic: 'open' as const, onClick: () => nav(`/projects/${p.id}`) },
    { label: 'Status' },
    ...st.settings.projectStatuses.map(s => ({ t: s.name, dot: toneDot(s.tone), sel: p.status === s.name, onClick: () => acts.setStatus(p, s.name) })),
    { divider: true },
    { t: p.archived ? 'Unarchive' : 'Archive', ic: 'inbox' as const, onClick: () => acts.archive(p) },
    { t: 'Delete…', ic: 'trash' as const, danger: true, onClick: () => acts.remove(p) },
  ];
  return <Popover anchor={anchor} onClose={onClose} placement="below-end"><MenuList width={240} onClose={onClose} items={items} /></Popover>;
}
function ProjectMore({ p, acts, sm }: { p: Project; acts: ReturnType<typeof useProjectActions>; sm?: boolean }) {
  const a = useAnchor();
  return (
    <span className="no-drag" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <IBtn sm={sm} icon="moreV" label="Project options" className="row-more" kind={a.isOpen ? 'selected' : 'standard'} onClick={e => a.open(e)} />
      {a.isOpen && <ProjectMenu p={p} anchor={a.el} onClose={a.close} acts={acts} />}
    </span>
  );
}

// ---------- Projects (E30 / E31 / G03) ----------
type Sort = 'manual' | 'name' | 'due' | 'progress';
export function ProjectsPage() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const acts = useProjectActions();
  const view = st.settings.projectsView;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>(() => { try { return (localStorage.getItem('ot-project-sort') as Sort) || 'manual'; } catch { return 'manual'; } });
  const [showArchived, setShowArchived] = useState(false);
  const sa = useAnchor();
  const archivedCount = st.projects.filter(p => p.archived && !p.isInbox).length;
  const activeCount = st.projects.filter(p => !p.archived && !p.isInbox).length;
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const l = st.projects
      .filter(p => showArchived || !p.archived)
      .filter(p => !ql || p.name.toLowerCase().includes(ql) || p.tags.some(t => t.toLowerCase().includes(ql)));
    const by: Record<Sort, (a: Project, b: Project) => number> = {
      manual: (a, b) => a.sort - b.sort,
      name: (a, b) => a.name.localeCompare(b.name),
      due: (a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'),
      progress: (a, b) => projectProgress(st.tasks, b).pct - projectProgress(st.tasks, a).pct,
    };
    return l.sort((a, b) => Number(b.isInbox) - Number(a.isInbox) || Number(a.archived) - Number(b.archived) || by[sort](a, b));
  }, [st.projects, st.tasks, q, sort, showArchived]);
  const sub = `${activeCount} ${activeCount === 1 ? 'project' : 'projects'}${archivedCount ? ` · ${archivedCount} archived` : ''}`;
  const sortLabel = { manual: 'Manual', name: 'Name', due: 'Due date', progress: 'Progress' }[sort];
  const setSortP = (s: Sort) => { setSort(s); try { localStorage.setItem('ot-project-sort', s); } catch { /* ignore */ } };
  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">Projects</span><span className="t-bm c-muted">{sub}</span></div>
        <div className="actions">
          <Seg value={view} onChange={v => st.updateSettings({ projectsView: v })} items={[{ value: 'list', icon: 'list', tip: 'List' }, { value: 'gallery', icon: 'gallery', tip: 'Gallery' }, { value: 'board', icon: 'board', tip: 'Board' }]} />
          <Btn icon="add" onClick={() => ui.setNewProject(true)}>New project</Btn>
        </div>
      </div>
      <SampleBanner />
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        <Field sm lead="search" value={q} onChange={setQ} placeholder="Find a project" style={{ width: 280 }} />
        {view !== 'board' && <Chip icon="sort" onClick={e => sa.open(e)} trail="chevDown">Sort: {sortLabel}</Chip>}
        {archivedCount > 0 && <Chip icon="inbox" sel={showArchived} onClick={() => setShowArchived(!showArchived)}>Show archived ({archivedCount})</Chip>}
      </div>
      {sa.isOpen && <Popover anchor={sa.el} onClose={sa.close}><MenuList width={220} onClose={sa.close} items={(['manual', 'name', 'due', 'progress'] as Sort[]).map(s => ({ t: { manual: 'Manual', name: 'Name', due: 'Due date', progress: 'Progress' }[s], sel: sort === s, onClick: () => setSortP(s) }))} /></Popover>}
      {list.length === 0 && <Empty icon="folder" title={q ? `No projects match “${q}”` : 'No projects yet'} action={!q ? <Btn icon="add" onClick={() => ui.setNewProject(true)}>New project</Btn> : undefined} />}
      {view === 'list' && list.length > 0 && <ProjectTable list={list} acts={acts} />}
      {view === 'gallery' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {list.map(p => <ProjectCard key={p.id} p={p} acts={acts} onClick={() => nav(`/projects/${p.id}`)} />)}
        </div>
      )}
      {view === 'board' && <ProjectBoard list={list.filter(p => !p.isInbox)} acts={acts} />}
      {acts.dialogs}
    </>
  );
}

function ProjectTable({ list, acts }: { list: Project[]; acts: ReturnType<typeof useProjectActions> }) {
  const st = useStore();
  const nav = useNavigate();
  const [menu, setMenu] = useState<{ p: Project; el: HTMLElement } | null>(null);
  const cols = 'minmax(200px, 2fr) minmax(120px, 1.3fr) 140px 150px 48px 150px 40px';
  const mobile = useIsMobile();
  // phones: one tidy line per project (name, then status · open · progress)
  if (mobile) return (
    <div className="col gap-4">
      {list.map(p => {
        const pr = projectProgress(st.tasks, p);
        return (
          <div key={p.id} role="button" tabIndex={0} className={cx('proj-row state row gap-12', p.archived && 'archived')} onClick={() => nav(`/projects/${p.id}`)} style={{ minHeight: 64, paddingLeft: 10 }}>
            <span className="emoji" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 20, background: coverColor[p.cover]?.[0], flex: 'none' }}>{p.emoji}</span>
            <span className="col grow" style={{ minWidth: 0, gap: 2 }}>
              <span className="row gap-6" style={{ minWidth: 0 }}><span className="t-tm ellipsis" style={{ fontSize: 15 }}>{p.name}</span>{p.isInbox && <Tag kind="pc">default</Tag>}{p.archived && <Tag>Archived</Tag>}</span>
              <span className="meta">
                {!p.isInbox && <span className="m"><span className="dot" style={{ background: toneDot(statusTone(p.status, st.settings.projectStatuses)) }} />{p.status}</span>}
                {!p.isInbox && <span className="sep">·</span>}
                <span className="m">{pr.open} open</span>
                {!p.isInbox && <><span className="sep">·</span><span className="m">{pr.pct}% done</span></>}
                {p.tags.length > 0 && <><span className="sep">·</span><span className="m ellipsis">{p.tags.join(', ')}</span></>}
              </span>
            </span>
            <ProjectMore p={p} acts={acts} sm />
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="col gap-8">
      <div className="t-lm c-muted" style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '0 12px 0 20px', height: 24, alignItems: 'center' }}>
        <span>Project</span><span>Tags</span><span>Status</span><span>Dates</span><span>Open</span><span>Progress</span><span />
      </div>
      {list.map(p => {
        const pr = projectProgress(st.tasks, p);
        return (
          <div key={p.id} role="button" tabIndex={0} className={cx('proj-row state', p.archived && 'archived')} onClick={() => nav(`/projects/${p.id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/projects/${p.id}`); }}
            style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center' }}>
            <span className="row gap-12" style={{ minWidth: 0 }}>
              <span className="emoji" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 20, background: coverColor[p.cover]?.[0], flex: 'none' }}>{p.emoji}</span>
              <span className="t-tm ellipsis">{p.name}</span>{p.isInbox && <Tag kind="pc">default</Tag>}{p.archived && <Tag>Archived</Tag>}
            </span>
            <span className="row gap-6" style={{ flexWrap: 'wrap' }}>{p.tags.length ? p.tags.map(t => <Tag key={t}>{t}</Tag>) : <span className="c-faint">—</span>}</span>
            <span>{p.isInbox ? <span className="c-faint">—</span> : <span onClick={e => { e.stopPropagation(); setMenu({ p, el: e.currentTarget.firstElementChild as HTMLElement }); }}><Pill name={p.status} tone={statusTone(p.status, st.settings.projectStatuses)} menu onClick={() => { /* handled by wrapper */ }} /></span>}</span>
            <span className="t-bm c-muted">{datesText(p) ?? <span className="c-faint">—</span>}</span>
            <span className="t-bm">{pr.open}</span>
            {p.isInbox ? <span className="c-faint">—</span> : <span className="row gap-8"><Lin pct={pr.pct} style={{ width: 96 }} /><span className="t-lm c-muted">{pr.pct}%</span></span>}
            <ProjectMore p={p} acts={acts} sm />
          </div>
        );
      })}
      {menu && <StatusMenu anchor={menu.el} onClose={() => setMenu(null)} value={menu.p.status} onPick={s => acts.setStatus(menu.p, s)} />}
    </div>
  );
}

export function ProjectCard({ p, onClick, compact, acts }: { p: Project; onClick: () => void; compact?: boolean; acts: ReturnType<typeof useProjectActions> }) {
  const st = useStore();
  const pr = projectProgress(st.tasks, p);
  return (
    <div role="button" tabIndex={0} className={cx('state col proj-card', p.archived && 'archived')} onClick={onClick} onKeyDown={e => { if (e.key === 'Enter') onClick(); }}
      style={{ width: '100%', textAlign: 'left', borderRadius: 16, overflow: 'hidden', background: compact ? 'var(--surface-lowest)' : 'var(--surface-low)', boxShadow: compact ? '0 1px 2px rgb(0 0 0 / 0.08)' : undefined, cursor: 'pointer' }}>
      {compact ? (
        <div className="row gap-6 t-lm" style={{ height: 36, padding: '0 4px 0 12px', background: coverColor[p.cover]?.[0], color: coverColor[p.cover]?.[1] }}><Icon name="event" size={16} /><span className="grow">{datesText(p) ?? 'No dates'}</span><ProjectMore p={p} acts={acts} sm /></div>
      ) : <div className="row" style={{ height: 88, background: coverColor[p.cover]?.[0], justifyContent: 'flex-end', alignItems: 'flex-start', padding: 8 }}><ProjectMore p={p} acts={acts} /></div>}
      <div className="col gap-8" style={{ padding: compact ? 12 : '0 16px 16px', position: 'relative', flex: 1 }}>
        {compact ? <span className="row gap-8"><span className="emoji" style={{ fontSize: 18 }}>{p.emoji}</span><span className="t-ts">{p.name}</span></span> : (
          <>
            <span className="emoji" style={{ width: 48, height: 48, marginTop: -24, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 24, background: 'var(--surface-lowest)', boxShadow: 'var(--elev-1)' }}>{p.emoji}</span>
            <span className="row gap-8"><span className="t-tm">{p.name}</span>{p.isInbox && <Tag kind="pc">default</Tag>}{p.archived && <Tag>Archived</Tag>}</span>
          </>
        )}
        {p.tags.length > 0 && <span className="row gap-6" style={{ flexWrap: 'wrap' }}>{p.tags.map(t => <Tag key={t}>{t}</Tag>)}</span>}
        {!compact && !p.isInbox && <span className="row gap-8"><Pill name={p.status} tone={statusTone(p.status, st.settings.projectStatuses)} /><span className="t-bs c-muted">{datesText(p) ?? 'No dates'}</span></span>}
        <span className="grow" />
        {p.isInbox ? <span className="t-bs c-muted">{pr.open} open {pr.open === 1 ? 'task' : 'tasks'}</span> : <>
          <Lin pct={pr.pct} />
          <span className="t-bs c-muted">{pr.pct}% · {pr.done} of {pr.total} done</span>
        </>}
      </div>
    </div>
  );
}

function ProjectBoard({ list, acts }: { list: Project[]; acts: ReturnType<typeof useProjectActions> }) {
  const st = useStore();
  const nav = useNavigate();
  const [addStatus, setAddStatus] = useState(false);
  const [newName, setNewName] = useState('');
  const drag = useDragSort((id, group, before) => {
    const p = st.projectById(id); if (!p) return;
    const col = list.filter(x => x.status === group && x.id !== id);
    const idx = before ? Math.max(0, col.findIndex(x => x.id === before)) : col.length;
    const a = col[idx - 1], b = col[idx];
    const sortV = a && b ? (a.sort + b.sort) / 2 : a ? a.sort + 1 : b ? b.sort - 1 : p.sort;
    st.updateProject(id, { sort: sortV });
    if (p.status !== group) acts.setStatus(p, group);
  });
  return (
    <div className="board">
      {st.settings.projectStatuses.map(s => {
        const items = list.filter(p => p.status === s.name).sort((a, b) => a.sort - b.sort);
        return (
          <div key={s.name} className="board-col" data-drop-group={s.name}>
            <div className="board-col-head"><Pill name={s.name} tone={s.tone} /><span className="count">{items.length}</span></div>
            {items.map(p => <div key={p.id} {...drag(p.id)}><ProjectCard p={p} compact acts={acts} onClick={() => nav(`/projects/${p.id}`)} /></div>)}
            {!items.length && <div className="drop-hint">Drag projects here</div>}
          </div>
        );
      })}
      <div style={{ width: 200, flex: 'none' }}>
        {addStatus ? (
          <div className="col gap-8"><Field sm value={newName} onChange={setNewName} placeholder="Status name" autoFocus onKeyDown={e => {
            if (e.key === 'Enter' && newName.trim()) { st.updateSettings({ projectStatuses: [...st.settings.projectStatuses, { name: newName.trim(), tone: 'neutral' }] }); setNewName(''); setAddStatus(false); }
            if (e.key === 'Escape') setAddStatus(false);
          }} /><span className="t-bs c-muted">Press Enter to add</span></div>
        ) : <Btn kind="text" icon="add" onClick={() => setAddStatus(true)}>Add status</Btn>}
      </div>
    </div>
  );
}

// ---------- Project page (F09 / F10 / G19 / G20 / G02 / G05 / E33 / E35) ----------
export function ProjectPage() {
  const { id } = useParams();
  const st = useStore();
  const nav = useNavigate();
  const acts = useProjectActions();
  const p = st.projectById(id);
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  // list / board is remembered per project
  const [view, setViewS] = useState<'list' | 'board'>(() => { try { return (localStorage.getItem(`ot-pview-${id}`) as 'list' | 'board') || 'list'; } catch { return 'list'; } });
  const setView = (v: 'list' | 'board') => { setViewS(v); try { localStorage.setItem(`ot-pview-${id}`, v); } catch { /* ignore */ } };
  const [name, setName] = useState(p?.name ?? '');
  const sa = useAnchor(), da = useAnchor(), ea = useAnchor(), ca = useAnchor();
  useEffect(() => setName(p?.name ?? ''), [p?.id, p?.name]);
  useEffect(() => { try { setViewS((localStorage.getItem(`ot-pview-${id}`) as 'list' | 'board') || 'list'); } catch { /* ignore */ } setFilter(EMPTY_FILTER); }, [id]);
  const all = useMemo(() => st.tasks.filter(t => t.projectId === id && t.status !== 'Archived'), [st.tasks, id]);
  if (!p) return <Empty icon="folder" title="Project not found" body="It may have been deleted on another device." action={<Btn kind="tonal" onClick={() => nav('/projects')}>All projects</Btn>} />;
  const tasks = applyTaskFilter(all, filter, st.settings);
  const pr = projectProgress(st.tasks, p);
  const stats = projectStats(st.tasks, p);
  const allDone = pr.total > 0 && pr.open === 0 && p.status !== 'Done' && !p.isInbox;

  return (
    <>
      <div className="breadcrumb"><button className="state" onClick={() => nav('/projects')}>Projects</button><Icon name="chevRight" /><span className="row gap-6"><span className="emoji">{p.emoji}</span>{p.name}</span></div>
      {p.archived && (
        <div className="plan-line"><Icon name="inbox" /><span className="t-bm grow">This project is archived. Its tasks are off My Day and won’t send reminders.</span><Btn kind="tonal" onClick={() => acts.archive(p)}>Unarchive</Btn></div>
      )}
      {!p.isInbox && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div className="row" style={{ height: 80, borderRadius: 16, background: coverColor[p.cover]?.[0], justifyContent: 'flex-end', alignItems: 'flex-start', padding: 12 }}>
            <Btn kind="elevated" icon="palette" onClick={e => ca.open(e as any)}>Cover</Btn>
          </div>
          <button onClick={e => ea.open(e)} aria-label="Change icon" data-tip="Change icon" style={{ position: 'absolute', left: 20, bottom: -22, width: 52, height: 52, borderRadius: 12, background: 'var(--surface-lowest)', boxShadow: 'var(--elev-2)', display: 'grid', placeItems: 'center' }}>
            <span className="emoji" style={{ fontSize: 28 }}>{p.emoji}</span>
          </button>
        </div>
      )}
      <div className="col gap-12">
        <div className="page-head" style={{ alignItems: 'center' }}>
          <div className="title">
            <input className="inline-input t-hm" value={name} disabled={p.isInbox} aria-label="Project name" onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== p.name ? st.updateProject(p.id, { name: name.trim() }) : setName(p.name)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ color: 'var(--on-surface)' }} />
          </div>
          <div className="actions" style={{ gap: 16 }}>
            {p.isInbox
              ? <span className="t-ts">{pr.open} open {pr.open === 1 ? 'task' : 'tasks'}</span>
              : <div className="row gap-12">
                  <Ring pct={pr.pct} size={56} stroke={6}><span className="t-lm">{pr.pct}%</span></Ring>
                  <div className="col"><span className="t-ts">{pr.done} of {pr.total} done</span><span className="t-bs c-muted">{pr.open} {pr.open === 1 ? 'task' : 'tasks'} left</span></div>
                </div>}
            <span style={{ width: 1, height: 32, background: 'var(--outline-variant)' }} />
            <FilterButton value={filter} onChange={setFilter} showMyDay />
            <Seg value={view} onChange={setView} items={[{ value: 'list', icon: 'list', tip: 'List' }, { value: 'board', icon: 'board', tip: 'Board' }]} />
            <ProjectMore p={p} acts={acts} />
          </div>
        </div>
        {!p.isInbox ? (
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            <TagsEditor value={p.tags} onChange={tags => st.updateProject(p.id, { tags })} />
            <Pill name={p.status} tone={statusTone(p.status, st.settings.projectStatuses)} menu onClick={e => sa.open(e)} />
            <button className={cx('select-btn outlined state', da.isOpen && 'active')} style={{ height: 32 }} onClick={e => da.open(e)}><Icon name="event" />{datesText(p, true) ?? 'Add dates'}</button>
          </div>
        ) : <span className="t-bm c-muted">Tasks without a project land here. Inbox can’t be deleted.</span>}
        {(stats.estMin > 0 || stats.spentMs > 0) && (
          <div className="row gap-24 t-bm c-muted" style={{ flexWrap: 'wrap' }}>
            <span>Estimated <b className="c-on">{fmtMin(stats.estMin)}</b></span>
            <span>Spent <b className="c-on">{fmtMs(stats.spentMs)}</b></span>
            {stats.pct != null && <span><b className="c-on">{stats.pct}%</b> of {stats.scored} finished {stats.scored === 1 ? 'task' : 'tasks'} within estimate</span>}
          </div>
        )}
        {allDone && <div className="plan-line"><Icon name="doneAll" /><span className="t-bm grow">Every task here is done.</span><Btn kind="tonal" onClick={() => st.updateProject(p.id, { status: 'Done' })}>Mark project Done</Btn></div>}
      </div>
      <FilterChips value={filter} onChange={setFilter} shown={tasks.length} total={all.length} />

      {all.length === 0
        ? <Empty icon="checklist" title="No tasks yet" body={p.archived ? 'Unarchive the project to add tasks.' : 'Add one below.'} />
        : view === 'board' ? <TaskBoard tasks={tasks} showProject={false} /> : <TaskGroups tasks={tasks} showProject={false} showSun scope={`p-${p.id}`} />}
      <div className="grow" />
      {!p.archived && <div className="bottom-bar"><AddTaskBar projectId={p.id} label={`Add a task to ${p.name}`} inMyDay={false} /></div>}

      {sa.isOpen && <StatusMenu anchor={sa.el} onClose={sa.close} value={p.status} onPick={s => acts.setStatus(p, s)} />}
      {da.isOpen && <DatesPopover anchor={da.el} onClose={da.close} value={p} onSave={v => st.updateProject(p.id, v)} />}
      {ea.isOpen && <EmojiPicker anchor={ea.el} onClose={ea.close} onPick={e => st.updateProject(p.id, { emoji: e })} value={p.emoji} />}
      {ca.isOpen && <CoverPicker anchor={ca.el} onClose={ca.close} value={p.cover} onPick={c => st.updateProject(p.id, { cover: c })} />}
      {acts.dialogs}
    </>
  );
}
