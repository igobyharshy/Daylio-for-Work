import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Btn, Chip, Dialog, IBtn, Popover, Switch, cx, useAnchor } from './kit';
import { MONTHS, addDays, atTime, fmtClock, fmtDayShort, fmtHHMM, fmtMin, hhmm, isoDate, parseDate, todayISO } from '../lib/time';

// ---------- Calendar ----------
export function Calendar({ value, onPick, range, maxDate, minDate, month: initMonth }: {
  value?: string | null; onPick: (iso: string) => void; range?: [string | null, string | null]; maxDate?: string; minDate?: string; month?: string;
}) {
  const start = initMonth || value || range?.[0] || range?.[1] || todayISO();
  const [cursor, setCursor] = useState(() => { const d = parseDate(start); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = todayISO();
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7; // Monday-first, same as the Journal calendar
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(offset).fill(null);
    for (let i = 1; i <= days; i++) out.push(isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), i)));
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);
  const [r0, r1] = range ?? [null, null];
  return (
    <div className="cal">
      <div className="cal-head">
        <span className="t-ll c-muted" style={{ padding: '0 8px' }}>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
        <div className="row">
          <IBtn icon="chevLeft" label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
          <IBtn icon="chevRight" label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
        </div>
      </div>
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} className="cal-cell" />;
          const sel = iso === value || iso === r0 || iso === r1;
          const inRange = r0 && r1 && iso > r0 && iso < r1;
          const isStart = r0 && r1 && r0 !== r1 && iso === r0;
          const isEnd = r0 && r1 && r0 !== r1 && iso === r1;
          const disabled = (maxDate && iso > maxDate) || (minDate && iso < minDate);
          return (
            <div key={i} className={cx('cal-cell', inRange && 'in-range', isStart && 'range-start', isEnd && 'range-end')}>
              <button type="button" disabled={!!disabled} className={cx('cal-day state', iso === today && 'today', sel && 'sel')} onClick={() => onPick(iso)}>
                {parseDate(iso).getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimeInput({ value, onChange, label = 'Time' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="row gap-8 select-btn outlined" style={{ cursor: 'text', paddingRight: 8 }}>
      <input type="time" aria-label={label} value={value} onChange={e => e.target.value && onChange(e.target.value)} step={300}
        style={{ border: 0, outline: 0, background: 'transparent', font: '400 16px/24px var(--font)', width: 120 }} />
    </label>
  );
}

/** A date button (opens the calendar) + a time field, side by side. Used to edit Started / Finished. */
export function DayTimeInput({ value, onChange, minDate, maxDate, label = 'Time' }: {
  value: Date; onChange: (d: Date) => void; minDate?: string; maxDate?: string; label?: string;
}) {
  const a = useAnchor();
  const day = isoDate(value), tm = hhmm(value);
  return (
    <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
      <button type="button" className="select-btn outlined state day-btn" onClick={e => a.open(e)} aria-label="Pick a day">
        <Icon name="event" size={18} />{day === todayISO() ? 'Today' : day === isoDate(addDays(new Date(), -1)) ? 'Yesterday' : fmtDayShort(day)}
      </button>
      <TimeInput value={tm} onChange={v => onChange(atTime(day, v))} label={label} />
      {a.isOpen && (
        <Popover anchor={a.el} onClose={a.close}>
          <div className="menu picker" style={{ padding: '8px 16px 12px' }}>
            <Calendar value={day} minDate={minDate} maxDate={maxDate} onPick={d => { onChange(atTime(d, tm)); a.close(); }} />
          </div>
        </Popover>
      )}
    </div>
  );
}

// ---------- Due date picker (E06 / E21) ----------
export function DuePicker({ date, time, onDone, onClear, title = 'Due date', requireTime, clearLabel = 'Clear' }: {
  date: string | null; time: string | null; onDone: (date: string, time: string | null) => void; onClear: () => void; title?: string; requireTime?: boolean; clearLabel?: string;
}) {
  const [d, setD] = useState(date ?? todayISO());
  const [withTime, setWithTime] = useState(!!time || !!requireTime);
  const [t, setT] = useState(time ?? '18:00');
  const today = todayISO(), tomorrow = isoDate(addDays(new Date(), 1));
  // past days can't be picked (the current value stays selectable)
  const min = date && date < today ? date : today;
  return (
    <div className="menu picker" style={{ padding: '12px 16px 16px', gap: 8 }}>
      <div className="t-lm c-muted" style={{ padding: '0 8px' }}>{title}</div>
      <Calendar value={d} onPick={setD} minDate={min} />
      <div className="row gap-8"><Chip sel={d === today} onClick={() => setD(today)}>Today</Chip><Chip sel={d === tomorrow} onClick={() => setD(tomorrow)}>Tomorrow</Chip></div>
      {!requireTime && <div className="row" style={{ minHeight: 48, gap: 12 }}>
        <span className="t-bl grow">Include a time</span>
        <Switch on={withTime} onChange={setWithTime} label="Include a time" />
      </div>}
      {withTime && <div className="row" style={{ justifyContent: 'space-between' }}><span className="t-ts c-muted">Time</span><TimeInput value={t} onChange={setT} /></div>}
      <div className="dialog-actions"><Btn kind="text" onClick={onClear}>{clearLabel}</Btn><span className="spacer" /><Btn onClick={() => onDone(d, withTime ? t : null)}>Done</Btn></div>
    </div>
  );
}

// ---------- Journal date & time picker (G09) — future days disabled ----------
export function DateTimePicker({ value, onDone, onClear }: { value: string; onDone: (iso: string) => void; onClear?: () => void }) {
  const v = new Date(value);
  const [d, setD] = useState(isoDate(v));
  const [t, setT] = useState(hhmm(v));
  const today = todayISO(), yesterday = isoDate(addDays(new Date(), -1));
  return (
    <div className="menu picker" style={{ padding: '12px 16px 16px', gap: 8 }}>
      <div className="row gap-8"><Chip sel={d === today} onClick={() => setD(today)}>Today</Chip><Chip sel={d === yesterday} onClick={() => setD(yesterday)}>Yesterday</Chip></div>
      <Calendar value={d} onPick={setD} maxDate={today} />
      <div className="row" style={{ justifyContent: 'space-between', minHeight: 48 }}><span className="t-ts c-muted">Time</span><TimeInput value={t} onChange={setT} /></div>
      <div className="dialog-actions">
        {onClear && <Btn kind="text" onClick={onClear}>Clear</Btn>}<span className="spacer" />
        <Btn onClick={() => { let x = atTime(d, t); if (x.getTime() > Date.now()) x = new Date(); onDone(x.toISOString()); }}>Done</Btn>
      </div>
    </div>
  );
}

// ---------- Estimate dialog (G08 / G07) ----------
/** mode "start": asked when ▶ is pressed on a task without an estimate */
export function EstimateDialog({ initial, onSet, onClose, dueAt, avgOverrunMin, title, editing, mode = 'set', onStartAnyway }: {
  initial: number | null; onSet: (min: number | null) => void; onClose: () => void; dueAt?: Date | null; avgOverrunMin?: number | null; title?: string;
  /** the task has started and already had an estimate: changes are logged as a re-estimate */
  editing?: boolean; mode?: 'set' | 'start'; onStartAnyway?: () => void;
}) {
  const [min, setMin] = useState(initial ?? 30);
  const h = Math.floor(min / 60), m = min % 60;
  const set = (x: number) => setMin(Math.max(5, Math.min(24 * 60, x)));
  // +/- snap to multiples of 5
  const step = (dir: 1 | -1) => set(dir > 0 ? Math.floor(min / 5) * 5 + 5 : Math.ceil(min / 5) * 5 - 5);
  const presets = [15, 30, 45, 60, 90, 120, 180];
  const sb = dueAt ? new Date(dueAt.getTime() - min * 60000) : null;
  const suggestion = avgOverrunMin != null && avgOverrunMin > 0 ? Math.max(5, Math.round((min + avgOverrunMin) / 5) * 5) : null;
  const numStyle: React.CSSProperties = { width: 96, height: 72, borderRadius: 12, border: '1px solid var(--outline)', background: 'var(--surface-lowest)', font: '400 45px/52px var(--font)', textAlign: 'center', outline: 0 };
  const start = mode === 'start';
  const heading = title ?? (start ? 'Add an estimate first' : 'Estimate');
  return (
    <Dialog onClose={onClose} width={480} label={heading}>
      <div className="row gap-12"><Icon name="hourglass" style={{ color: 'var(--primary)' }} /><span className="t-hs grow">{heading}</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <div className="t-bm c-muted">{start ? 'How long will this take? The timer counts this down, and Insights compare it with the time you actually take.' : 'How long will this take? The timer counts this down.'}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 16, padding: '8px 0' }}>
        <IBtn icon="remove" label="Less 5 minutes" kind="outlined" onClick={() => step(-1)} />
        <div className="row gap-8" style={{ alignItems: 'flex-end' }}>
          <div className="col gap-4" style={{ alignItems: 'center' }}>
            <input aria-label="Hours" style={numStyle} inputMode="numeric" value={h} onFocus={e => e.target.select()} onChange={e => set((parseInt(e.target.value) || 0) * 60 + m)} />
            <span className="t-bs c-muted">hours</span>
          </div>
          <span className="t-dm" style={{ paddingBottom: 30 }}>:</span>
          <div className="col gap-4" style={{ alignItems: 'center' }}>
            {/* minutes roll over: typing 90 gives 1h 30m */}
            <MinutesInput style={numStyle} value={m} onCommit={v => set(h * 60 + v)} />
            <span className="t-bs c-muted">minutes</span>
          </div>
        </div>
        <IBtn icon="add" label="More 5 minutes" kind="outlined" onClick={() => step(1)} />
      </div>
      <div className="row gap-8" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        {presets.map(p => <Chip key={p} sel={p === min} onClick={() => setMin(p)}>{fmtMin(p)}</Chip>)}
      </div>
      {dueAt && (
        <div className="row gap-16" style={{ background: 'var(--surface-low)', borderRadius: 16, padding: 16 }}>
          <div className="col grow"><span className="t-bs c-muted">Due</span><span className="t-tm">{fmtClock(dueAt)}{isoDate(dueAt) !== todayISO() ? ' · ' + dueAt.getDate() + ' ' + MONTHS[dueAt.getMonth()].slice(0, 3) : ''}</span></div>
          <Icon name="forward" style={{ color: 'var(--outline)' }} />
          <div className="col grow"><span className="t-bs c-muted">Start by</span><span className="t-tm c-primary">{sb ? fmtClock(sb) : '—'}</span></div>
        </div>
      )}
      {suggestion != null && suggestion !== min && (
        <div className="row gap-12" style={{ background: 'var(--surface-container)', borderRadius: 12, padding: '8px 8px 8px 16px' }}>
          <Icon name="lightbulb" style={{ color: 'var(--primary)' }} />
          <span className="t-bm grow">You usually run about {fmtMin(avgOverrunMin!)} over.</span>
          <Chip icon="add" onClick={() => setMin(suggestion)}>Use {fmtMin(suggestion)}</Chip>
        </div>
      )}
      {editing && <div className="t-bs c-muted">You’ve already started, so this is logged as a re-estimate. Insights always score against the original.</div>}
      <div className="dialog-actions">
        {start
          ? <Btn kind="text" onClick={() => { onStartAnyway?.(); onClose(); }}>Start without estimate</Btn>
          : initial != null && <Btn kind="text" onClick={() => { onSet(null); onClose(); }}>Remove</Btn>}
        <span className="spacer" />
        {!start && <Btn kind="text" onClick={onClose}>Cancel</Btn>}
        <Btn icon={start ? 'play' : undefined} onClick={() => { onSet(min); onClose(); }}>{start ? 'Start timer' : 'Set estimate'}</Btn>
      </div>
    </Dialog>
  );
}

