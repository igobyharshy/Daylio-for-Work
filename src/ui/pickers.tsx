import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Btn, Chip, Dialog, IBtn, Switch, cx } from './kit';
import { MONTHS, addDays, atTime, fmtClock, fmtHHMM, fmtMin, hhmm, isoDate, parseDate, todayISO } from '../lib/time';

// ---------- Calendar ----------
export function Calendar({ value, onPick, range, maxDate, minDate, month: initMonth }: {
  value?: string | null; onPick: (iso: string) => void; range?: [string | null, string | null]; maxDate?: string; minDate?: string; month?: string;
}) {
  const start = initMonth || value || range?.[0] || range?.[1] || todayISO();
  const [cursor, setCursor] = useState(() => { const d = parseDate(start); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const today = todayISO();
  const cells = useMemo(() => {
    const first = new Date(cursor);
    const offset = first.getDay(); // Sunday-first like the M3 date picker
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
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
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
      <Icon name="clock" />
      <input type="time" aria-label={label} value={value} onChange={e => e.target.value && onChange(e.target.value)} step={300}
        style={{ border: 0, outline: 0, background: 'transparent', font: '400 16px/24px var(--font)', width: 120 }} />
    </label>
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
  return (
    <div className="menu" style={{ width: 340, padding: '12px 16px 16px', gap: 8 }}>
      <div className="t-lm c-muted" style={{ padding: '0 8px' }}>{title}</div>
      <Calendar value={d} onPick={setD} />
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
    <div className="menu" style={{ width: 340, padding: '12px 16px 16px', gap: 8 }}>
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
export function EstimateDialog({ initial, onSet, onClose, dueAt, avgOverrunMin, title = 'Estimate', editing }: {
  initial: number | null; onSet: (min: number | null) => void; onClose: () => void; dueAt?: Date | null; avgOverrunMin?: number | null; title?: string; editing?: boolean;
}) {
  const [min, setMin] = useState(initial ?? 30);
  const h = Math.floor(min / 60), m = min % 60;
  const set = (x: number) => setMin(Math.max(5, Math.min(24 * 60, x)));
  const presets = [15, 30, 45, 60, 90, 120, 180];
  const sb = dueAt ? new Date(dueAt.getTime() - min * 60000) : null;
  const numStyle: React.CSSProperties = { width: 96, height: 72, borderRadius: 12, border: '1px solid var(--outline)', background: 'var(--surface-lowest)', font: '400 45px/52px var(--font)', textAlign: 'center', outline: 0 };
  return (
    <Dialog onClose={onClose} width={480} label={title}>
      <div className="row gap-12"><Icon name="hourglass" style={{ color: 'var(--primary)' }} /><span className="t-hs grow">{title}</span><IBtn icon="close" label="Close" onClick={onClose} /></div>
      <div className="t-bm c-muted">How long will this take? The timer counts this down.</div>
      <div className="row" style={{ justifyContent: 'center', gap: 16, padding: '8px 0' }}>
        <IBtn icon="remove" label="Less 5 minutes" kind="outlined" onClick={() => set(min - 5)} />
        <div className="row gap-8" style={{ alignItems: 'flex-end' }}>
          <div className="col gap-4" style={{ alignItems: 'center' }}>
            <input aria-label="Hours" style={numStyle} inputMode="numeric" value={h} onChange={e => set((parseInt(e.target.value) || 0) * 60 + m)} />
            <span className="t-bs c-muted">hours</span>
          </div>
          <span className="t-dm" style={{ paddingBottom: 30 }}>:</span>
          <div className="col gap-4" style={{ alignItems: 'center' }}>
            <input aria-label="Minutes" style={numStyle} inputMode="numeric" value={String(m).padStart(2, '0')} onChange={e => set(h * 60 + Math.min(59, parseInt(e.target.value) || 0))} />
            <span className="t-bs c-muted">minutes</span>
          </div>
        </div>
        <IBtn icon="add" label="More 5 minutes" kind="outlined" onClick={() => set(min + 5)} />
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
      {avgOverrunMin != null && avgOverrunMin > 0 && (
        <div className="row gap-12" style={{ background: 'var(--tertiary-container)', color: 'var(--on-tertiary-container)', borderRadius: 12, padding: '12px 16px' }}>
          <Icon name="lightbulb" />
          <span className="t-bm">You usually run about {fmtMin(avgOverrunMin)} over. Try {fmtMin(min + Math.round(avgOverrunMin / 5) * 5)}?</span>
        </div>
      )}
      {editing && <div className="t-bs c-muted">Changing the estimate after you start is logged as a re-estimate. Insights always score against the original.</div>}
      <div className="dialog-actions">
        {initial != null && <Btn kind="text" onClick={() => { onSet(null); onClose(); }}>Remove</Btn>}
        <span className="spacer" />
        <Btn kind="text" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { onSet(min); onClose(); }}>Set estimate</Btn>
      </div>
    </Dialog>
  );
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
  if (before && before > now) opts.push({ t: 'Before it’s due', sup: fmtClock(before), at: before, ic: 'flag' });
  return opts;
}
