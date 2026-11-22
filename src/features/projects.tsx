import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useUI } from '../app/ui';
import type { Cover, Project } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Confirm, Dialog, Field, IBtn, Lin, MenuList, Pill, Popover, Ring, Seg, Switch, Tag, cx, useAnchor, Empty } from '../ui/kit';
import { Calendar, TimeInput } from '../ui/pickers';
import { AddTaskBar, TaskBoard, TaskRow } from './tasks';
import { coverColor, projectProgress, statusTone } from '../lib/select';
import { addDays, fmtHHMM, fmtMonDay, isDone, isOverdue, isoDate, todayISO } from '../lib/time';

const EMOJIS = ['📁', '🎬', '🌐', '✦', '🏠', '📦', '📥', '🎨', '✏️', '📷', '🎧', '💼', '📈', '🧪', '🛠️', '📚', '🧭', '🚀', '💡', '🗂️', '🖥️', '📝', '🎯', '🌱'];
const COVERS: Cover[] = ['blue', 'teal', 'green', 'amber', 'rose', 'purple', 'grey'];

export function datesText(p: Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>) {
  if (!p.startDate && !p.dueDate) return null;
  const a = p.startDate ? fmtMonDay(p.startDate) : null;
  const b = p.dueDate ? fmtMonDay(p.dueDate) + (p.dueTime ? ', ' + fmtHHMM(p.dueTime) : '') : null;
  return a && b ? `${a} → ${b}` : a ? `From ${a}` : `Due ${b}`;
}

