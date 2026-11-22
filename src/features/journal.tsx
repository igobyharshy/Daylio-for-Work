import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useNow } from '../lib/store';
import { useUI, type EntryDraft } from '../app/ui';
import type { Entry, ID, Task } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Confirm, Dialog, Field, IBtn, MenuList, Popover, Seg, Tag, cx, useAnchor, Empty } from '../ui/kit';
import { DateTimePicker, DuePicker } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import { needsReflection, tagChipTone, tagDot, tagTone } from '../lib/select';
import {
  MONTHS, addDays, atTime, cap, dueAt, elapsed, fmtClock, fmtDayComma, fmtDayShort, fmtMin, isoDate, relDay, todayISO, totalEstimateMin,
} from '../lib/time';

// ---------- shared bits ----------
export function TagAdder({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const st = useStore();
  const a = useAnchor();
  const [q, setQ] = useState('');
  const options = st.settings.journalTags.filter(t => !value.includes(t) && t.toLowerCase().includes(q.toLowerCase()));
  const add = (tag: string) => {
    onChange([...value, tag]);
    if (!st.settings.journalTags.includes(tag)) st.updateSettings({ journalTags: [...st.settings.journalTags, tag] });
    setQ(''); a.close();
  };
  return (
    <>
      {value.map(t => <Chip key={t} icon="tag" tone={tagChipTone(t)} onRemove={() => onChange(value.filter(x => x !== t))}>{t}</Chip>)}
      <Chip icon="add" onClick={e => a.open(e)}>add</Chip>
      {a.isOpen && (
        <Popover anchor={a.el} onClose={a.close}>
          <MenuList width={240} onClose={a.close}
            header={<div style={{ padding: '4px 12px 8px' }}><Field sm value={q} onChange={setQ} placeholder="Find or create a tag" autoFocus bg="var(--surface-container)" onKeyDown={e => { if (e.key === 'Enter' && q.trim()) add(options[0] ?? q.trim()); }} /></div>}
            items={[
              ...options.map(t => ({ t, dot: tagDot(t), onClick: () => add(t) })),
              ...(q.trim() && !st.settings.journalTags.some(t => t.toLowerCase() === q.trim().toLowerCase()) ? [{ t: `Create “${q.trim()}”`, ic: 'add' as const, onClick: () => add(q.trim()) }] : []),
              ...(!options.length && !q.trim() ? [{ note: 'All tags added.' }] : []),
            ]} />
        </Popover>
      )}
    </>
  );
}

/** Linked tasks: removable chips + search dropdown (G21/G22) */
export function LinkedTasks({ value, onChange, bg }: { value: ID[]; onChange: (ids: ID[]) => void; bg?: string }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const results = q.trim() ? st.tasks.filter(t => t.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(!!a.finishedAt) - Number(!!b.finishedAt)).slice(0, 6) : [];
  return (
    <div className="row gap-8" style={{ flexWrap: 'wrap', flex: 1 }}>
      {value.map(id => { const t = st.taskById(id); return t ? <Chip key={id} icon="link" tone={['var(--secondary-container)', 'var(--on-secondary-container)']} onRemove={() => onChange(value.filter(x => x !== id))}>{t.title}</Chip> : null; })}
      <div ref={wrap} style={{ width: 240 }}>
        <Field sm lead="search" value={q} onChange={setQ} placeholder="Search tasks…" bg={bg} onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) { if (!value.includes(results[0].id)) onChange([...value, results[0].id]); setQ(''); } }}
          inputRef={(el: HTMLInputElement | null) => { if (el) el.onfocus = () => setFocus(true); }} />
      </div>
      {focus && q.trim() && (
        <Popover anchor={wrap.current} onClose={() => setFocus(false)} closeOnOutside={false}>
          <MenuList width={340} items={[{ label: 'Tasks' }, ...(results.length ? results.map(t => {
            const p = st.projectById(t.projectId);
            return { t: t.title, emoji: p?.emoji, sub: `${p?.name ?? ''}${t.finishedAt ? ' · Done' : t.dueDate ? ' · Due ' + relDay(t.dueDate) : ''}`, sel: value.includes(t.id), onClick: () => { onChange(value.includes(t.id) ? value.filter(x => x !== t.id) : [...value, t.id]); setQ(''); } };
          }) : [{ note: 'No tasks match.' }])]} onClose={() => setFocus(false)} />
        </Popover>
      )}
    </div>
  );
}

