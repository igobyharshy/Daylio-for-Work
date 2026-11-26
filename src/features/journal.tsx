import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, useNow } from '../lib/store';
import { useUI, type EntryDraft } from '../app/ui';
import type { Entry, ID, Task } from '../lib/types';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Dialog, Field, IBtn, MenuList, Popover, Seg, Tag, cx, useAnchor, Empty } from '../ui/kit';
import { DateTimePicker, DuePicker } from '../ui/pickers';
import { EntryTrackerPills, EntryTrackersEditor, TrackerInput } from './trackers';
import { checkinTrackers, fmtValue, type Tracker, type TrackerValue, type TrackerValues } from '../lib/trackers';
import { useToast } from '../ui/Toast';
import { needsReflection, tagChipTone, tagDot } from '../lib/select';
import {
  MONTHS, addDays, atTime, cap, dueAt, elapsed, fmtClock, fmtDayComma, fmtDayLong, fmtDayShort, fmtMin, isoDate, outcome, parseDate, relDay, todayISO, totalEstimateMin,
} from '../lib/time';
import { SampleBanner } from './common';
import { useIsMobile } from '../lib/native';

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
    <div className="row gap-8" style={{ flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
      {value.map(id => { const t = st.taskById(id); return t ? <Chip key={id} icon="link" tone={['var(--secondary-container)', 'var(--on-secondary-container)']} onRemove={() => onChange(value.filter(x => x !== id))}>{t.title}</Chip> : null; })}
      <div ref={wrap} style={{ width: 240, maxWidth: '100%' }}>
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


// ---------- one entry form, used everywhere (day panel, What happened?, reflection) ----------
export interface EntryValue { body: string; tags: string[]; whenAt: string; taskIds: ID[]; trackerValues: TrackerValues }
const Label = ({ children }: { children: React.ReactNode }) => <div className="t-ll c-muted row" style={{ width: 104, minHeight: 32, flex: 'none' }}>{children}</div>;

export function EntryForm({ value, onChange, onBodyBlur, question, showWhen = true, showLinked = true, autoFocus, bodyBg = 'var(--surface-lowest)' }: {
  value: EntryValue; onChange: (patch: Partial<EntryValue>) => void; onBodyBlur?: () => void; question?: string; showWhen?: boolean; showLinked?: boolean; autoFocus?: boolean; bodyBg?: string;
}) {
  const wa = useAnchor();
  const isToday = isoDate(new Date(value.whenAt)) === todayISO();
  return (
    <div className="col gap-12">
      <Field multi rows={3} label={question ?? 'What’s on your mind?'} value={value.body} onChange={body => onChange({ body })} onBlur={onBodyBlur} autoFocus={autoFocus} bg={bodyBg} />
      <div className="row gap-8" style={{ alignItems: 'flex-start' }}><Label>Tags</Label><div className="row gap-8 grow" style={{ flexWrap: 'wrap' }}><TagAdder value={value.tags} onChange={tags => onChange({ tags })} /></div></div>
      {showWhen && <div className="row gap-8"><Label>When</Label>
        <button className={cx('select-btn state', wa.isOpen && 'active')} style={{ height: 32 }} onClick={e => wa.open(e)}><Icon name="event" />{isToday ? 'Today' : fmtDayComma(value.whenAt)} · {fmtClock(value.whenAt)}<Icon name="chevDown" /></button>
      </div>}
      {showLinked && <div className="row gap-8" style={{ alignItems: 'flex-start' }}><Label>Linked tasks</Label><LinkedTasks value={value.taskIds} onChange={taskIds => onChange({ taskIds })} bg={bodyBg} /></div>}
      <EntryTrackersEditor tags={value.tags} values={value.trackerValues} onChange={trackerValues => onChange({ trackerValues })} />
      {wa.isOpen && <Popover anchor={wa.el} onClose={wa.close} placement="left"><DateTimePicker value={value.whenAt} onDone={iso => { onChange({ whenAt: iso }); wa.close(); }} /></Popover>}
    </div>
  );
}

const questionFor = (source?: EntryDraft['source']) => (source && source !== 'manual' ? 'What happened, and what will you do differently?' : 'What’s on your mind?');

// ---------- What happened? (E11 / E12 / E13) ----------
export function WhatHappenedDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const st = useStore();
  const toast = useToast();
  const now = useNow(1000, !!t.runStartedAt);
  const tag = st.settings.journalDefaults.overEstimate;
  const [v, setV] = useState<EntryValue>({ body: '', tags: tag ? [tag] : [], whenAt: new Date().toISOString(), taskIds: [t.id], trackerValues: {} });
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
    st.addEntry({ body: v.body.trim(), tags: v.tags, taskIds: [t.id], trackerValues: v.trackerValues });
    st.updateTask(t.id, { reflection: 'done', snoozeUntil: null });
    toast.show('Saved to your journal', { icon: 'checkCircle', duration: 3000 });
    onClose();
  };
  return (
    <Dialog onClose={onClose} width={600} label="What happened?">
      <div className="row gap-12"><Icon name="warn" style={{ color: 'var(--warning)' }} /><span className="t-hs grow">What happened?</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <div className="col gap-4">
        <span className="t-tm">{t.title}</span>
        <span className="t-bm c-muted">Estimate {fmtMin(totalEstimateMin(t))} · {fmtMin(elapsed(t, now) / 60000)} so far{t.reEstimates.length ? ` · original ${fmtMin(t.estimateMin ?? 0)}` : ''}</span>
      </div>
      <div className="row gap-8" style={{ background: 'var(--surface-low)', borderRadius: 16, padding: '12px 16px', flexWrap: 'wrap' }}>
        <span className="t-ts grow">Need more time?</span>
        {[5, 10, 30].map(m => <Chip key={m} icon="add" onClick={() => extend(m)}>{m} min</Chip>)}
        <span className="t-bs c-muted" style={{ width: '100%' }}>Extending is logged as a re-estimate. Insights still score your original estimate.</span>
      </div>
      <EntryForm value={v} onChange={p => setV(x => ({ ...x, ...p }))} question="What happened, and what will you do differently?" showWhen={false} showLinked={false} autoFocus bodyBg="var(--surface-high)" />
      <div className="dialog-actions">
        <Btn kind="text" icon="snooze" onClick={later}>Remind me later</Btn>
        <span className="spacer" />
        <Btn disabled={!v.body.trim()} onClick={save}>Save note</Btn>
      </div>
    </Dialog>
  );
}