// ---------- Dates popover (G16 / G18 / G20) ----------
export function DatesPopover({ value, onSave, onClose, anchor, placement = 'below-start' }: {
  value: Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>; onSave: (v: Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>) => void; onClose: () => void; anchor: HTMLElement | null; placement?: 'below-start' | 'right' | 'left';
}) {
  const [useStart, setUseStart] = useState(!!value.startDate);
  const [useDue, setUseDue] = useState(!!value.dueDate || !value.startDate);
  const [start, setStart] = useState(value.startDate ?? todayISO());
  const [due, setDue] = useState(value.dueDate ?? isoDate(addDays(new Date(), 14)));
  const [time, setTime] = useState(value.dueTime ?? '18:00');
  const [active, setActive] = useState<'start' | 'due'>(value.startDate && !value.dueDate ? 'start' : 'due');
  const pick = (iso: string) => {
    if (active === 'start' && useStart) { setStart(iso); if (useDue && iso > due) setDue(iso); setActive('due'); }
    else { setUseDue(true); setDue(iso); if (useStart && iso < start) setStart(iso); }
  };
  const box = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button type="button" className="row gap-8" onClick={() => set(!on)} aria-pressed={on}>
      <Icon name={on ? 'checkCircle' : 'circle'} style={{ color: on ? 'var(--primary)' : 'var(--outline)' }} /><span className="t-ts">{label}</span>
    </button>
  );
  return (
    <Popover anchor={anchor} onClose={onClose} placement={placement}>
      <div className="menu" style={{ width: 360, padding: '12px 16px 16px', gap: 8 }}>
        <div className="t-lm c-muted">Dates</div>
        <Calendar range={[useStart ? start : null, useDue ? due : null]} onPick={pick} month={active === 'start' ? start : due} />
        <div className="row gap-12" style={{ minHeight: 48 }}>
          {box(useStart, setUseStart, 'Start date')}<span className="grow" />
          <button className={cx('select-btn outlined', active === 'start' && useStart && 'active')} disabled={!useStart} onClick={() => setActive('start')} style={{ opacity: useStart ? 1 : 0.4 }}>{fmtMonDay(start)}</button>
        </div>
        <div className="row gap-12" style={{ minHeight: 48 }}>
          {box(useDue, setUseDue, 'Due date')}<span className="grow" />
          <button className={cx('select-btn outlined', active === 'due' && useDue && 'active')} disabled={!useDue} onClick={() => setActive('due')} style={{ opacity: useDue ? 1 : 0.4 }}>{fmtMonDay(due)}</button>
          {useDue && <TimeInput value={time} onChange={setTime} label="Due time" />}
        </div>
        <div className="dialog-actions">
          <Btn kind="text" onClick={() => { onSave({ startDate: null, dueDate: null, dueTime: null }); onClose(); }}>Remove</Btn>
          <span className="spacer" />
          <Btn onClick={() => { onSave({ startDate: useStart ? start : null, dueDate: useDue ? due : null, dueTime: useDue ? time : null }); onClose(); }}>Save</Btn>
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

function EmojiPicker({ anchor, onClose, onPick }: { anchor: HTMLElement | null; onClose: () => void; onPick: (e: string) => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="menu" style={{ padding: 12, width: 296 }}>
        <div className="t-lm c-muted" style={{ padding: '0 4px 8px' }}>Icon</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 40px)', gap: 4 }}>
          {EMOJIS.map(e => <button key={e} className="ibtn state emoji" style={{ fontSize: 22 }} onClick={() => { onPick(e); onClose(); }} aria-label={`Icon ${e}`}>{e}</button>)}
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
          {COVERS.map(c => <button key={c} aria-label={`Cover ${c}`} onClick={() => { onPick(c); onClose(); }} style={{ width: 40, height: 40, borderRadius: 12, background: coverColor[c][0], outline: c === value ? '2px solid var(--primary)' : '1px solid var(--outline-variant)', outlineOffset: 2 }} />)}
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
  const [cover, setCover] = useState<Cover>('blue');
  const [status, setStatus] = useState('Not started');
  const [dates, setDates] = useState<Pick<Project, 'startDate' | 'dueDate' | 'dueTime'>>({ startDate: null, dueDate: null, dueTime: null });
  const [tags, setTags] = useState<string[]>(st.settings.projectDefaultTags);
  const ea = useAnchor(), ca = useAnchor(), sa = useAnchor(), da = useAnchor();
  const [hoverCover, setHoverCover] = useState(false);
  const [hoverIcon, setHoverIcon] = useState(false);
  const create = () => { if (!name.trim()) return; const p = st.addProject({ name: name.trim(), emoji, cover, status, tags, ...dates }); onClose(); nav(`/projects/${p.id}`); };
  return (
    <Dialog onClose={onClose} width={560} className="" label="New project">
      <div style={{ margin: -24, marginBottom: 0, position: 'relative' }}>
        <div onMouseEnter={() => setHoverCover(true)} onMouseLeave={() => setHoverCover(false)} style={{ height: 128, background: coverColor[cover][0], borderRadius: '28px 28px 0 0', position: 'relative' }}>
          {(hoverCover || ca.isOpen) && <Btn kind="elevated" icon="image" className="" onClick={e => ca.open(e as any)} >Change cover</Btn>}
        </div>
        <button onMouseEnter={() => setHoverIcon(true)} onMouseLeave={() => setHoverIcon(false)} onClick={e => ea.open(e)} aria-label="Change icon"
          style={{ position: 'absolute', left: 24, top: 92, width: 72, height: 72, borderRadius: 16, background: 'var(--surface-lowest)', boxShadow: 'var(--elev-2)', display: 'grid', placeItems: 'center' }}>
          <span className="emoji" style={{ fontSize: 36 }}>{emoji}</span>
          {(hoverIcon || ea.isOpen) && <span style={{ position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: 14, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="edit" size={16} /></span>}
        </button>
      </div>
      <div style={{ height: 40 }} />
      <input className="inline-input t-hm" placeholder="Project name" value={name} onChange={e => setName(e.target.value)} autoFocus aria-label="Project name" onKeyDown={e => { if (e.key === 'Enter') create(); }} />
      <div className="col">
        <div className="prop-row"><span className="k"><Icon name="flag" />Status</span><div className="v"><Pill name={status} tone={statusTone(status, st.settings.projectStatuses)} menu onClick={e => sa.open(e)} /></div></div>
        <div className="prop-row"><span className="k"><Icon name="event" />Dates</span><div className="v">{datesText(dates) ? <button className="select-btn state" onClick={e => da.open(e)}><Icon name="event" />{datesText(dates)}</button> : <Btn kind="text" icon="add" onClick={e => da.open(e as any)}>Add dates</Btn>}</div></div>
        <div className="prop-row" style={{ alignItems: 'flex-start', paddingTop: 8 }}><span className="k" style={{ minHeight: 32 }}><Icon name="tag" />Tags</span><div className="v col" style={{ alignItems: 'flex-start' }}><div className="row gap-8" style={{ flexWrap: 'wrap' }}><TagsEditor value={tags} onChange={setTags} /></div>{st.settings.projectDefaultTags.length > 0 && <span className="t-bs c-muted">“{st.settings.projectDefaultTags.join('”, “')}” comes from Settings → Default tags</span>}</div></div>
      </div>
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn disabled={!name.trim()} onClick={create}>Create project</Btn></div>
      {ea.isOpen && <EmojiPicker anchor={ea.el} onClose={ea.close} onPick={setEmoji} />}
      {ca.isOpen && <CoverPicker anchor={ca.el} onClose={ca.close} onPick={setCover} value={cover} />}
      {sa.isOpen && <StatusMenu anchor={sa.el} onClose={sa.close} value={status} onPick={setStatus} />}
      {da.isOpen && <DatesPopover anchor={da.el} onClose={da.close} value={dates} onSave={setDates} placement="right" />}
    </Dialog>
  );
}

// ---------- Projects (E30 / E31 / G03) ----------
export function ProjectsPage() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const view = st.settings.projectsView;
  const list = [...st.projects].sort((a, b) => Number(b.isInbox) - Number(a.isInbox) || a.sort - b.sort);
  const visible = view === 'board' ? list.filter(p => !p.isInbox) : list.filter(p => p.status !== 'Archived' || view !== 'gallery');
  const sub = view === 'board' ? `${visible.length} projects · grouped by project status` : `${list.length - 1} projects`;
  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">Projects</span><span className="t-bm c-muted">{sub}</span></div>
        <div className="actions">
          <Seg value={view} onChange={v => st.updateSettings({ projectsView: v })} items={[{ value: 'list', icon: 'list', tip: 'List' }, { value: 'gallery', icon: 'gallery', tip: 'Gallery' }, { value: 'board', icon: 'board', tip: 'Board' }]} />
          <Btn icon="add" onClick={() => ui.setNewProject(true)}>New project</Btn>
        </div>
      </div>
      {view === 'list' && <ProjectTable list={visible} />}
      {view === 'gallery' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {visible.map(p => <ProjectCard key={p.id} p={p} onClick={() => nav(`/projects/${p.id}`)} />)}
        </div>
      )}
      {view === 'board' && <ProjectBoard list={visible} />}
    </>
  );
}