const LabelCol = ({ children, h = 32 }: { children: React.ReactNode; h?: number }) => <div className="t-ll c-muted row" style={{ width: 112, height: h, flex: 'none' }}>{children}</div>;

// ---------- New journal entry (F05 / F07 / G09 / G21 / G22) ----------
export function EntryDialog({ draft, onClose }: { draft: EntryDraft; onClose: () => void }) {
  const st = useStore();
  const toast = useToast();
  const source = draft.source ?? (draft.taskIds?.length ? 'fromTask' : 'manual');
  const defTag = st.settings.journalDefaults[source];
  const [body, setBody] = useState(draft.body ?? '');
  const [tags, setTags] = useState<string[]>(draft.tags ?? (defTag ? [defTag] : []));
  const [when, setWhen] = useState(draft.whenAt ?? new Date().toISOString());
  const [taskIds, setTaskIds] = useState<ID[]>(draft.taskIds ?? []);
  const wa = useAnchor();
  const isToday = isoDate(new Date(when)) === todayISO();
  const save = () => {
    if (!body.trim()) return;
    st.addEntry({ body: body.trim(), tags, whenAt: when, taskIds });
    taskIds.forEach(id => { const t = st.taskById(id); if (t && t.reflection === 'needed') st.updateTask(id, { reflection: 'done' }); });
    toast.show('Journal entry saved', { icon: 'checkCircle', duration: 3000 });
    onClose();
  };
  const noteText = source === 'manual' ? 'Default tag for manual entries (change in Settings)' : 'Default tag for entries written from a task (change in Settings)';
  return (
    <Dialog onClose={onClose} width={640} label="New journal entry">
      <div className="row gap-12"><Icon name="draw" style={{ color: 'var(--tertiary)' }} /><span className="t-hs grow">New journal entry</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <Field multi rows={4} label="What happened, and what will you do differently?" value={body} onChange={setBody} autoFocus bg="var(--surface-high)"
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} />
      <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
        <LabelCol>Tags</LabelCol>
        <div className="col gap-6 grow">
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}><TagAdder value={tags} onChange={setTags} /></div>
          {defTag && tags.includes(defTag) && <span className="t-bs c-muted">{noteText}</span>}
        </div>
      </div>
      <div className="row gap-8">
        <LabelCol h={40}>When</LabelCol>
        <button className={cx('select-btn state', wa.isOpen && 'active')} onClick={e => wa.open(e)}><Icon name="event" />{isToday ? 'Today' : fmtDayComma(when)} · {fmtClock(when)}<Icon name="chevDown" /></button>
      </div>
      <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
        <LabelCol h={40}>Linked tasks</LabelCol>
        <LinkedTasks value={taskIds} onChange={setTaskIds} bg="var(--surface-high)" />
      </div>
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn disabled={!body.trim()} onClick={save}>Save</Btn></div>
      {wa.isOpen && <Popover anchor={wa.el} onClose={wa.close} placement="right"><DateTimePicker value={when} onDone={iso => { setWhen(iso); wa.close(); }} onClear={() => { setWhen(new Date().toISOString()); wa.close(); }} /></Popover>}
    </Dialog>
  );
}