// ---------- check-in summaries ----------
function trackerShade(t: Tracker, v: TrackerValue | undefined): number | null {
  if (typeof v !== 'number') return null;
  if (t.type === 'points') { const p = (v - (t.min ?? 1)) / Math.max(1, (t.max ?? 5) - (t.min ?? 1)); return t.higherIs === 'worse' ? 1 - p : p; }
  if (t.type === 'levels') return v / Math.max(1, (t.levels?.length ?? 2) - 1);
  if (t.type === 'duration') return Math.max(0, Math.min(1, (v - 240) / 300)); // 4h → 9h
  return null;
}
function CheckinSummary({ day, max = 3 }: { day: string; max?: number }) {
  const st = useStore();
  const c = st.checkinFor(day);
  const trackers = checkinTrackers(st.settings.trackers).filter(t => c?.values[t.id] != null);
  if (!trackers.length) return null;
  return (
    <span className="row gap-6" style={{ flexWrap: 'wrap' }}>
      {trackers.slice(0, max).map(t => <span key={t.id} className="vpill"><Icon name={t.icon} />{t.name} · {fmtValue(t, c!.values[t.id])}</span>)}
      {trackers.length > max && <span className="vpill">+{trackers.length - max}</span>}
    </span>
  );
}

/** One line, always the same height, however many trackers there are. */
function CheckinBar() {
  const st = useStore();
  const ui = useUI();
  const toast = useToast();
  const day = todayISO();
  const c = st.checkinFor(day);
  const trackers = checkinTrackers(st.settings.trackers);
  if (!trackers.length) return null;
  const logged = trackers.filter(t => c?.values[t.id] != null).length;
  const open = () => ui.openDay({ iso: day, focusCheckin: true });
  if (c?.skipped) return (
    <div className="checkin-bar"><Icon name="sun" /><span className="t-ts">Skipped today’s check-in</span><span className="grow" /><Btn kind="text" onClick={() => st.skipCheckin(day, false)}>Undo</Btn></div>
  );
  const complete = logged === trackers.length;
  return (
    <div className={cx('checkin-bar', complete && 'done')}>
      <Icon name={complete ? 'checkCircle' : 'sun'} />
      <span className="t-ts" style={{ whiteSpace: 'nowrap' }}>{complete ? 'Checked in today' : 'Today’s check-in'}</span>
      {!complete && <span className="t-bs c-muted" style={{ whiteSpace: 'nowrap' }}>{logged} of {trackers.length}</span>}
      <span className="grow summary"><CheckinSummary day={day} max={complete ? 4 : 3} /></span>
      {complete ? <Btn kind="text" onClick={open}>Edit</Btn> : <>
        {logged === 0 && <Btn kind="text" onClick={() => { st.skipCheckin(day); toast.show('Skipped today’s check-in', { icon: 'sun', action: { label: 'Undo', onClick: () => st.skipCheckin(day, false) } }); }}>Skip</Btn>}
        <Btn kind="tonal" onClick={open}>{logged ? 'Continue' : 'Log check-in'}</Btn>
      </>}
    </div>
  );
}

