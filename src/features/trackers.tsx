import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon } from '../ui/Icon';
import { Btn, Chip, Dialog, IBtn, MenuList, Popover, Tag, cx, useAnchor } from '../ui/kit';
import { TimeInput } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import { tagChipTone } from '../lib/select';
import {
  ICON_CHOICES, SUGGESTIONS, TYPE_HELP, TYPE_ICON, TYPE_LABEL, blankTracker, checkinTrackers, describe, entryTrackers, fmtValue, shortType, trackerId,
  type Tracker, type TrackerType, type TrackerValue, type TrackerValues,
} from '../lib/trackers';
import { addDays, fmtDayLong, fmtDayShort, fmtMin, isoDate, parseDate, todayISO } from '../lib/time';
import type { Entry } from '../lib/types';

// ---------- inputs ----------
function Stepper({ value, unit, onChange, step = 1, min = 0, max = 999 }: { value: number; unit: string; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="row gap-8">
      <IBtn sm icon="remove" kind="outlined" label={`Less ${unit}`} onClick={() => set(value - step)} />
      <label className="row gap-4" style={{ height: 43, padding: '6px 14px', borderRadius: 10, background: 'var(--surface-high)', alignItems: 'baseline' }}>
        <input aria-label={unit} inputMode="numeric" value={value} onChange={e => set(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
          style={{ width: `${Math.max(1, String(value).length) + 0.6}ch`, border: 0, outline: 0, background: 'transparent', font: '400 22px/31px var(--font)', textAlign: 'right' }} />
        <span className="t-bm c-muted">{unit}</span>
      </label>
      <IBtn sm icon="add" kind="outlined" label={`More ${unit}`} onClick={() => set(value + step)} />
    </div>
  );
}

export function PointsScale({ t, value, onChange, size = 'md' }: { t: Tracker; value?: number; onChange?: (v: number | undefined) => void; size?: 'sm' | 'md' | 'lg' }) {
  const n = (t.max ?? 5) - (t.min ?? 1) + 1;
  const w = size === 'lg' ? 56 : size === 'md' ? 48 : 28, h = size === 'lg' ? 40 : size === 'md' ? 36 : 28;
  const worse = t.higherIs === 'worse';
  return (
    <div className="col gap-4" style={{ width: 'fit-content' }}>
      <div className="row" style={{ gap: size === 'sm' ? 4 : 8, flexWrap: 'wrap' }}>
        {Array.from({ length: n }, (_, i) => (t.min ?? 1) + i).map(v => {
          const on = value === v;
          return (
            <button key={v} type="button" disabled={!onChange} aria-pressed={on} onClick={() => onChange?.(on ? undefined : v)}
              className={cx(onChange && 'state')}
              style={{
                width: n > 7 && size !== 'sm' ? 40 : w, height: h, borderRadius: size === 'sm' ? 8 : 10, display: 'grid', placeItems: 'center',
                font: `500 ${size === 'sm' ? 12 : size === 'lg' ? 16 : 14}px/20px var(--font)`,
                background: on ? (worse ? 'var(--error-container)' : 'var(--primary)') : 'var(--surface-high)',
                color: on ? (worse ? 'var(--on-error-container)' : 'var(--on-primary)') : 'var(--on-surface-variant)',
                boxShadow: on && worse ? 'inset 0 0 0 1px var(--error)' : undefined, cursor: onChange ? 'pointer' : 'default',
              }}>{v}</button>
          );
        })}
      </div>
      {size !== 'sm' && (t.minLabel || t.maxLabel) && <div className="row t-bs c-muted" style={{ justifyContent: 'space-between' }}><span>{t.minLabel}</span><span>{t.maxLabel}</span></div>}
    </div>
  );
}

export function TrackerInput({ t, value, onChange, size = 'md' }: { t: Tracker; value: TrackerValue | undefined; onChange: (v: TrackerValue | undefined) => void; size?: 'md' | 'lg' }) {
  switch (t.type) {
    case 'points': return <PointsScale t={t} value={value as number | undefined} onChange={onChange} size={size} />;
    case 'levels': return (
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        {(t.levels ?? []).map((l, i) => <Chip key={i} sel={value === i} onClick={() => onChange(value === i ? undefined : i)} className="lvl">{l}</Chip>)}
      </div>
    );
    case 'duration': {
      const m = typeof value === 'number' ? value : null;
      const h = m == null ? 0 : Math.floor(m / 60), mm = m == null ? 0 : m % 60;
      return (
        <div className="row gap-20" style={{ gap: 20, opacity: m == null ? 0.7 : 1 }}>
          <Stepper value={h} unit="h" max={24} onChange={x => onChange(x * 60 + mm)} />
          {/* minutes roll over: 55 + 5 → next hour, typing 90 → 1h 30m */}
          <Stepper value={mm} unit="min" step={5} min={-5} max={999} onChange={x => onChange(Math.max(0, Math.min(24 * 60, h * 60 + x)))} />
          {m != null && <Btn kind="text" onClick={() => onChange(undefined)}>Clear</Btn>}
        </div>
      );
    }
    case 'time': {
      const v = typeof value === 'string' ? value : '';
      const lastNight = t.id === 'bedtime' || /bed/i.test(t.name);
      return (
        <div className="row gap-12">
          <TimeInput value={v} onChange={onChange} label={t.name} />
          {v && lastNight && <span className="t-bm c-muted">{Number(v.slice(0, 2)) >= 12 ? 'last night' : 'after midnight'}</span>}
          {v && <Btn kind="text" onClick={() => onChange(undefined)}>Clear</Btn>}
        </div>
      );
    }
    case 'count': return <div className="row gap-12" style={{ opacity: value == null ? 0.7 : 1 }}><Stepper value={typeof value === 'number' ? value : 0} unit={t.unit || 'times'} onChange={onChange} />{value != null && <Btn kind="text" onClick={() => onChange(undefined)}>Clear</Btn>}</div>;
    case 'group': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          {(t.options ?? []).map(o => {
            const on = arr.includes(o);
            return <Chip key={o} sel={on} onClick={() => onChange(t.multi ? (on ? arr.filter(x => x !== o) : [...arr, o]) : on ? [] : [o])}>{o}</Chip>;
          })}
        </div>
      );
    }
  }
}