function MinutesInput({ value, onCommit, style }: { value: number; onCommit: (v: number) => void; style: React.CSSProperties }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => { if (draft != null) { onCommit(Math.max(0, parseInt(draft) || 0)); setDraft(null); } };
  return <input aria-label="Minutes" style={style} inputMode="numeric" value={draft ?? String(value).padStart(2, '0')} onFocus={e => e.target.select()}
    onChange={e => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />;
}

// ---------- Remind me (G13) ----------
export function remindOptions(dueAtDate: Date | null, workStart: string, workEnd: string) {
  const now = new Date();
  const later = new Date(now.getTime() + 3 * 3600000); later.setMinutes(later.getMinutes() < 30 ? 0 : 30, 0, 0);
  const eod = atTime(todayISO(), workEnd);
  const morning = atTime(isoDate(addDays(now, 1)), workStart);
  const before = dueAtDate ? new Date(dueAtDate.getTime() - 30 * 60000) : null;
  const opts: { t: string; sup: string; at: Date; ic: 'clock' | 'schedule' | 'sun' | 'flag' }[] = [];
  if (later.getDate() === now.getDate()) opts.push({ t: 'Later today', sup: fmtClock(later), at: later, ic: 'clock' });
  if (eod > now) opts.push({ t: 'End of work day', sup: fmtHHMM(workEnd), at: eod, ic: 'schedule' });
  opts.push({ t: 'Tomorrow morning', sup: fmtHHMM(workStart), at: morning, ic: 'sun' });
  if (before && before > now) opts.push({ t: '30 min before it’s due', sup: fmtClock(before), at: before, ic: 'flag' });
  return opts;
}