// ---------- Day panel: the day's check-in and entries (replaces the entry pop-up and entry drawer) ----------
export function DayPanel() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const toast = useToast();
  const d = ui.day!;
  const iso = d.iso;
  const today = todayISO();
  const entries = st.entries.filter(e => isoDate(new Date(e.whenAt)) === iso).sort((a, b) => a.whenAt.localeCompare(b.whenAt));
  const trackers = checkinTrackers(st.settings.trackers);
  const c = st.checkinFor(iso);
  const [draft, setDraft] = useState<EntryDraft | null>(d.draft ?? null);
  const [open, setOpen] = useState<ID | null>(d.focusEntry ?? null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(d.draft ?? null); setOpen(d.focusEntry ?? null); }, [d]);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (d.focusEntry) setTimeout(() => document.getElementById('entry-' + d.focusEntry)?.scrollIntoView({ block: 'nearest' }), 50); }, [d.focusEntry]);
  const go = (n: number) => { const next = isoDate(addDays(parseDate(iso), n)); if (next <= today) ui.openDay({ iso: next }); };
  const setCheck = (t: Tracker, v: TrackerValue | undefined) => {
    const n = { ...(c?.values ?? {}) }; if (v == null || (Array.isArray(v) && !v.length)) delete n[t.id]; else n[t.id] = v;
    st.saveCheckin(iso, n); setSaved(true);
  };
  useEffect(() => { if (!saved) return; const id = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(id); }, [saved, c]);
  const logged = trackers.filter(t => c?.values[t.id] != null).length;
  const label = iso === today ? 'Today' : relDay(iso) === 'yesterday' ? 'Yesterday' : fmtDayShort(iso);
  return (
    <aside className="sheet" aria-label={`Journal · ${label}`}>
      <div className="sheet-head">
        <IBtn icon="chevLeft" label="Previous day" onClick={() => go(-1)} />
        <div className="col grow" style={{ alignItems: 'center' }}><span className="t-tl">{label}</span><span className="t-bs c-muted">{fmtDayLong(parseDate(iso))}</span></div>
        <IBtn icon="chevRight" label="Next day" disabled={iso >= today} onClick={() => go(1)} />
        <IBtn icon="close" label="Close" onClick={() => ui.openDay(null)} />
      </div>
      <div className="sheet-body" ref={bodyRef} style={{ gap: 16 }}>
        {trackers.length > 0 && (
          <section className="day-sec">
            <div className="row gap-8"><Icon name="sun" style={{ color: 'var(--primary)' }} /><span className="t-ts grow">Check-in</span>
              <span className="t-bs c-muted">{saved ? 'Saved' : c?.skipped ? 'Skipped' : `${logged} of ${trackers.length}`}</span></div>
            {c?.skipped ? (
              <div className="row gap-8"><span className="t-bm c-muted grow">You skipped this day’s check-in.</span><Btn kind="text" onClick={() => st.skipCheckin(iso, false)}>Log it anyway</Btn></div>
            ) : trackers.map(t => (
              <div key={t.id} className="track-row">
                <span className="k"><Icon name={t.icon} size={18} /><span className="col"><span className="t-bm">{t.name}</span>{t.question && <span className="t-bs c-muted">{t.question}</span>}</span></span>
                <div className="v"><TrackerInput t={t} value={c?.values[t.id]} onChange={v => setCheck(t, v)} /></div>
              </div>
            ))}
            <div className="row gap-8">
              <Btn kind="text" icon="settings" onClick={() => nav('/settings/trackers')}>Edit trackers</Btn><span className="grow" />
              {!c?.skipped && logged === 0 && <Btn kind="text" onClick={() => { st.skipCheckin(iso); toast.show('Skipped', { icon: 'sun', action: { label: 'Undo', onClick: () => st.skipCheckin(iso, false) } }); }}>Skip this day</Btn>}
            </div>
          </section>
        )}

        <section className="col gap-8">
          <div className="row gap-8"><Icon name="draw" style={{ color: 'var(--tertiary)' }} /><span className="t-ts grow">Entries</span>{entries.length > 0 && <span className="t-bs c-muted">{entries.length}</span>}
            {!draft && <Btn kind="tonal" icon="add" onClick={() => setDraft({ source: 'manual', whenAt: iso === today ? undefined : atTime(iso, '12:00').toISOString() })}>New entry</Btn>}</div>
          {draft && <NewEntry key={JSON.stringify(draft)} draft={draft} iso={iso} onDone={() => setDraft(null)} />}
          {entries.map(e => <EntryCard key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />)}
          {!entries.length && !draft && <span className="t-bm c-muted" style={{ padding: '8px 0' }}>No entries on this day.</span>}
        </section>
      </div>
    </aside>
  );
}