// ---------- What happened? (E11 / E12 / E13) ----------
export function WhatHappenedDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const st = useStore();
  const toast = useToast();
  const now = useNow(1000, !!t.runStartedAt);
  const [body, setBody] = useState('');
  const tag = st.settings.journalDefaults.overEstimate;
  const [tags, setTags] = useState<string[]>(tag ? [tag] : []);
  const extend = (m: number) => {
    st.reEstimate(t.id, m);
    toast.show(`Added ${m} min. Insights still score the original ${fmtMin(t.estimateMin ?? 0)}.`, { icon: 'hourglass', duration: 4000 });
    onClose();
  };
  const later = () => {
    const eod = atTime(todayISO(), st.settings.workEnd);
    const until = eod.getTime() > Date.now() ? eod : new Date(Date.now() + 30 * 60000);
    st.updateTask(t.id, { reflection: 'needed', snoozeUntil: until.toISOString() });
    toast.show(`We’ll remind you at ${fmtClock(until)} to write it down.`, { icon: 'snooze' });
    onClose();
  };
  const save = () => {
    st.addEntry({ body: body.trim(), tags, taskIds: [t.id] });
    st.updateTask(t.id, { reflection: 'done', snoozeUntil: null });
    toast.show('Saved to your journal', { icon: 'checkCircle', duration: 3000 });
    onClose();
  };
  return (
    <Dialog onClose={onClose} width={560} label="What happened?">
      <div className="row gap-12"><Icon name="warn" style={{ color: 'var(--warning)' }} /><span className="t-hs grow">What happened?</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <div className="col gap-4">
        <span className="t-tm">{t.title}</span>
        <span className="t-bm c-muted">Estimate {fmtMin(totalEstimateMin(t))} · {fmtMin(elapsed(t, now) / 60000)} so far{t.reEstimates.length ? ` · original ${fmtMin(t.estimateMin ?? 0)}` : ''}</span>
      </div>
      <div className="col gap-8" style={{ background: 'var(--surface-low)', borderRadius: 16, padding: 16 }}>
        <span className="t-ts">Need more time?</span>
        <div className="row gap-8">{[5, 10, 30].map(m => <Chip key={m} icon="add" onClick={() => extend(m)}>{m} min</Chip>)}</div>
        <span className="t-bs c-muted">Extending is logged as a re-estimate. Insights still score your original estimate.</span>
      </div>
      <Field multi rows={3} label="What happened?" placeholder="Write a sentence or two…" value={body} onChange={setBody} bg="var(--surface-high)" />
      <div className="row gap-8"><span className="t-ll c-muted">Tag</span><TagAdder value={tags} onChange={setTags} /></div>
      <div className="dialog-actions">
        <Btn kind="text" icon="snooze" onClick={later}>Remind me later</Btn>
        <span className="spacer" />
        <Btn disabled={!body.trim()} onClick={save}>Save note</Btn>
      </div>
    </Dialog>
  );
}

// ---------- Entry drawer (E29) ----------
export function EntryDrawer({ e }: { e: Entry }) {
  const st = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(false);
  const [body, setBody] = useState(e.body);
  const [del, setDel] = useState(false);
  const wa = useAnchor();
  useEffect(() => { setBody(e.body); setEdit(false); }, [e.id, e.body]);
  return (
    <aside className="sheet" aria-label="Journal entry">
      <div className="sheet-head"><Icon name="draw" style={{ color: 'var(--tertiary)' }} /><span className="t-tl grow" style={{ paddingLeft: 4 }}>Journal entry</span><IBtn icon="close" label="Close" onClick={() => ui.openEntry(null)} /></div>
      <div className="sheet-body" style={{ gap: 24 }}>
        <div className="col gap-8"><span className="t-ts c-muted">When</span>
          <div><button className={cx('select-btn state', wa.isOpen && 'active')} onClick={ev => wa.open(ev)}><Icon name="event" />{fmtDayComma(e.whenAt)} · {fmtClock(e.whenAt)}<Icon name="chevDown" /></button></div>
        </div>
        <div className="col gap-8"><span className="t-ts c-muted">Entry</span>
          {edit ? (
            <div className="col gap-8">
              <Field multi rows={5} value={body} onChange={setBody} autoFocus bg="var(--surface-low)" />
              <div className="row gap-8" style={{ justifyContent: 'flex-end' }}><Btn kind="text" onClick={() => { setBody(e.body); setEdit(false); }}>Cancel</Btn><Btn disabled={!body.trim()} onClick={() => { st.updateEntry(e.id, { body: body.trim() }); setEdit(false); }}>Save</Btn></div>
            </div>
          ) : (
            <button className="col gap-12 state hover-card" onClick={() => setEdit(true)} style={{ textAlign: 'left', background: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 16, padding: 16 }}>
              <span className="t-bl" style={{ whiteSpace: 'pre-wrap' }}>{e.body}</span>
              <span className="row gap-6 t-bs c-faint"><Icon name="edit" size={16} />Click to edit</span>
            </button>
          )}
        </div>
        <div className="col gap-8"><span className="t-ts c-muted">Tags</span><div className="row gap-8" style={{ flexWrap: 'wrap' }}><TagAdder value={e.tags} onChange={tags => st.updateEntry(e.id, { tags })} /></div></div>
        <div className="col gap-8"><span className="t-ts c-muted">Linked tasks</span><LinkedTasks value={e.taskIds} onChange={taskIds => st.updateEntry(e.id, { taskIds })} bg="var(--surface-low)" /></div>
      </div>
      <div className="sheet-foot"><span className="t-bs c-muted grow">Written {fmtDayComma(e.createdAt)} · {fmtClock(e.createdAt)}</span><IBtn icon="trash" label="Delete entry" onClick={() => setDel(true)} /></div>
      {wa.isOpen && <Popover anchor={wa.el} onClose={wa.close} placement="left"><DateTimePicker value={e.whenAt} onDone={iso => { st.updateEntry(e.id, { whenAt: iso }); wa.close(); }} /></Popover>}
      {del && <Confirm title="Delete this entry?" body="This journal entry will be deleted. Linked tasks are not affected." confirm="Delete" danger onClose={() => setDel(false)} onConfirm={() => { ui.openEntry(null); st.deleteEntry(e.id); }} />}
    </aside>
  );
}