function ProjectTable({ list }: { list: Project[] }) {
  const st = useStore();
  const nav = useNavigate();
  const cols = 'minmax(220px, 2fr) minmax(140px, 1.4fr) 140px 160px 56px 180px';
  return (
    <div className="col gap-8">
      <div className="t-lm c-muted" style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, padding: '0 20px', height: 24, alignItems: 'center' }}>
        <span>Project</span><span>Tags</span><span>Status</span><span>Dates</span><span>Open</span><span>Progress</span>
      </div>
      {list.map(p => {
        const pr = projectProgress(st.tasks, p);
        return (
          <button key={p.id} className="state" onClick={() => nav(`/projects/${p.id}`)} style={{ display: 'grid', gridTemplateColumns: cols, gap: 16, alignItems: 'center', minHeight: 64, padding: '8px 20px', borderRadius: 16, background: 'var(--surface-low)', textAlign: 'left' }}>
            <span className="row gap-12" style={{ minWidth: 0 }}>
              <span className="emoji" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 20, background: coverColor[p.cover]?.[0] }}>{p.emoji}</span>
              <span className="t-tm ellipsis">{p.name}</span>{p.isInbox && <Tag kind="pc">default</Tag>}
            </span>
            <span className="row gap-6" style={{ flexWrap: 'wrap' }}>{p.tags.length ? p.tags.map(t => <Tag key={t}>{t}</Tag>) : <span className="c-faint">—</span>}</span>
            <span>{p.isInbox ? <span className="c-faint">—</span> : <Pill name={p.status} tone={statusTone(p.status, st.settings.projectStatuses)} />}</span>
            <span className="t-bm c-muted">{datesText(p) ?? <span className="c-faint">—</span>}</span>
            <span className="t-bm">{pr.open}</span>
            <span className="row gap-8"><Lin pct={pr.pct} style={{ width: 120 }} /><span className="t-lm c-muted">{pr.pct}%</span></span>
          </button>
        );
      })}
    </div>
  );
}