/** compact preview used in Settings rows (J01) */
export function TrackerPreview({ t }: { t: Tracker }) {
  if (t.type === 'points') return <PointsScale t={t} size="sm" />;
  if (t.type === 'levels') return (
    <div className="row" style={{ border: '1px solid var(--outline-variant)', borderRadius: 8, overflow: 'hidden' }}>
      {(t.levels ?? []).map((l, i) => <span key={i} className="t-lm c-muted" style={{ padding: '5px 10px', borderLeft: i ? '1px solid var(--outline-variant)' : undefined }}>{l}</span>)}
    </div>
  );
  if (t.type === 'group') {
    const opts = t.options ?? [];
    return <div className="row gap-6">{opts.slice(0, 2).map(o => <span key={o} className="vpill">{o}</span>)}{opts.length > 2 && <span className="vpill">+{opts.length - 2}</span>}</div>;
  }
  const sample = t.type === 'duration' ? '7h 30m' : t.type === 'time' ? '11:30 pm' : `3${t.unit ? ' ' + t.unit : ''}`;
  return <span className="vpill"><Icon name={t.type === 'duration' ? 'timer' : t.type === 'time' ? 'clock' : 'checklist'} />{sample}</span>;
}

/** "Cause · Missed a step" / "Severity 3/5" pills on journal rows (J05) */
export function EntryTrackerPills({ e }: { e: Entry }) {
  const st = useStore();
  const pills = st.settings.trackers.filter(t => e.trackerValues[t.id] != null && !(Array.isArray(e.trackerValues[t.id]) && !(e.trackerValues[t.id] as string[]).length));
  return (
    <>
      {pills.map(t => {
        const v = e.trackerValues[t.id];
        const bad = t.type === 'points' && t.higherIs === 'worse';
        return (
          <span key={t.id} className="vpill" style={bad ? { background: 'var(--error-container)', color: 'var(--on-error-container)' } : undefined}>
            <Icon name={t.type === 'group' ? 'list' : t.icon} />{t.type === 'points' ? `${t.name} ${v}/${t.max}` : `${t.name} · ${fmtValue(t, v)}`}
          </span>
        );
      })}
    </>
  );
}