// ---------- Journal page (E26 / E27 / E28) ----------
export function JournalPage() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const view = st.settings.journalView;
  const [filter, setFilter] = useState<string | null>(null);
  const fa = useAnchor();
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const pending = needsReflection(st.tasks).length;
  const entries = st.entries.filter(e => !filter || e.tags.includes(filter)).sort((a, b) => b.whenAt.localeCompare(a.whenAt));
  const tagCount = (t: string) => st.entries.filter(e => e.tags.includes(t)).length;
  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">Journal</span><span className="t-bm c-muted">{view === 'calendar' ? `${MONTHS[month.getMonth()]} ${month.getFullYear()}` : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${filter ? ` tagged ${filter}` : ''}`}</span></div>
        <div className="actions">
          <IBtn icon="draw" label={pending ? `${pending} tasks need a reflection` : 'Needs reflection'} badge={pending || null} onClick={() => nav('/journal/review')} />
          <IBtn icon="filter" label="Filter by tag" kind={filter || fa.isOpen ? 'selected' : 'standard'} onClick={e => fa.open(e)} />
          <Seg value={view} onChange={v => st.updateSettings({ journalView: v })} items={[{ value: 'calendar', icon: 'calendar', tip: 'Calendar' }, { value: 'list', icon: 'list', tip: 'List' }]} />
          <Btn icon="add" onClick={() => ui.newEntry({ source: 'manual' })}>New entry</Btn>
        </div>
      </div>
      {filter && <div className="row gap-8"><Chip icon="tag" tone={tagChipTone(filter)} onRemove={() => setFilter(null)}>{filter}</Chip></div>}
      {view === 'calendar' ? <JournalCalendar month={month} setMonth={setMonth} entries={entries} /> : (
        entries.length ? (
          <div className="list">
            {entries.map(e => <EntryRow key={e.id} e={e} />)}
          </div>
        ) : <Empty icon="book" title={filter ? `No entries tagged ${filter}` : 'No journal entries yet'} body="When a task runs over, write a line about what happened. Patterns show up here." action={<Btn icon="add" onClick={() => ui.newEntry({ source: 'manual' })}>New entry</Btn>} />
      )}
      {fa.isOpen && (
        <Popover anchor={fa.el} onClose={fa.close} placement="below-end">
          <MenuList width={280} onClose={fa.close} items={[{ label: 'Show entries tagged' }, ...st.settings.journalTags.map(t => ({ t, dot: tagDot(t), sel: filter === t, sup: String(tagCount(t)), onClick: () => setFilter(filter === t ? null : t) })), { divider: true }, { t: 'Clear filter', ic: 'close', disabled: !filter, onClick: () => setFilter(null) }]} />
        </Popover>
      )}
    </>
  );
}