export function ProjectCard({ p, onClick, compact }: { p: Project; onClick: () => void; compact?: boolean }) {
  const st = useStore();
  const pr = projectProgress(st.tasks, p);
  return (
    <button className="state col" onClick={onClick} draggable={compact} style={{ textAlign: 'left', borderRadius: 16, overflow: 'hidden', background: compact ? 'var(--surface-lowest)' : 'var(--surface-low)', boxShadow: compact ? '0 1px 2px rgb(0 0 0 / 0.08)' : undefined }}>
      {compact ? (
        <div className="row gap-6 t-lm" style={{ height: 36, padding: '0 12px', background: coverColor[p.cover]?.[0], color: coverColor[p.cover]?.[1] }}><Icon name="event" size={16} />{datesText(p) ?? 'No dates'}</div>
      ) : <div style={{ height: 88, background: coverColor[p.cover]?.[0] }} />}
      <div className="col gap-8" style={{ padding: compact ? 12 : '0 16px 16px', position: 'relative', flex: 1 }}>
        {compact ? <span className="row gap-8"><span className="emoji" style={{ fontSize: 18 }}>{p.emoji}</span><span className="t-ts">{p.name}</span></span> : (
          <>
            <span className="emoji" style={{ width: 48, height: 48, marginTop: -24, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 24, background: 'var(--surface-lowest)', boxShadow: 'var(--elev-1)' }}>{p.emoji}</span>
            <span className="row gap-8"><span className="t-tm">{p.name}</span>{p.isInbox && <Tag kind="pc">default</Tag>}</span>
          </>
        )}
        {p.tags.length > 0 && <span className="row gap-6" style={{ flexWrap: 'wrap' }}>{p.tags.map(t => <Tag key={t}>{t}</Tag>)}</span>}
        {!compact && !p.isInbox && <span className="row gap-8"><Pill name={p.status} tone={statusTone(p.status, st.settings.projectStatuses)} /><span className="t-bs c-muted">{datesText(p) ?? 'No dates'}</span></span>}
        {!compact && p.isInbox && <span className="t-bs c-muted" style={{ minHeight: 28, display: 'flex', alignItems: 'center' }}>{pr.open} open</span>}
        <span className="grow" />
        <Lin pct={pr.pct} />
        <span className="t-bs c-muted">{pr.pct}% · {pr.done} of {pr.total}</span>
      </div>
    </button>
  );
}