function NewEntry({ draft, iso, onDone }: { draft: EntryDraft; iso: string; onDone: () => void }) {
  const st = useStore();
  const toast = useToast();
  const source = draft.source ?? (draft.taskIds?.length ? 'fromTask' : 'manual');
  const defTag = st.settings.journalDefaults[source];
  const [v, setV] = useState<EntryValue>({
    body: draft.body ?? '', tags: draft.tags ?? (defTag ? [defTag] : []), taskIds: draft.taskIds ?? [], trackerValues: {},
    whenAt: draft.whenAt ?? (iso === todayISO() ? new Date().toISOString() : atTime(iso, '12:00').toISOString()),
  });
  const save = () => {
    if (!v.body.trim()) return;
    st.addEntry({ ...v, body: v.body.trim() });
    v.taskIds.forEach(id => { const t = st.taskById(id); if (t && t.reflection === 'needed') st.updateTask(id, { reflection: 'done' }); });
    toast.show('Journal entry saved', { icon: 'checkCircle', duration: 3000 });
    onDone();
  };
  return (
    <div className="entry-card open" onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}>
      <EntryForm value={v} onChange={p => setV(x => ({ ...x, ...p }))} question={questionFor(source)} autoFocus />
      <div className="dialog-actions" style={{ paddingTop: 0 }}><span className="t-bs c-muted">Ctrl + Enter to save</span><span className="spacer" /><Btn kind="text" onClick={onDone}>Cancel</Btn><Btn disabled={!v.body.trim()} onClick={save}>Save</Btn></div>
    </div>
  );
}