function EntryRow({ e }: { e: Entry }) {
  const st = useStore();
  const ui = useUI();
  const linked = e.taskIds.map(id => st.taskById(id)).filter(Boolean) as Task[];
  return (
    <button className={cx('task-row state', ui.entryId === e.id && 'sel')} style={{ padding: '16px 12px 16px 20px', textAlign: 'left' }} onClick={() => ui.openEntry(e.id)}>
      <div className="text" style={{ gap: 6 }}>
        <span className="t-bl" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.body}</span>
        <div className="meta" style={{ gap: 12 }}>
          <span>{fmtDayShort(e.whenAt)}</span>
          {linked.length ? <span className="m"><Icon name="subdir" />{linked[0].title}{linked.length > 1 ? ` +${linked.length - 1}` : ''}</span> : <span className="c-faint">No task linked</span>}
          {e.tags.map(t => <Tag key={t} kind={tagTone(t)} icon="tag">{t}</Tag>)}
        </div>
      </div>
      <Icon name="chevRight" style={{ color: 'var(--on-surface-variant)' }} />
    </button>
  );
}

function JournalCalendar({ month, setMonth, entries }: { month: Date; setMonth: (d: Date) => void; entries: Entry[] }) {
  const st = useStore();
  const ui = useUI();
  const [hover, setHover] = useState<{ iso: string; el: HTMLElement } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = addDays(first, -offset);
    const n = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(start, i));
  }, [month]);
  const byDay = useMemo(() => { const m = new Map<string, Entry[]>(); entries.forEach(e => { const k = isoDate(new Date(e.whenAt)); m.set(k, [...(m.get(k) ?? []), e]); }); return m; }, [entries]);
  const today = todayISO();
  const hoverEntries = hover ? byDay.get(hover.iso) ?? [] : [];
  return (
    <div className="col gap-8">
      <div className="row gap-8">
        <IBtn icon="chevLeft" label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
        <IBtn icon="chevRight" label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        <Btn kind="text" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</Btn>
      </div>
      <div className="jcal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="jcal-dow">{d}</div>)}
        {days.map(d => {
          const iso = isoDate(d), inM = d.getMonth() === month.getMonth();
          const list = byDay.get(iso) ?? [];
          const dots = [...new Set(list.flatMap(e => e.tags))].slice(0, 4);
          return (
            <button key={iso} className={cx('jcal-day', !inM && 'out', hover?.iso === iso && 'hover')}
              onMouseEnter={ev => { const el = ev.currentTarget; window.clearTimeout(timer.current); if (list.length) timer.current = window.setTimeout(() => setHover({ iso, el }), 250); }}
              onMouseLeave={() => { window.clearTimeout(timer.current); }}
              onClick={ev => { if (list.length === 1) ui.openEntry(list[0].id); else if (list.length) setHover({ iso, el: ev.currentTarget }); else ui.newEntry({ source: 'manual', whenAt: iso === today ? undefined : atTime(iso, '12:00').toISOString() }); }}
              disabled={iso > today && !list.length} style={{ cursor: iso > today && !list.length ? 'default' : 'pointer' }}>
              <span className={cx('jcal-num', iso === today && 'today')}>{d.getDate()}</span>
              {list.length > 0 && <span className="row gap-8"><span className="row gap-4">{dots.map(t => <span key={t} className="dot" style={{ background: tagDot(t) }} />)}</span><span className="t-bs c-muted">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span></span>}
              {list[0] && <span className="t-bs ellipsis" style={{ width: '100%', color: 'var(--on-surface)' }}>{list[0].body}</span>}
            </button>
          );
        })}
      </div>
      {hover && hoverEntries.length > 0 && (
        <Popover anchor={hover.el} onClose={() => setHover(null)} placement="below-start">
          <div className="menu" style={{ width: 380, padding: '16px 16px 8px', gap: 12 }} onMouseLeave={() => setHover(null)}>
            <span className="t-ts c-muted">{fmtDayComma(hover.iso)} · {hoverEntries.length} {hoverEntries.length === 1 ? 'entry' : 'entries'}</span>
            {hoverEntries.map((e, i) => {
              const t = st.taskById(e.taskIds[0]);
              return (
                <button key={e.id} className="col gap-6 state" style={{ textAlign: 'left', borderTop: i ? '1px solid var(--outline-variant)' : undefined, paddingTop: i ? 12 : 0, borderRadius: 0 }} onClick={() => { ui.openEntry(e.id); setHover(null); }}>
                  <span className="t-bl">{e.body}</span>
                  <span className="row gap-8 t-bm c-muted">{t ? <><Icon name="subdir" size={16} />{t.title}</> : fmtClock(e.whenAt)}{e.tags.map(tg => <Tag key={tg} kind={tagTone(tg)} icon="tag">{tg}</Tag>)}</span>
                </button>
              );
            })}
            <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind="text" trail="chevRight" onClick={() => { st.updateSettings({ journalView: 'list' }); setHover(null); }}>Open in list</Btn></div>
          </div>
        </Popover>
      )}
    </div>
  );
}