function ProjectBoard({ list }: { list: Project[] }) {
  const st = useStore();
  const nav = useNavigate();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState(false);
  const [newName, setNewName] = useState('');
  return (
    <div className="board">
      {st.settings.projectStatuses.map(s => {
        const items = list.filter(p => p.status === s.name);
        return (
          <div key={s.name} className={cx('board-col', over === s.name && 'over')} style={{ width: 264 }}
            onDragOver={e => { e.preventDefault(); setOver(s.name); }} onDragLeave={() => setOver(null)}
            onDrop={() => { setOver(null); if (drag) st.updateProject(drag, { status: s.name }); setDrag(null); }}>
            <div className="board-col-head"><Pill name={s.name} tone={s.tone} /><span className="count">{items.length}</span></div>
            {items.map(p => <div key={p.id} draggable onDragStart={() => setDrag(p.id)} onDragEnd={() => setDrag(null)} style={{ opacity: drag === p.id ? 0.4 : 1 }}><ProjectCard p={p} compact onClick={() => nav(`/projects/${p.id}`)} /></div>)}
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
type Filter = { status: 'open' | string; myDay: boolean; due: 'overdue' | 'today' | 'week' | null };

export function ProjectPage() {
  const { id } = useParams();
  const st = useStore();
  const nav = useNavigate();
  const p = st.projectById(id);
  const [filter, setFilter] = useState<Filter>({ status: 'open', myDay: false, due: null });
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [name, setName] = useState(p?.name ?? '');
  const sa = useAnchor(), da = useAnchor(), fa = useAnchor(), ma = useAnchor(), ea = useAnchor(), ca = useAnchor();
  const [del, setDel] = useState(false);
  useEffect(() => setName(p?.name ?? ''), [p?.id, p?.name]);
  const tasks = useMemo(() => st.tasks.filter(t => t.projectId === id && t.status !== 'Archived'), [st.tasks, id]);
  if (!p) return <Empty icon="folder" title="Project not found" body="It may have been deleted on another device." action={<Btn kind="tonal" onClick={() => nav('/projects')}>All projects</Btn>} />;
  const pr = projectProgress(st.tasks, p);
  const today = todayISO(), weekEnd = isoDate(addDays(new Date(), 7));
  const applies = (t: typeof tasks[number]) => {
    if (filter.myDay && !(t.myDayDate && t.myDayDate >= today)) return false;
    if (filter.due === 'overdue' && !isOverdue(t, st.settings)) return false;
    if (filter.due === 'today' && t.dueDate !== today) return false;
    if (filter.due === 'week' && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
    if (filter.status !== 'open' && t.status !== filter.status) return false;
    return true;
  };
  const open = tasks.filter(t => !isDone(t) && applies(t)).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') || a.sort - b.sort);
  const done = tasks.filter(t => isDone(t) && (filter.status === 'open' || filter.status === 'Done')).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const filtered = filter.status !== 'open' || filter.myDay || !!filter.due;
  const boardCols = st.settings.taskStatuses.map(s => s.name).filter(n => n !== 'Archived');

  return (
    <>
      <div className="breadcrumb"><button className="state" onClick={() => nav('/projects')}>Projects</button><Icon name="chevRight" /><span className="row gap-6"><span className="emoji">{p.emoji}</span>{p.name}</span></div>
      {!p.isInbox && (
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <div className="row" style={{ height: 120, borderRadius: 24, background: coverColor[p.cover]?.[0], justifyContent: 'flex-end', alignItems: 'flex-start', padding: 12 }}>
            <IBtn icon="palette" label="Change cover" onClick={e => ca.open(e)} style={{ background: 'var(--surface-lowest)' }} />
          </div>
          <button onClick={e => ea.open(e)} aria-label="Change icon" data-tip="Change icon" style={{ position: 'absolute', left: 24, bottom: -32, width: 72, height: 72, borderRadius: 16, background: 'var(--surface-lowest)', boxShadow: 'var(--elev-2)', display: 'grid', placeItems: 'center' }}>
            <span className="emoji" style={{ fontSize: 36 }}>{p.emoji}</span>
          </button>
        </div>
      )}
      <div className="col gap-12">
        <div className="page-head" style={{ alignItems: 'center' }}>
          <div className="title">
            <input className="inline-input t-hm" value={name} disabled={p.isInbox} aria-label="Project name" onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== p.name ? st.updateProject(p.id, { name: name.trim() }) : setName(p.name)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ color: 'var(--on-surface)' }} />
          </div>
          <div className="actions" style={{ gap: 16 }}>
            <div className="row gap-12">
              <Ring pct={pr.pct} size={56} stroke={6}><span className="t-lm">{pr.pct}%</span></Ring>
              <div className="col"><span className="t-ts">{pr.done} of {pr.total} done</span><span className="t-bs c-muted">{pr.open} {pr.open === 1 ? 'task' : 'tasks'} left</span></div>
            </div>
            <span style={{ width: 1, height: 32, background: 'var(--outline-variant)' }} />
            <IBtn icon="filter" label="Filter tasks" kind={filtered || fa.isOpen ? 'selected' : 'outlined'} onClick={e => fa.open(e)} />
            <Seg value={view} onChange={setView} items={[{ value: 'list', icon: 'list', tip: 'List' }, { value: 'board', icon: 'board', tip: 'Board' }]} />
            {!p.isInbox && <IBtn icon="moreV" label="More" onClick={e => ma.open(e)} />}
          </div>
        </div>
        {!p.isInbox ? (
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            <TagsInline p={p} />
            <Pill name={p.status} tone={statusTone(p.status, st.settings.projectStatuses)} menu onClick={e => sa.open(e)} />
            <button className={cx('select-btn outlined state', da.isOpen && 'active')} style={{ height: 32 }} onClick={e => da.open(e)}><Icon name="event" />{datesText(p) ?? 'Add dates'}</button>
          </div>
        ) : <span className="t-bm c-muted">Tasks without a project land here. Inbox can’t be deleted.</span>}
      </div>

      {view === 'board' ? <TaskBoard tasks={tasks.filter(t => applies(t) || isDone(t))} columns={boardCols} showProject={false} /> : (
        <>
          <div className="list">
            {open.map(t => <TaskRow key={t.id} t={t} showProject={false} showSun />)}
            {!open.length && <Empty icon="checklist" title={filtered ? 'No tasks match this filter' : 'No open tasks'} body={filtered ? undefined : 'Add one below.'} />}
          </div>
          {done.length > 0 && (
            <div className="col gap-8">
              <button className="row gap-8 state" style={{ height: 40, padding: '0 12px 0 8px', borderRadius: 20, alignSelf: 'flex-start' }} onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                <Icon name={showDone ? 'chevDown' : 'chevRight'} size={20} style={{ color: 'var(--on-surface-variant)' }} /><span className="t-ts c-muted">Completed</span><span className="t-ts c-faint">{done.length}</span>
              </button>
              {showDone && <div className="list">{done.map(t => <TaskRow key={t.id} t={t} showProject={false} />)}</div>}
            </div>
          )}
        </>
      )}
      <div className="grow" />
      <div className="bottom-bar"><AddTaskBar projectId={p.id} label={`Add a task to ${p.name}`} inMyDay={false} /></div>

      {fa.isOpen && (
        <Popover anchor={fa.el} onClose={fa.close} placement="below-end">
          <div className="menu" style={{ width: 340, padding: 16, gap: 12 }}>
            <span className="t-lm c-muted">STATUS</span>
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              {['open', ...st.settings.taskStatuses.filter(s => ['Not started', 'In progress', 'Done'].includes(s.name)).map(s => s.name)].map(s => (
                <Chip key={s} sel={filter.status === s} onClick={() => setFilter({ ...filter, status: s })}>{s === 'open' ? 'Open' : s}</Chip>
              ))}
            </div>
            <span className="t-lm c-muted">SHOW</span>
            <div className="row gap-12"><span className="t-bm grow">Only tasks in My Day</span><Switch on={filter.myDay} onChange={v => setFilter({ ...filter, myDay: v })} label="Only tasks in My Day" /></div>
            <span className="t-lm c-muted">DUE</span>
            <div className="row gap-8">{(['overdue', 'today', 'week'] as const).map(d => <Chip key={d} sel={filter.due === d} onClick={() => setFilter({ ...filter, due: filter.due === d ? null : d })}>{d === 'week' ? 'This week' : d[0].toUpperCase() + d.slice(1)}</Chip>)}</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="text" icon="close" disabled={!filtered} onClick={() => setFilter({ status: 'open', myDay: false, due: null })}>Clear filter</Btn></div>
          </div>
        </Popover>
      )}
      {sa.isOpen && <StatusMenu anchor={sa.el} onClose={sa.close} value={p.status} onPick={s => st.updateProject(p.id, { status: s })} />}
      {da.isOpen && <DatesPopover anchor={da.el} onClose={da.close} value={p} onSave={v => st.updateProject(p.id, v)} />}
      {ea.isOpen && <EmojiPicker anchor={ea.el} onClose={ea.close} onPick={e => st.updateProject(p.id, { emoji: e })} />}
      {ca.isOpen && <CoverPicker anchor={ca.el} onClose={ca.close} value={p.cover} onPick={c => st.updateProject(p.id, { cover: c })} />}
      {ma.isOpen && <Popover anchor={ma.el} onClose={ma.close} placement="below-end"><MenuList width={240} onClose={ma.close} items={[
        { t: p.status === 'Archived' ? 'Unarchive' : 'Archive project', ic: 'inbox', onClick: () => st.updateProject(p.id, { status: p.status === 'Archived' ? 'In progress' : 'Archived' }) },
        { t: 'Delete project', ic: 'trash', danger: true, onClick: () => setDel(true) },
      ]} /></Popover>}
      {del && <Confirm title={`Delete ${p.name}?`} body={`The project is deleted. Its ${pr.total} tasks move to Inbox.`} confirm="Delete" danger onClose={() => setDel(false)} onConfirm={() => { st.deleteProject(p.id); nav('/projects'); }} />}
    </>
  );
}

function TagsInline({ p }: { p: Project }) {
  const st = useStore();
  return <TagsEditor value={p.tags} onChange={tags => st.updateProject(p.id, { tags })} />;
}