/** An existing entry: collapsed summary, or the same form with auto-save (nothing is lost on close). */
function EntryCard({ e, open, onToggle }: { e: Entry; open: boolean; onToggle: () => void }) {
  const st = useStore();
  const toast = useToast();
  const [body, setBody] = useState(e.body);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef(body); bodyRef.current = body;
  useEffect(() => setBody(e.body), [e.id, e.body]);
  // save unsaved text when the card closes or the panel goes away
  useEffect(() => () => { const b = bodyRef.current.trim(); if (b && b !== e.body) st.updateEntry(e.id, { body: b }); }, [open]); // eslint-disable-line
  const patch = (p: Partial<EntryValue>) => {
    if (p.body != null) { setBody(p.body); return; }
    st.updateEntry(e.id, p); setSaved(true); setTimeout(() => setSaved(false), 1500);
  };
  const saveBody = () => { const b = body.trim(); if (b && b !== e.body) { st.updateEntry(e.id, { body: b }); setSaved(true); setTimeout(() => setSaved(false), 1500); } };
  const linked = e.taskIds.map(id => st.taskById(id)).filter(Boolean) as Task[];
  const remove = () => { const undo = st.removeEntry(e.id); toast.show('Entry deleted', { icon: 'trash', action: { label: 'Undo', onClick: undo }, duration: 6000 }); };
  if (!open) return (
    <button id={'entry-' + e.id} className="entry-card state" onClick={onToggle}>
      <span className="row gap-8 t-bs c-muted"><span>{fmtClock(e.whenAt)}</span>{linked[0] && <span className="row gap-4"><Icon name="subdir" size={14} />{linked[0].title}{linked.length > 1 ? ` +${linked.length - 1}` : ''}</span>}</span>
      <span className="t-bl" style={{ whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.body}</span>
      {(e.tags.length > 0 || Object.keys(e.trackerValues).length > 0) && <span className="row gap-6" style={{ flexWrap: 'wrap' }}>{e.tags.map(t => <Tag key={t} tone={tagChipTone(t)} icon="tag">{t}</Tag>)}<EntryTrackerPills e={e} /></span>}
    </button>
  );
  return (
    <div id={'entry-' + e.id} className="entry-card open">
      <div className="row gap-8"><span className="t-bs c-muted grow">{saved ? 'Saved' : 'Changes save automatically'}</span>
        <IBtn sm icon="trash" label="Delete entry" onClick={remove} /><IBtn sm icon="chevUp" label="Collapse" onClick={() => { saveBody(); onToggle(); }} /></div>
      <EntryForm value={{ body, tags: e.tags, whenAt: e.whenAt, taskIds: e.taskIds, trackerValues: e.trackerValues }} onChange={patch} onBodyBlur={saveBody} question={e.taskIds.length ? 'What happened, and what will you do differently?' : 'What’s on your mind?'} />
    </div>
  );
}

// ---------- Journal page (E26 / E27 / E28) ----------
export function JournalPage() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const view = st.settings.journalView;
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const fa = useAnchor();
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const pending = needsReflection(st.tasks).length;
  const ql = q.trim().toLowerCase();
  const entries = st.entries.filter(e => (!tags.length || tags.some(t => e.tags.includes(t))) && (!ql || e.body.toLowerCase().includes(ql))).sort((a, b) => b.whenAt.localeCompare(a.whenAt));
  const tagCount = (t: string) => st.entries.filter(e => e.tags.includes(t)).length;
  const filtered = tags.length > 0 || !!ql;
  const phone = useIsMobile();
  return (
    <>
      <div className="page-head">
        <div className="title"><span className="t-hl">Journal</span><span className="t-bm c-muted">{view === 'calendar' ? `${MONTHS[month.getMonth()]} ${month.getFullYear()}` : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}</span></div>
        <div className="actions">
          {pending > 0 && <Btn kind="tonal" icon="review" onClick={() => nav('/journal/review')}>{pending} to reflect on</Btn>}
          <Seg value={view} onChange={v => st.updateSettings({ journalView: v })} items={[{ value: 'calendar', icon: 'calendar', tip: 'Calendar' }, { value: 'list', icon: 'list', tip: 'List' }]} />
          {!phone && <Btn icon="add" onClick={() => ui.newEntry({ source: 'manual' })}>New entry</Btn>}
        </div>
      </div>
      <SampleBanner />
      <CheckinBar />
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        <Field sm lead="search" value={q} onChange={setQ} placeholder="Search entries" style={phone ? { flex: '1 1 160px' } : { width: 280 }} />
        <Chip icon="tag" trail="chevDown" sel={tags.length > 0} onClick={e => fa.open(e)}>{tags.length ? `Tags · ${tags.length}` : 'Tags'}</Chip>
        {tags.map(t => <Chip key={t} icon="tag" tone={tagChipTone(t)} onRemove={() => setTags(tags.filter(x => x !== t))}>{t}</Chip>)}
        {filtered && <span className="t-bs c-muted">{entries.length} of {st.entries.length} entries</span>}
        {filtered && <Btn kind="text" onClick={() => { setTags([]); setQ(''); }}>Clear</Btn>}
      </div>
      {fa.isOpen && (
        <Popover anchor={fa.el} onClose={fa.close}>
          <MenuList width={280} onClose={fa.close} items={[{ label: 'Show entries with any of these tags' }, ...st.settings.journalTags.map(t => ({ t, dot: tagDot(t), sel: tags.includes(t), sup: String(tagCount(t)), keepOpen: true, onClick: () => setTags(tags.includes(t) ? tags.filter(x => x !== t) : [...tags, t]) }))]} />
        </Popover>
      )}
      {view === 'calendar' ? <JournalCalendar month={month} setMonth={setMonth} entries={entries} /> : <JournalList entries={entries} filtered={filtered} />}
      {phone && <>
        <div className="grow" />
        <div className="fab-bar"><button className="fab state" onClick={() => ui.newEntry({ source: 'manual' })}><Icon name="add" />New entry</button></div>
      </>}
    </>
  );
}