// ---------- Needs reflection (E24 / E25) ----------
export function ReviewPage() {
  const st = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const queue = needsReflection(st.tasks);
  const [selId, setSelId] = useState<ID | null>(null);
  const sel = queue.find(t => t.id === selId) ?? queue[0];
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([st.settings.journalDefaults.review]);
  const sa = useAnchor();
  const [custom, setCustom] = useState(false);
  useEffect(() => { setBody(''); setTags([st.settings.journalDefaults.review]); }, [sel?.id]);
  const idx = sel ? queue.indexOf(sel) : -1;
  const next = () => { const n = queue[idx + 1] ?? queue.find(t => t.id !== sel?.id); setSelId(n?.id ?? null); };
  const snooze = (until: Date) => { if (!sel) return; st.updateTask(sel.id, { snoozeUntil: until.toISOString() }); toast.show(`Snoozed until ${relDay(isoDate(until)) === 'today' ? '' : cap(relDay(isoDate(until))) + ' '}${fmtClock(until)}`, { icon: 'snooze' }); next(); };
  if (!sel) {
    return (
      <>
        <Crumbs />
        <Empty icon="doneAll" title="All caught up" body="No tasks are waiting for a reflection. When a task runs over its estimate or finishes late, it shows up here." action={<Btn kind="tonal" onClick={() => nav('/journal')}>Back to Journal</Btn>} />
      </>
    );
  }
  const p = st.projectById(sel.projectId);
  const est = sel.estimateMin ?? 0;
  const took = elapsed(sel) / 60000;
  const due = dueAt(sel, st.settings);
  const overMin = Math.max(0, Math.round(took - est));
  return (
    <>
      <Crumbs />
      <div className="page-head"><div className="title"><span className="t-hm">Needs reflection</span><span className="t-bm c-muted">{queue.length} {queue.length === 1 ? 'task' : 'tasks'} went over. Write a line on each while it’s fresh.</span></div><span className="count" style={{ height: 32, borderRadius: 16, padding: '0 12px' }}>{idx + 1} of {queue.length}</span></div>
      <div className="row gap-24" style={{ alignItems: 'flex-start' }}>
        <div className="col gap-8" style={{ width: 360, flex: 'none' }}>
          {queue.map(t => {
            const on = t.id === sel.id;
            const o = Math.round(elapsed(t) / 60000 - (t.estimateMin ?? 0));
            return (
              <button key={t.id} className="row gap-12 state" onClick={() => setSelId(t.id)} style={{ alignItems: 'flex-start', padding: 16, borderRadius: 16, textAlign: 'left', background: on ? 'var(--secondary-container)' : 'var(--surface-low)', color: on ? 'var(--on-secondary-container)' : undefined }}>
                <Icon name={on ? 'edit' : 'circle'} style={{ color: on ? undefined : 'var(--outline)' }} />
                <span className="col gap-4 grow"><span className="t-tm">{t.title}</span><span className="t-bm" style={{ opacity: 0.8 }}>Estimate {fmtMin(t.estimateMin ?? 0)} · took {fmtMin(elapsed(t) / 60000)}</span></span>
                {o > 0 && <Tag kind="err">+{fmtMin(o)}</Tag>}
              </button>
            );
          })}
        </div>
        <div className="col gap-24 grow" style={{ background: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 28, padding: 32 }}>
          <div className="col gap-8" style={{ alignItems: 'flex-start' }}>
            {p && <Chip emoji={p.emoji}>{p.name}</Chip>}
            <span className="t-hs">{sel.title}</span>
            <span className="t-bm c-muted">{due ? `Promised ${fmtClock(due)} · ` : ''}{sel.finishedAt ? `finished ${fmtClock(sel.finishedAt)}` : 'still open'}{sel.finishedAt && relDay(isoDate(new Date(sel.finishedAt))) !== 'today' ? ` ${relDay(isoDate(new Date(sel.finishedAt)))}` : ''}</span>
          </div>
          {est > 0 && (
            <div className="col gap-8">
              <div className="row" style={{ gap: 2, height: 12 }}>
                <i style={{ flex: est, height: 12, background: 'var(--primary)', borderRadius: 6 }} />
                {overMin > 0 && <i style={{ flex: Math.max(overMin, est * 0.03), height: 12, background: 'var(--error)', borderRadius: 6 }} />}
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="t-bs c-muted">Estimate {fmtMin(est)}</span>{overMin > 0 && <span className="t-lm c-error">+{fmtMin(overMin)} over</span>}</div>
            </div>
          )}
          <Field multi rows={4} label="What happened?" placeholder="Write a sentence or two…" value={body} onChange={setBody} bg="var(--surface-lowest)" autoFocus />
          <div className="row gap-8"><span className="t-ll c-muted">Tag</span><TagAdder value={tags} onChange={setTags} /></div>
          <div className="dialog-actions" style={{ paddingTop: 0 }}>
            <Btn kind="text" icon="snooze" onClick={e => sa.open(e)}>Snooze</Btn>
            <span className="spacer" />
            <Btn kind="outlined" onClick={next} disabled={queue.length < 2}>Next</Btn>
            <Btn icon="check" disabled={!body.trim()} onClick={() => {
              st.addEntry({ body: body.trim(), tags, taskIds: [sel.id], whenAt: sel.finishedAt ?? new Date().toISOString() });
              st.updateTask(sel.id, { reflection: 'done', snoozeUntil: null });
              toast.show('Saved to your journal', { icon: 'checkCircle', duration: 2500 });
              if (queue.length <= 1) nav('/journal'); else next();
            }}>Save & next</Btn>
          </div>
        </div>
      </div>
      {sa.isOpen && !custom && (
        <Popover anchor={sa.el} onClose={sa.close} placement="above-start">
          <MenuList width={320} onClose={sa.close} items={[
            { label: 'Remind me' },
            { t: 'In 30 min', ic: 'snooze', sup: fmtClock(new Date(Date.now() + 30 * 60000)), onClick: () => snooze(new Date(Date.now() + 30 * 60000)) },
            { t: 'Tomorrow morning', ic: 'sun', sup: fmtClock(atTime(isoDate(addDays(new Date(), 1)), st.settings.workStart)), onClick: () => snooze(atTime(isoDate(addDays(new Date(), 1)), st.settings.workStart)) },
            { t: 'Pick a time…', ic: 'event', keepOpen: true, onClick: () => setCustom(true) },
            { divider: true },
            { t: 'Dismiss · no reflection needed', ic: 'close', danger: true, onClick: () => { st.updateTask(sel.id, { reflection: 'dismissed' }); toast.show('Dismissed', { action: { label: 'Undo', onClick: () => st.updateTask(sel.id, { reflection: 'needed' }) } }); next(); } },
          ]} />
        </Popover>
      )}
      {sa.isOpen && custom && (
        <Popover anchor={sa.el} onClose={() => { setCustom(false); sa.close(); }} placement="above-start">
          <FuturePick onPick={d => { setCustom(false); sa.close(); snooze(d); }} onCancel={() => { setCustom(false); sa.close(); }} />
        </Popover>
      )}
    </>
  );
}

function FuturePick({ onPick, onCancel }: { onPick: (d: Date) => void; onCancel: () => void }) {
  return <DuePicker title="Remind me at" requireTime date={todayISO()} time="17:00" clearLabel="Cancel" onClear={onCancel} onDone={(d, t) => onPick(atTime(d, t ?? '17:00'))} />;
}

function Crumbs() {
  const nav = useNavigate();
  return <div className="breadcrumb"><button className="state" onClick={() => nav('/journal')}>Journal</button><Icon name="chevRight" /><span>Needs reflection</span></div>;
}