// ---------- Entry trackers (J07 / J08) ----------
export function EntryTrackersEditor({ tags, values, onChange, compact }: { tags: string[]; values: TrackerValues; onChange: (v: TrackerValues) => void; compact?: boolean }) {
  const st = useStore();
  const asked = entryTrackers(st.settings.trackers, tags);
  const extra = st.settings.trackers.filter(t => !t.archived && t.askOn !== 'checkin' && !asked.includes(t) && values[t.id] != null);
  const list = [...asked, ...extra];
  const [added, setAdded] = useState<string[]>([]);
  const optional = st.settings.trackers.filter(t => !t.archived && t.askOn !== 'checkin' && !list.includes(t));
  const shown = [...list, ...optional.filter(t => added.includes(t.id))];
  const am = useAnchor();
  const reason = (() => {
    const tagged = asked.filter(t => t.askOn === 'tagged');
    const hit = [...new Set(tagged.flatMap(t => t.tags.filter(x => tags.includes(x))))];
    return hit.length ? `Asked because the tag is ${hit.join(', ')}` : null;
  })();
  const set = (id: string, v: TrackerValue | undefined) => { const n = { ...values }; if (v == null || (Array.isArray(v) && !v.length)) delete n[id]; else n[id] = v; onChange(n); };
  if (compact) {
    return (
      <div className="col gap-8">
        {shown.length === 0 && <span className="t-bs c-muted">No trackers for these tags.</span>}
        {shown.map(t => (
          <div key={t.id} className="col gap-6">
            <span className="t-bm">{t.name}</span>
            <TrackerInput t={t} value={values[t.id]} onChange={v => set(t.id, v)} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="col" style={{ gap: 14, paddingTop: 4 }}>
      <div className="row gap-8" style={{ minHeight: 40 }}>
        <span className="t-ts c-muted">Trackers</span>
        {reason && <span className="vpill"><Icon name="tag" />{reason}</span>}
        <span className="grow" />
        <Btn kind="text" icon="add" onClick={e => am.open(e as any)}>Add a tracker</Btn>
      </div>
      {shown.map(t => {
        const removable = added.includes(t.id) || (!asked.includes(t) && values[t.id] != null);
        return (
          <div key={t.id} className="row gap-16" style={{ alignItems: 'flex-start' }}>
            <div className="col gap-2" style={{ width: 104, flex: 'none' }}><span className="t-ts">{t.name}</span><span className="t-bs c-muted">{t.type === 'group' ? `Pick ${t.multi ? 'any' : 'one'}` : t.question}</span></div>
            <div className="grow"><TrackerInput t={t} value={values[t.id]} onChange={v => set(t.id, v)} /></div>
            {removable && <IBtn sm icon="close" label={`Remove ${t.name}`} onClick={() => { setAdded(added.filter(x => x !== t.id)); set(t.id, undefined); }} />}
          </div>
        );
      })}
      {!shown.length && <span className="t-bs c-muted">No trackers are asked for these tags. Add one if you like.</span>}
      {am.isOpen && <Popover anchor={am.el} onClose={am.close} placement="below-end"><MenuList width={280} onClose={am.close} items={[
        ...optional.filter(t => !added.includes(t.id)).map(t => ({ t: t.name, ic: t.icon, sub: shortType(t), onClick: () => setAdded([...added, t.id]) })),
        ...(optional.filter(t => !added.includes(t.id)).length ? [] : [{ note: 'Every entry tracker is already here. Add more in Settings → Trackers.' }]),
      ]} /></Popover>}
    </div>
  );
}

/** J08: the day's check-in shown inside the entry drawer */
export function DayCheckinCard({ day }: { day: string }) {
  const st = useStore();
  const c = st.checkinFor(day);
  const trackers = checkinTrackers(st.settings.trackers).filter(t => c?.values[t.id] != null && t.type !== 'time').slice(0, 3);
  if (!c || c.skipped || !trackers.length) return null;
  // compare to the user's average over the last 30 days
  const notes: string[] = [];
  const recent = st.checkins.filter(x => x.day < day && x.day >= isoDate(addDays(parseDate(day), -30)) && !x.skipped);
  trackers.forEach(t => {
    if (t.type !== 'duration' && t.type !== 'points') return;
    const vals = recent.map(x => x.values[t.id]).filter(v => typeof v === 'number') as number[];
    if (vals.length < 4) return;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const v = c.values[t.id] as number;
    if (t.type === 'duration') {
      const diff = v - avg;
      notes.push(Math.abs(diff) < 15 ? `${t.name} about usual` : `${diff < 0 ? 'Less' : 'More'} ${t.name.toLowerCase()} than usual (${fmtMin(avg)} on average)`);
    } else {
      const diff = v - avg;
      notes.push(Math.abs(diff) < 0.5 ? `${t.name} about normal` : `${t.name} ${diff < 0 ? 'lower' : 'higher'} than usual`);
    }
  });
  return (
    <div className="col gap-8" style={{ background: 'var(--surface-container)', borderRadius: 12, padding: 12 }}>
      <span className="row gap-6 t-lm c-muted"><Icon name="sun" size={16} />That day’s check-in · {fmtDayShort(day)}</span>
      <div className="row gap-8">
        {trackers.map(t => (
          <div key={t.id} className="col gap-2 grow" style={{ background: 'var(--surface-lowest)', borderRadius: 8, padding: '8px 10px', flexBasis: 0 }}>
            <span className="t-ls c-muted" style={{ fontWeight: 400 }}>{t.name}</span><span className="t-ts">{fmtValue(t, c.values[t.id])}</span>
          </div>
        ))}
      </div>
      {notes.length > 0 && <span className="t-bs c-muted">{notes.join('. ')}.</span>}
    </div>
  );
}

// ---------- Daily check-in (J05 card / J06 dialog) ----------
export function CheckinCard() {
  const st = useStore();
  const day = todayISO();
  const c = st.checkinFor(day);
  const trackers = checkinTrackers(st.settings.trackers);
  const [open, setOpen] = useState(false);
  if (!trackers.length || c?.skipped) return open ? <CheckinDialog onClose={() => setOpen(false)} /> : null;
  const logged = trackers.filter(t => c?.values[t.id] != null).length;
  if (logged === trackers.length && !open) return null;
  const quick = (t: Tracker, v: TrackerValue | undefined) => { const n = { ...(c?.values ?? {}) }; if (v == null) delete n[t.id]; else n[t.id] = v; st.saveCheckin(day, n); };
  return (
    <div className="col gap-16" style={{ background: 'var(--surface-container)', borderRadius: 16, padding: 20 }}>
      <div className="row gap-16">
        <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--primary-container)', color: 'var(--on-primary-container)' }}><Icon name="sun" /></span>
        <div className="col gap-2 grow"><span className="t-tm">Today’s check-in</span><span className="t-bs c-muted">{fmtDayShort(day)} · {logged} of {trackers.length} logged · takes 10 seconds</span></div>
        <Btn kind="text" onClick={() => st.skipCheckin(day)}>Skip today</Btn>
        <Btn kind="tonal" onClick={() => setOpen(true)}>Open check-in</Btn>
      </div>
      <div className="row gap-8">
        {trackers.slice(0, 4).map(t => {
          const v = c?.values[t.id];
          const missing = v == null;
          return (
            <div key={t.id} className="col grow" style={{ flexBasis: 0, gap: 6, background: 'var(--surface-lowest)', borderRadius: 12, padding: '12px 14px', boxShadow: missing ? 'inset 0 0 0 1px var(--primary)' : undefined, minWidth: 0 }}>
              <span className="row gap-6 t-lm" style={{ color: missing ? 'var(--primary)' : 'var(--on-surface-variant)' }}><Icon name={t.icon} size={16} />{t.name}{missing ? ' · not logged yet' : ''}</span>
              {missing && (t.type === 'points' || t.type === 'levels')
                ? (t.type === 'points' ? <PointsScale t={t} size="sm" value={undefined} onChange={x => quick(t, x)} />
                  : <div className="row gap-4" style={{ flexWrap: 'wrap' }}>{(t.levels ?? []).map((l, i) => <button key={i} className="vpill state" onClick={() => quick(t, i)}>{l}</button>)}</div>)
                : missing ? <button className="t-bm c-primary" style={{ textAlign: 'left' }} onClick={() => setOpen(true)}>Log it</button>
                : <span className="t-tm">{fmtValue(t, v)}</span>}
            </div>
          );
        })}
      </div>
      {open && <CheckinDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

export function CheckinDialog({ onClose, day = todayISO() }: { onClose: () => void; day?: string }) {
  const st = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const existing = st.checkinFor(day);
  const [values, setValues] = useState<TrackerValues>(existing?.values ?? {});
  const trackers = checkinTrackers(st.settings.trackers);
  const set = (id: string, v: TrackerValue | undefined) => setValues(x => { const n = { ...x }; if (v == null) delete n[id]; else n[id] = v; return n; });
  return (
    <Dialog onClose={onClose} width={640} label="Daily check-in" className="dlg-low">
      <div className="row gap-12"><Icon name="sun" style={{ color: 'var(--primary)' }} /><span className="t-hs grow">Daily check-in</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <span className="t-bm c-muted" style={{ marginTop: -8 }}>{fmtDayLong(parseDate(day))} · everything here is optional</span>
      {trackers.map(t => (
        <div key={t.id} className="col" style={{ gap: 10, background: 'var(--surface-lowest)', borderRadius: 16, padding: 16 }}>
          <div className="row gap-8"><Icon name={t.icon} size={18} style={{ color: 'var(--on-surface-variant)' }} /><span className="t-ts grow">{t.question || t.name}</span><span className="t-bs c-faint">{t.name}</span></div>
          <TrackerInput t={t} value={values[t.id]} onChange={v => set(t.id, v)} size="lg" />
        </div>
      ))}
      <div className="dialog-actions">
        <Btn kind="text" icon="settings" onClick={() => { onClose(); nav('/settings/trackers'); }}>Edit trackers</Btn>
        <span className="spacer" />
        <Btn kind="text" onClick={() => { st.skipCheckin(day); onClose(); }}>Skip today</Btn>
        <Btn onClick={() => { st.saveCheckin(day, values); toast.show('Check-in saved', { icon: 'checkCircle', duration: 2500 }); onClose(); }}>Save</Btn>
      </div>
    </Dialog>
  );
}

// ---------- Settings · Trackers (J01) ----------
export function TrackersSettings() {
  const st = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const all = st.settings.trackers;
  const [edit, setEdit] = useState<Tracker | Omit<Tracker, 'id'> | null>(null);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<{ t: Tracker; el: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const ra = useAnchor();
  const save = (list: Tracker[]) => st.updateSettings({ trackers: list });
  const daily = all.filter(t => !t.archived && t.askOn === 'checkin');
  const onEntries = all.filter(t => !t.archived && t.askOn !== 'checkin');
  const archived = all.filter(t => t.archived);
  const move = (id: string, to: string) => {
    if (id === to) return;
    const l = all.slice(); const from = l.findIndex(x => x.id === id); const [x] = l.splice(from, 1); l.splice(l.findIndex(y => y.id === to), 0, x); save(l);
  };
  const row = (t: Tracker, i: number) => (
    <div key={t.id} className="row gap-16 trk-row" draggable onDragStart={() => setDrag(t.id)} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag) move(drag, t.id); setDrag(null); }}
      style={{ minHeight: 72, paddingRight: 8, borderTop: i ? '1px solid var(--outline-variant)' : undefined, opacity: drag === t.id ? 0.4 : 1 }}>
      <Icon name="drag" style={{ color: 'var(--outline)', cursor: 'grab' }} />
      <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: t.type === 'points' && t.higherIs === 'worse' ? 'var(--error-container)' : 'var(--secondary-container)', color: t.type === 'points' && t.higherIs === 'worse' ? 'var(--on-error-container)' : 'var(--on-secondary-container)' }}><Icon name={t.icon} /></span>
      <button className="col gap-2 grow" style={{ textAlign: 'left' }} onClick={() => setEdit(t)}><span className="t-tm">{t.name}</span><span className="t-bm c-muted">{describe(t)}</span></button>
      <span className="trk-prev"><TrackerPreview t={t} /></span>
      {t.askOn !== 'checkin' && <span className="vpill"><Icon name={t.askOn === 'every' ? 'book' : 'tag'} />{t.askOn === 'every' ? 'Every entry' : `Tagged ${t.tags.join(', ') || '—'}`}</span>}
      <IBtn sm icon="more" label={`${t.name} options`} onClick={e => setMenu({ t, el: e.currentTarget as HTMLElement })} />
    </div>
  );
  return (
    <>
      <div className="row gap-12 trk-head">
        <div className="col gap-4 grow"><span className="t-tl">Journal trackers</span><span className="t-bm c-muted">Add your own scales and groups to the journal. All optional: each tracker only appears where you ask for it.</span></div>
        <Btn kind="outlined" icon="lightbulb" onClick={() => setAdding(true)}>Browse suggestions</Btn>
        <Btn icon="add" onClick={() => setAdding(true)}>Add tracker</Btn>
      </div>
      <section className="set-card" style={{ gap: 0, paddingBottom: 12 }}>
        <div className="row gap-16 trk-sec-head" style={{ paddingBottom: 8 }}>
          <div className="col gap-4 grow"><span className="t-tm">Daily check-in</span><span className="t-bm c-muted">Asked once a day from the top of Journal. Good for things about the day, like sleep and energy. Skip it any time.</span></div>
          <Chip icon="alarm" trail="chevDown" onClick={e => ra.open(e)}>{st.settings.checkinRemind ? `Remind me · ${fmtTime(st.settings.checkinRemind)}` : 'No reminder'}</Chip>
        </div>
        {daily.map(row)}
        {!daily.length && <span className="t-bm c-muted" style={{ padding: '12px 0' }}>No check-in trackers. Add one, and a short check-in appears at the top of Journal.</span>}
      </section>
      <section className="set-card" style={{ gap: 0, paddingBottom: 12 }}>
        <div className="col gap-4" style={{ paddingBottom: 8 }}><span className="t-tm">On journal entries</span><span className="t-bm c-muted">Asked inside an entry: on every entry, or only when it has a certain tag.</span></div>
        {onEntries.map(row)}
        <div className="row gap-16 trk-row trk-tags" style={{ minHeight: 72, paddingRight: 8, borderTop: onEntries.length ? '1px solid var(--outline-variant)' : undefined }}>
          <span className="trk-spacer" style={{ width: 24 }} />
          <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--secondary-container)', color: 'var(--on-secondary-container)' }}><Icon name="tag" /></span>
          <button className="col gap-2 grow" style={{ textAlign: 'left' }} onClick={() => nav('/settings/default-tags')}><span className="t-tm">Tags</span><span className="t-bm c-muted">Group · built-in · edit in Default tags</span></button>
          <div className="row gap-6 trk-prev">{st.settings.journalTags.slice(0, 2).map(t => { const tone = tagChipTone(t); return <span key={t} className="vpill" style={tone ? { background: tone[0], color: tone[1] } : undefined}>{t}</span>; })}{st.settings.journalTags.length > 2 && <span className="vpill">+{st.settings.journalTags.length - 2}</span>}</div>
          <span className="vpill"><Icon name="book" />Every entry</span>
          <span style={{ width: 32 }} />
        </div>
      </section>
      {archived.length > 0 && (
        <div className="col gap-8">
          <button className="row gap-8 state trk-arch" style={{ alignSelf: 'flex-start', padding: 4, borderRadius: 8 }} onClick={() => setShowArchived(!showArchived)}>
            <Icon name={showArchived ? 'chevDown' : 'chevRight'} size={20} /><span className="t-ts c-muted">Archived ({archived.length})</span>
            {!showArchived && <span className="t-bm c-faint">·  {archived.map(a => a.name).join(', ')}. Hidden from new entries, still kept in Insights.</span>}
          </button>
          {showArchived && <section className="set-card" style={{ gap: 0 }}>{archived.map((t, i) => (
            <div key={t.id} className="row gap-16" style={{ minHeight: 56, borderTop: i ? '1px solid var(--outline-variant)' : undefined }}>
              <Icon name={t.icon} style={{ color: 'var(--outline)' }} /><span className="col grow"><span className="t-bl">{t.name}</span><span className="t-bs c-muted">{describe(t)}</span></span>
              <Btn kind="text" onClick={() => save(all.map(x => x.id === t.id ? { ...x, archived: false } : x))}>Restore</Btn>
            </div>
          ))}</section>}
        </div>
      )}
      {menu && <Popover anchor={menu.el} onClose={() => setMenu(null)} placement="below-end"><MenuList width={220} onClose={() => setMenu(null)} items={[
        { t: 'Edit', ic: 'edit', onClick: () => setEdit(menu.t) },
        menu.t.askOn === 'checkin'
          ? { t: 'Ask on journal entries instead', ic: 'book', onClick: () => save(all.map(x => x.id === menu.t.id ? { ...x, askOn: 'every' } : x)) }
          : { t: 'Ask in the daily check-in instead', ic: 'sun', onClick: () => save(all.map(x => x.id === menu.t.id ? { ...x, askOn: 'checkin' } : x)) },
        { t: 'Archive', ic: 'folder', onClick: () => save(all.map(x => x.id === menu.t.id ? { ...x, archived: true } : x)) },
      ]} /></Popover>}
      {ra.isOpen && <Popover anchor={ra.el} onClose={ra.close} placement="below-end"><MenuList width={240} onClose={ra.close} items={[
        { label: 'Remind me to check in' },
        ...['08:00', '08:30', '09:00', '09:30', '10:00'].map(h => ({ t: fmtTime(h), sel: st.settings.checkinRemind === h, onClick: () => st.updateSettings({ checkinRemind: h }) })),
        { divider: true }, { t: 'No reminder', ic: 'bellOff', sel: !st.settings.checkinRemind, onClick: () => st.updateSettings({ checkinRemind: null }) },
      ]} /></Popover>}
      {adding && <AddTrackerDialog onClose={() => setAdding(false)} onPick={t => { setAdding(false); setEdit(t); }} />}
      {edit && <EditTrackerDialog initial={edit} onClose={() => setEdit(null)} onSave={t => {
        const prev = all.find(x => x.id === t.id);
        save(prev ? all.map(x => (x.id === t.id ? t : x)) : [...all, t]);
        if (!prev || prev.archived) toast.show(`${t.name} added to ${t.askOn === 'checkin' ? 'the daily check-in' : t.askOn === 'every' ? 'every journal entry' : `entries tagged ${t.tags.join(', ')}`}`, { icon: 'checkCircle' });
        setEdit(null);
      }} onArchive={'id' in edit ? () => { save(all.map(x => (x.id === (edit as Tracker).id ? { ...x, archived: true } : x))); setEdit(null); } : undefined} />}
    </>
  );
}
const fmtTime = (h: string) => { const [a, b] = h.split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a >= 12 ? 'pm' : 'am'}`; };

// ---------- Add a tracker (J02) ----------
function AddTrackerDialog({ onClose, onPick }: { onClose: () => void; onPick: (t: Omit<Tracker, 'id'> | Tracker) => void }) {
  const st = useStore();
  const has = (name: string) => st.settings.trackers.find(t => t.name.toLowerCase() === name.toLowerCase());
  const types: TrackerType[] = ['points', 'levels', 'duration', 'time', 'count', 'group'];
  return (
    <Dialog onClose={onClose} width={840} label="Add a tracker" className="dlg-low">
      <div className="row gap-12"><Icon name="add" /><span className="t-hs grow">Add a tracker</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <span className="t-ts c-muted">Start from a suggestion</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {SUGGESTIONS.map(s => {
          const existing = has(s.name);
          const added = existing && !existing.archived;
          return (
            <button key={s.name} disabled={!!added} className={cx('row gap-12', !added && 'state')} onClick={() => {
              // archived ones come back with their history; the edit dialog asks where it should be asked
              if (existing?.archived) onPick({ ...existing, archived: false });
              else onPick({ ...s, id: trackerId(s.name) } as Tracker);
            }}
              style={{ textAlign: 'left', padding: '10px 12px 10px 10px', borderRadius: 12, background: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)' }}>
              <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: added ? 'var(--surface-high)' : 'var(--secondary-container)', color: added ? 'var(--outline)' : 'var(--on-secondary-container)' }}><Icon name={s.icon} size={20} /></span>
              <span className="col grow"><span className="t-ts" style={{ color: added ? 'var(--outline)' : undefined }}>{s.name}</span><span className="t-bs c-muted">{shortType(s as Tracker)}</span></span>
              {added ? <span className="vpill"><Icon name="check" />Added</span> : <Icon name="add" style={{ color: 'var(--primary)' }} />}
            </button>
          );
        })}
      </div>
      <span className="t-ts c-muted">Or build your own</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {types.map(ty => (
          <button key={ty} className="col gap-8 state" onClick={() => onPick(blankTracker(ty))} style={{ textAlign: 'left', padding: 16, borderRadius: 12, background: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)' }}>
            <span className="row gap-10" style={{ gap: 10 }}><Icon name={TYPE_ICON[ty]} size={20} style={{ color: 'var(--primary)' }} /><span className="t-ts">{TYPE_LABEL[ty]}</span></span>
            <span className="t-bs c-muted">{TYPE_HELP[ty]}</span>
          </button>
        ))}
      </div>
      <div className="dialog-actions"><span className="t-bs c-muted">Every tracker can be renamed, re-ranged or archived later.</span><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn></div>
    </Dialog>
  );
}

// ---------- Edit tracker (J03 / J04) ----------
function LabeledInput({ label, value, onChange, width, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; width?: number | string; type?: string; placeholder?: string }) {
  return (
    <label className="col gap-4" style={{ width, flex: width ? 'none' : 1, minWidth: 0 }}>
      <span className="t-lm c-muted">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="t-bl"
        style={{ height: 48, padding: '0 12px 0 16px', borderRadius: 8, border: '1px solid var(--outline)', background: 'var(--surface-lowest)', outline: 0, width: '100%' }} />
    </label>
  );
}
function SegPick<T extends string>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" style={{ height: 36 }}>
      {items.map(([v, l]) => <button key={v} type="button" className={cx('state', v === value && 'on')} onClick={() => onChange(v)} style={{ padding: '0 14px', minWidth: 0, font: '500 13px/19px var(--font)' }}>{v === value && <Icon name="check" size={18} />}{l}</button>)}
    </div>
  );
}

function EditTrackerDialog({ initial, onClose, onSave, onArchive }: { initial: Tracker | Omit<Tracker, 'id'>; onClose: () => void; onSave: (t: Tracker) => void; onArchive?: () => void }) {
  const st = useStore();
  const [t, setT] = useState<Tracker>(() => ({ id: 'id' in initial ? initial.id : '', ...initial } as Tracker));
  const isNew = !st.settings.trackers.some(x => x.id === t.id);
  const ia = useAnchor(), ta = useAnchor();
  const [preview, setPreview] = useState<TrackerValue | undefined>(undefined);
  const up = (p: Partial<Tracker>) => setT(x => ({ ...x, ...p }));
  const changeType = (type: TrackerType) => setT(x => ({ ...blankTracker(type), id: x.id, name: x.name, question: x.question, icon: x.icon, askOn: x.askOn, tags: x.tags }));
  const nameClash = st.settings.trackers.some(x => x.id !== t.id && x.name.trim().toLowerCase() === t.name.trim().toLowerCase());
  const valid = t.name.trim() && !nameClash && (t.type !== 'levels' || (t.levels ?? []).filter(Boolean).length >= 2) && (t.type !== 'group' || (t.options ?? []).filter(Boolean).length >= 1) && (t.type !== 'points' || (t.max ?? 0) > (t.min ?? 0)) && (t.askOn !== 'tagged' || t.tags.length > 0);
  const levels = t.levels ?? [], options = t.options ?? [];
  const [dragL, setDragL] = useState<number | null>(null);
  return (
    <Dialog onClose={onClose} width={720} label={isNew ? 'New tracker' : 'Edit tracker'} className="dlg-low">
      <div className="row gap-12"><Icon name={isNew ? 'add' : 'edit'} /><span className="t-hs grow">{isNew ? 'New tracker' : 'Edit tracker'}</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <div className="row gap-12" style={{ alignItems: 'flex-end' }}>
        <div className="col gap-4"><span className="t-lm c-muted">Icon</span>
          <button className="state" aria-label="Change icon" onClick={e => ia.open(e)} style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', background: t.type === 'points' && t.higherIs === 'worse' ? 'var(--error-container)' : 'var(--secondary-container)' }}><Icon name={t.icon} /></button>
        </div>
        <LabeledInput label="Name" value={t.name} onChange={v => up({ name: v })} placeholder="e.g. Focus" />
        <LabeledInput label="Question when logging" value={t.question} onChange={v => up({ question: v })} placeholder="e.g. How focused were you?" />
      </div>
      {nameClash && <span className="t-bs c-error" style={{ marginTop: -8 }}>You already have a tracker with this name.</span>}
      <div className="col gap-8"><span className="t-ts c-muted">Type</span>
        <SegPick value={t.type} onChange={changeType} items={(['points', 'levels', 'duration', 'time', 'count', 'group'] as TrackerType[]).map(x => [x, TYPE_LABEL[x]])} />
      </div>

      {t.type === 'points' && (
        <>
          <div className="row gap-12">
            <LabeledInput label="From" width={88} type="number" value={String(t.min ?? 1)} onChange={v => up({ min: Math.max(0, Math.min(Number(v) || 0, 9)) })} />
            <LabeledInput label="To" width={88} type="number" value={String(t.max ?? 5)} onChange={v => up({ max: Math.max(1, Math.min(Number(v) || 1, 10)) })} />
            <LabeledInput label={`Label for ${t.min ?? 1}`} value={t.minLabel ?? ''} onChange={v => up({ minLabel: v })} />
            <LabeledInput label={`Label for ${t.max ?? 5}`} value={t.maxLabel ?? ''} onChange={v => up({ maxLabel: v })} />
          </div>
          <div className="row gap-16">
            <div className="col gap-2 grow"><span className="t-ts">A higher number is…</span><span className="t-bs c-muted">Tells Insights which way is good, so patterns read correctly.</span></div>
            <SegPick value={t.higherIs ?? 'better'} onChange={v => up({ higherIs: v })} items={[['better', 'Better'], ['worse', 'Worse']]} />
          </div>
        </>
      )}
      {t.type === 'levels' && (
        <div className="col gap-6">
          <div className="row"><span className="t-ts c-muted grow">Levels, worst to best</span><span className="t-bs c-faint">{levels.length} of 7</span></div>
          {levels.map((l, i) => (
            <div key={i} className="row gap-10" draggable onDragStart={() => setDragL(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragL == null) return; const n = levels.slice(); const [x] = n.splice(dragL, 1); n.splice(i, 0, x); up({ levels: n }); setDragL(null); }}
              style={{ height: 40, padding: '0 8px', borderRadius: 8, border: '1px solid var(--outline-variant)', background: 'var(--surface-lowest)', gap: 10 }}>
              <Icon name="drag" size={20} style={{ color: 'var(--outline)', cursor: 'grab' }} /><span className="t-lm c-faint" style={{ width: 10 }}>{i + 1}</span>
              <input className="inline-input t-bm" value={l} onChange={e => up({ levels: levels.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Level ${i + 1}`} />
              <IBtn sm icon="close" label="Remove level" disabled={levels.length <= 2} onClick={() => up({ levels: levels.filter((_, j) => j !== i) })} />
            </div>
          ))}
          {levels.length < 7 && <div><Btn kind="text" icon="add" onClick={() => up({ levels: [...levels, ''] })}>Add level</Btn></div>}
        </div>
      )}
      {t.type === 'count' && <div className="row gap-12"><LabeledInput label="Unit" width={280} value={t.unit ?? ''} onChange={v => up({ unit: v })} placeholder="e.g. coffees" /></div>}
      {t.type === 'group' && (
        <div className="col gap-8">
          <div className="row gap-16"><span className="t-ts c-muted grow">Options</span><SegPick value={t.multi ? 'many' : 'one'} onChange={v => up({ multi: v === 'many' })} items={[['one', 'Pick one'], ['many', 'Pick any']]} /></div>
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            {options.map((o, i) => <Chip key={i} onRemove={() => up({ options: options.filter((_, j) => j !== i) })}>{o}</Chip>)}
            <input className="t-bm" placeholder="Add an option, then Enter" aria-label="Add option" style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px dashed var(--outline)', background: 'transparent', outline: 0, width: 220 }}
              onKeyDown={e => { const v = (e.target as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v && !options.includes(v)) { up({ options: [...options, v] }); (e.target as HTMLInputElement).value = ''; } }} />
          </div>
        </div>
      )}
      {(t.type === 'duration' || t.type === 'time') && <span className="t-bs c-muted">{t.type === 'duration' ? 'Logged in hours and minutes.' : 'Logged as a clock time.'}</span>}

      <div className="col" style={{ gap: 10 }}>
        <span className="t-ts c-muted">Ask on</span>
        {([['checkin', 'Daily check-in', 'Once a day, at the top of Journal'], ['every', 'Every entry', ''], ['tagged', 'Only entries tagged', '']] as const).map(([v, l, sub]) => (
          <div key={v} className="row gap-12" style={{ minHeight: v === 'tagged' ? 32 : undefined }}>
            <button className="row gap-12" onClick={() => up({ askOn: v })} role="radio" aria-checked={t.askOn === v} style={{ textAlign: 'left' }}>
              <Icon name={t.askOn === v ? 'radioOn' : 'circle'} size={20} style={{ color: t.askOn === v ? 'var(--primary)' : 'var(--on-surface-variant)' }} />
              <span className="col"><span className={cx('t-bm', t.askOn === v && 't-ts')}>{l}</span>{sub && <span className="t-bs c-muted">{sub}</span>}</span>
            </button>
            {v === 'tagged' && t.askOn === 'tagged' && (
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                {t.tags.map(x => <Chip key={x} icon="tag" tone={tagChipTone(x)} onRemove={() => up({ tags: t.tags.filter(y => y !== x) })}>{x}</Chip>)}
                <Chip icon="add" onClick={e => ta.open(e)}>add</Chip>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="col" style={{ gap: 10, background: 'var(--surface-lowest)', border: '1px solid var(--outline-variant)', borderRadius: 12, padding: 16 }}>
        <span className="t-lm c-faint">Preview in {t.askOn === 'checkin' ? 'the check-in' : 'an entry'}</span>
        <span className="t-ts">{t.question || t.name || 'Your question'}</span>
        <TrackerInput t={t} value={preview} onChange={setPreview} size="lg" />
      </div>
      <div className="dialog-actions">
        {onArchive && !isNew && <Btn kind="text" icon="folder" onClick={onArchive}>Archive</Btn>}
        <span className="spacer" />
        <Btn kind="text" onClick={onClose}>Cancel</Btn>
        <Btn disabled={!valid} onClick={() => onSave({ ...t, id: t.id || trackerId(t.name), name: t.name.trim(), question: t.question.trim() || t.name.trim(), levels: t.levels?.map(l => l.trim()).filter(Boolean) })}>{isNew ? 'Add tracker' : 'Save'}</Btn>
      </div>
      {ia.isOpen && <Popover anchor={ia.el} onClose={ia.close}><div className="menu" style={{ padding: 12, minWidth: 0 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 40px)', gap: 4 }}>
        {ICON_CHOICES.map(n => <IBtn key={n} icon={n} label={n} kind={t.icon === n ? 'selected' : 'standard'} tip={false} onClick={() => { up({ icon: n }); ia.close(); }} />)}
      </div></div></Popover>}
      {ta.isOpen && <Popover anchor={ta.el} onClose={ta.close}><MenuList width={220} onClose={ta.close} items={st.settings.journalTags.filter(x => !t.tags.includes(x)).map(x => ({ t: x, ic: 'tag' as const, onClick: () => up({ tags: [...t.tags, x] }) }))} /></Popover>}
    </Dialog>
  );
}

export function useTrackerLookup() {
  const st = useStore();
  return useMemo(() => new Map(st.settings.trackers.map(t => [t.id, t])), [st.settings.trackers]);
}
export { Tag };