function JournalList({ entries, filtered }: { entries: Entry[]; filtered: boolean }) {
  const st = useStore();
  const ui = useUI();
  const days = useMemo(() => {
    const m = new Map<string, Entry[]>();
    entries.forEach(e => { const k = isoDate(new Date(e.whenAt)); m.set(k, [...(m.get(k) ?? []), e]); });
    if (!filtered) st.checkins.forEach(c => { if (!c.skipped && Object.keys(c.values).length && !m.has(c.day) && c.day <= todayISO()) m.set(c.day, []); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries, filtered, st.checkins]);
  if (!days.length) return <Empty icon="book" title={filtered ? 'No entries match' : 'No journal entries yet'} body={filtered ? undefined : 'Write a line when something worth remembering happens: a win, a lesson, why a task ran over.'} action={!filtered ? <Btn icon="add" onClick={() => ui.newEntry({ source: 'manual' })}>New entry</Btn> : undefined} />;
  return (
    <div className="col gap-24">
      {days.map(([iso, list]) => (
        <div key={iso} className="col gap-8">
          <button className={cx('day-head state', ui.day?.iso === iso && 'sel')} onClick={() => ui.openDay({ iso })}>
            <span className="t-ts">{iso === todayISO() ? 'Today' : relDay(iso) === 'yesterday' ? 'Yesterday' : fmtDayShort(iso)}</span>
            <CheckinSummary day={iso} max={4} />
            <span className="grow" /><Icon name="chevRight" />
          </button>
          {list.sort((a, b) => b.whenAt.localeCompare(a.whenAt)).map(e => <EntryRow key={e.id} e={e} />)}
        </div>
      ))}
    </div>
  );
}

function EntryRow({ e }: { e: Entry }) {
  const st = useStore();
  const ui = useUI();
  const linked = e.taskIds.map(id => st.taskById(id)).filter(Boolean) as Task[];
  return (
    <button className={cx('task-row state', ui.entryId === e.id && 'sel')} style={{ padding: '14px 12px 14px 20px', textAlign: 'left', alignItems: 'flex-start' }} onClick={() => ui.openEntry(e.id)}>
      <span className="t-bs c-muted tnum" style={{ width: 64, flex: 'none', paddingTop: 4 }}>{fmtClock(e.whenAt)}</span>
      <div className="text" style={{ gap: 6 }}>
        <span className="t-bl" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.body}</span>
        <div className="meta" style={{ gap: 8 }}>
          {linked.length > 0 && <span className="m"><Icon name="subdir" />{linked[0].title}{linked.length > 1 ? ` +${linked.length - 1}` : ''}</span>}
          {e.tags.map(t => <Tag key={t} tone={tagChipTone(t)} icon="tag">{t}</Tag>)}
          <EntryTrackerPills e={e} />
        </div>
      </div>
    </button>
  );
}

function JournalCalendar({ month, setMonth, entries }: { month: Date; setMonth: (d: Date) => void; entries: Entry[] }) {
  const st = useStore();
  const ui = useUI();
  const ta = useAnchor();
  const trackers = checkinTrackers(st.settings.trackers).filter(t => t.type === 'points' || t.type === 'levels' || t.type === 'duration');
  const calT = trackers.find(t => t.id === st.settings.calendarTracker) ?? (st.settings.calendarTracker === null ? undefined : trackers[0]);
  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = addDays(first, -offset);
    const n = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(start, i));
  }, [month]);
  const byDay = useMemo(() => { const m = new Map<string, Entry[]>(); entries.forEach(e => { const k = isoDate(new Date(e.whenAt)); m.set(k, [...(m.get(k) ?? []), e]); }); return m; }, [entries]);
  const today = todayISO();
  return (
    <div className="col gap-8">
      <div className="row gap-8 jcal-toolbar">
        <IBtn icon="chevLeft" label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
        <IBtn icon="chevRight" label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
        <Btn kind="text" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</Btn>
        <span className="grow" />
        {trackers.length > 0 && <>
          {calT && <span className="row gap-6 t-bs c-muted jcal-legend">Low<span className="shade-legend" />High</span>}
          <Chip icon={calT?.icon ?? 'eyeOff'} trail="chevDown" onClick={e => ta.open(e)}>{calT ? `Calendar shows ${calT.name}` : 'No check-in on calendar'}</Chip>
        </>}
      </div>
      {ta.isOpen && <Popover anchor={ta.el} onClose={ta.close} placement="below-end"><MenuList width={260} onClose={ta.close} items={[{ label: 'Colour calendar days by' }, ...trackers.map(t => ({ t: t.name, ic: t.icon, sel: calT?.id === t.id, onClick: () => st.updateSettings({ calendarTracker: t.id }) })), { divider: true }, { t: 'Nothing', ic: 'eyeOff' as const, sel: !calT, onClick: () => st.updateSettings({ calendarTracker: null }) }]} /></Popover>}
      <div className="jcal">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="jcal-dow">{d}</div>)}
        {days.map(d => {
          const iso = isoDate(d), inM = d.getMonth() === month.getMonth();
          const list = (byDay.get(iso) ?? []).slice().sort((a, b) => a.whenAt.localeCompare(b.whenAt));
          const future = iso > today;
          const c = st.checkinFor(iso);
          const shade = calT && c && !c.skipped ? trackerShade(calT, c.values[calT.id]) : null;
          const dots = [...new Set(list.flatMap(e => e.tags))].slice(0, 4);
          return (
            <button key={iso} className={cx('jcal-day', !inM && 'out', future && 'future', ui.day?.iso === iso && 'sel')} disabled={future} onClick={() => ui.openDay({ iso })}
              aria-label={`${fmtDayLong(d)}: ${list.length} ${list.length === 1 ? 'entry' : 'entries'}`}>
              <span className="row" style={{ width: '100%' }}>
                <span className={cx('jcal-num', iso === today && 'today')}>{d.getDate()}</span>
                <span className="grow" />
                {list.length > 0 && <span className="row gap-4">{dots.map(t => <span key={t} className="dot" style={{ background: tagDot(t) }} />)}{list.length > 2 && <span className="t-bs c-muted">{list.length}</span>}</span>}
              </span>
              {list.slice(0, 2).map(e => <span key={e.id} className="t-bs jcal-line">{e.body}</span>)}
              {shade != null && <span className="jcal-shade" title={`${calT!.name}: ${fmtValue(calT!, c!.values[calT!.id])}`} style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(15 + shade * 85)}%, var(--surface-lowest))` }} />}
            </button>
          );
        })}
      </div>
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
  const blank = (): EntryValue => ({ body: '', tags: [st.settings.journalDefaults.review].filter(Boolean), whenAt: new Date().toISOString(), taskIds: [], trackerValues: {} });
  const [v, setV] = useState<EntryValue>(blank);
  const sa = useAnchor();
  const [custom, setCustom] = useState(false);
  useEffect(() => { setV(blank()); }, [sel?.id]); // eslint-disable-line
  const idx = sel ? queue.indexOf(sel) : -1;
  const next = () => { const n = queue[idx + 1] ?? queue.find(t => t.id !== sel?.id); setSelId(n?.id ?? null); };
  const snooze = (until: Date) => { if (!sel) return; st.updateTask(sel.id, { snoozeUntil: until.toISOString() }); toast.show(`Snoozed until ${relDay(isoDate(until)) === 'today' ? '' : cap(relDay(isoDate(until))) + ' '}${fmtClock(until)}`, { icon: 'snooze' }); next(); };
  const dismiss = () => { if (!sel) return; const id = sel.id; st.updateTask(id, { reflection: 'dismissed' }); toast.show('Dismissed', { action: { label: 'Undo', onClick: () => st.updateTask(id, { reflection: 'needed' }) } }); next(); };
  const reason = (t: Task) => { const o = outcome(t, st.settings); return { over: (o.diffMin ?? 0) > 0 ? o.diffMin! : 0, late: o.lateMin ?? 0 }; };
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
  const r = reason(sel);
  return (
    <>
      <Crumbs />
      <div className="page-head"><div className="title"><span className="t-hm">Needs reflection</span><span className="t-bm c-muted">{queue.length} {queue.length === 1 ? 'task' : 'tasks'} ran over their estimate or finished late. Write a line on each while it’s fresh.</span></div><span className="count" style={{ height: 32, borderRadius: 16, padding: '0 12px' }}>{idx + 1} of {queue.length}</span></div>
      <div className="row gap-24" style={{ alignItems: 'flex-start' }}>
        <div className="col gap-8" style={{ width: 340, flex: 'none' }}>
          {queue.map(t => {
            const on = t.id === sel.id;
            const rr = reason(t);
            return (
              <button key={t.id} className="row gap-12 state" onClick={() => setSelId(t.id)} style={{ alignItems: 'flex-start', padding: 16, borderRadius: 16, textAlign: 'left', background: on ? 'var(--secondary-container)' : 'var(--surface-low)', color: on ? 'var(--on-secondary-container)' : undefined }}>
                <Icon name={rr.over ? 'hourglass' : 'event'} style={{ color: on ? undefined : 'var(--outline)' }} />
                <span className="col gap-4 grow"><span className="t-tm">{t.title}</span><span className="t-bm" style={{ opacity: 0.8 }}>{t.estimateMin ? `Estimate ${fmtMin(t.estimateMin)} · took ${fmtMin(elapsed(t) / 60000)}` : `Took ${fmtMin(elapsed(t) / 60000)}`}</span></span>
                <span className="col gap-4" style={{ alignItems: 'flex-end' }}>{rr.over > 0 && <Tag kind="warn">+{fmtMin(rr.over)} over</Tag>}{rr.late > 0 && <Tag kind="err">{fmtMin(rr.late)} late</Tag>}</span>
              </button>
            );
          })}
        </div>
        <div className="col gap-24 grow" style={{ background: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 28, padding: 32 }}>
          <div className="col gap-8" style={{ alignItems: 'flex-start' }}>
            {p && <Chip emoji={p.emoji}>{p.name}</Chip>}
            <span className="t-hs">{sel.title}</span>
            <span className="t-bm c-muted">{due ? `Due ${fmtDayShort(due)} ${fmtClock(due)} · ` : ''}{sel.finishedAt ? `finished ${fmtDayShort(sel.finishedAt)} ${fmtClock(sel.finishedAt)}` : 'still open'}</span>
            <span className="row gap-8">{r.over > 0 && <Tag kind="warn" icon="hourglass">Ran {fmtMin(r.over)} over its estimate</Tag>}{r.late > 0 && <Tag kind="err" icon="event">Finished {fmtMin(r.late)} late</Tag>}</span>
          </div>
          {est > 0 && (
            <div className="col gap-8">
              <div className="row" style={{ gap: 2, height: 12 }}>
                <i style={{ flex: Math.min(est, took) || 0.01, height: 12, background: 'var(--primary)', borderRadius: 6 }} />
                {took < est && <i style={{ flex: est - took, height: 12, background: 'var(--secondary-container)', borderRadius: 6 }} />}
                {took > est && <i style={{ flex: Math.max(took - est, est * 0.03), height: 12, background: 'var(--warning)', borderRadius: 6 }} />}
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="t-bs c-muted">Took {fmtMin(took)} of a {fmtMin(est)} estimate</span>{took > est && <span className="t-lm c-warn">+{fmtMin(took - est)} over</span>}</div>
            </div>
          )}
          <EntryForm value={v} onChange={pp => setV(x => ({ ...x, ...pp }))} question="What happened, and what will you do differently?" showWhen={false} showLinked={false} autoFocus />
          <div className="dialog-actions" style={{ paddingTop: 0 }}>
            <Btn kind="text" icon="snooze" onClick={e => sa.open(e)}>Snooze</Btn>
            <Btn kind="text" icon="close" onClick={dismiss}>Dismiss</Btn>
            <span className="spacer" />
            <Btn kind="outlined" onClick={next} disabled={queue.length < 2}>Skip for now</Btn>
            <Btn icon="check" disabled={!v.body.trim()} onClick={() => {
              st.addEntry({ body: v.body.trim(), tags: v.tags, taskIds: [sel.id], whenAt: sel.finishedAt ?? new Date().toISOString(), trackerValues: v.trackerValues });
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
