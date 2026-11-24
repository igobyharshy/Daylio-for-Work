import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import type { Tone } from '../lib/types';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
export { cx };

// ---------- Buttons ----------
type BtnKind = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'error' | 'error-text' | 'warn' | 'warn-outlined';
export const Btn = forwardRef<HTMLButtonElement, {
  kind?: BtnKind; icon?: IconName; trail?: IconName; children: ReactNode; onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean; className?: string; type?: 'button' | 'submit'; big?: boolean; title?: string;
}>(function Btn({ kind = 'filled', icon, trail, children, className, big, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('btn state', kind, icon && 'has-icon', trail && 'has-trail', big && 'big', className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {trail && <Icon name={trail} />}
    </button>
  );
});

export const IBtn = forwardRef<HTMLButtonElement, {
  icon: IconName; label: string; kind?: 'standard' | 'tonal' | 'filled' | 'pc' | 'outlined' | 'selected'; onClick?: (e: React.MouseEvent) => void;
  badge?: string | number | null; sm?: boolean; className?: string; style?: CSSProperties; disabled?: boolean; tip?: boolean;
}>(function IBtn({ icon, label, kind = 'standard', badge, sm, className, tip = true, ...rest }, ref) {
  return (
    <button ref={ref} type="button" aria-label={label} data-tip={tip ? label : undefined} className={cx('ibtn state', kind !== 'standard' && kind, sm && 'sm', className)} {...rest}>
      <Icon name={icon} />
      {badge != null && badge !== 0 && badge !== '' && <span className="badge">{badge}</span>}
    </button>
  );
});

export function Chip({ children, icon, sel, onClick, onRemove, trail, emoji, tone, className, title }: {
  children: ReactNode; icon?: IconName; sel?: boolean; onClick?: (e: React.MouseEvent) => void; onRemove?: () => void; trail?: IconName;
  emoji?: string; tone?: [string, string]; className?: string; title?: string;
}) {
  const style: CSSProperties | undefined = tone ? { background: tone[0], color: tone[1], borderColor: 'transparent' } : undefined;
  const lead = icon || (sel && !tone) || emoji;
  return (
    <span role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} title={title}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(e as any); } }}
      onClick={onClick} style={{ ...style, cursor: onClick ? 'pointer' : undefined }}
      className={cx('chip', onClick && 'state', sel && 'sel', lead && 'has-lead', (onRemove || trail) && 'has-trail', className)}>
      {icon ? <Icon name={icon} /> : sel && !tone ? <Icon name="check" /> : null}
      {emoji && <span className="emoji" style={{ fontSize: 16 }}>{emoji}</span>}
      {children}
      {trail && <Icon name={trail} />}
      {onRemove && <button type="button" className="x" aria-label="Remove" onClick={e => { e.stopPropagation(); onRemove(); }}><Icon name="close" /></button>}
    </span>
  );
}

export function Tag({ children, icon, kind, className, title, tone }: { children: ReactNode; icon?: IconName; kind?: 'warn' | 'err' | 'ok' | 'pc' | 'ter'; className?: string; title?: string; tone?: [string, string] }) {
  return <span title={title} style={tone ? { background: tone[0], color: tone[1] } : undefined} className={cx('tag', kind, icon && 'has-lead', className)}>{icon && <Icon name={icon} />}{children}</span>;
}

export const TONES: Record<Tone, [string, string, string]> = {
  neutral: ['var(--surface-high)', 'var(--on-surface-variant)', 'var(--outline)'],
  grey: ['var(--surface-highest)', 'var(--on-surface-variant)', 'var(--outline)'],
  secondary: ['var(--secondary-container)', 'var(--on-secondary-container)', 'var(--secondary)'],
  blue: ['var(--primary-container)', 'var(--on-primary-container)', 'var(--primary)'],
  green: ['var(--c-green-bg)', 'var(--c-green-fg)', 'var(--c-green-dot)'],
  purple: ['var(--tertiary-container)', 'var(--on-tertiary-container)', 'var(--tertiary)'],
  amber: ['var(--warning-container)', 'var(--on-warning-container)', 'var(--warning)'],
  red: ['var(--error-container)', 'var(--on-error-container)', 'var(--error)'],
};
export const TONE_LIST: Tone[] = ['neutral', 'grey', 'secondary', 'blue', 'green', 'purple', 'amber', 'red'];

export function Pill({ name, tone, menu, onClick }: { name: string; tone: Tone; menu?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  const [bg, fg, dot] = TONES[tone] ?? TONES.neutral;
  const El: any = onClick ? 'button' : 'span';
  return (
    <El type={onClick ? 'button' : undefined} className={cx('pill', menu && 'pill-menu', onClick && 'state')} style={{ background: bg, color: fg }} onClick={onClick}>
      <span className="dot" style={{ background: dot }} />{name}{menu && <Icon name="chevDown" />}
    </El>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={cx('switch', on && 'on')} onClick={() => onChange(!on)}>
      <span className="thumb">{on && <Icon name="check" />}</span>
    </button>
  );
}

export function Seg<T extends string>({ items, value, onChange }: { items: { value: T; label?: string; icon?: IconName; tip?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {items.map(it => (
        <button key={it.value} type="button" role="radio" aria-checked={value === it.value} aria-label={it.tip || it.label} data-tip={it.tip}
          className={cx('state', value === it.value && 'on')} onClick={() => onChange(it.value)}>
          {it.label && value === it.value && <Icon name="check" />}
          {it.icon && <Icon name={it.icon} />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Lin({ pct, style }: { pct: number; style?: CSSProperties }) {
  const p = Math.max(0, Math.min(100, pct));
  return <div className="lin" style={style}><i style={{ width: `calc(${p}% - 2px)`, display: p ? undefined : 'none' }} /><i /></div>;
}

export function Ring({ pct, size = 56, stroke = 6, color = 'var(--primary)', track = 'var(--secondary-container)', children }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} />}
      </svg>
      {children}
    </div>
  );
}

// ---------- Field ----------
export function Field({ label, value, onChange, placeholder, lead, trail, type = 'text', multi, rows = 4, autoFocus, sm, bg, onKeyDown, onBlur, inputRef, className, error, style, name, autoComplete }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; lead?: IconName; trail?: ReactNode; type?: string;
  multi?: boolean; rows?: number; autoFocus?: boolean; sm?: boolean; bg?: string; onKeyDown?: (e: React.KeyboardEvent) => void; onBlur?: () => void;
  inputRef?: React.Ref<any>; className?: string; error?: boolean; style?: CSSProperties; name?: string; autoComplete?: string;
}) {
  const s = { ...(bg ? ({ '--label-bg': bg, '--field-bg': 'transparent' } as CSSProperties) : {}), ...style };
  return (
    <div className={cx('field', multi && 'multi', sm && 'sm', error && 'err', className)} style={s}>
      {label && <label>{label}</label>}
      {lead && <Icon name={lead} />}
      {multi
        ? <textarea ref={inputRef} value={value} rows={rows} placeholder={placeholder} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} onBlur={onBlur} aria-label={label || placeholder} />
        : <input ref={inputRef} name={name} autoComplete={autoComplete} type={type} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} onBlur={onBlur} aria-label={label || placeholder} />}
      {trail}
    </div>
  );
}

// ---------- overlays ----------
export function useEsc(fn: () => void, active = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); ref.current(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [active]);
}

export type Placement = 'below-start' | 'below-end' | 'above-start' | 'above-end' | 'right' | 'left' | 'below-center';

/** Floating layer anchored to an element; flips and clamps to the viewport. */
export function Popover({ anchor, onClose, placement = 'below-start', gap = 4, children, className, style, closeOnOutside = true }: {
  anchor: HTMLElement | null | { x: number; y: number; w?: number; h?: number }; onClose: () => void; placement?: Placement; gap?: number;
  children: ReactNode; className?: string; style?: CSSProperties; closeOnOutside?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEsc(onClose);
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current; if (!el || !anchor) return;
      const a = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, top: anchor.y, width: anchor.w ?? 0, height: anchor.h ?? 0, right: anchor.x + (anchor.w ?? 0), bottom: anchor.y + (anchor.h ?? 0) };
      const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, m = 8;
      let left = a.left, top = a.bottom + gap;
      if (placement === 'below-end' || placement === 'above-end') left = a.right - w;
      if (placement === 'below-center') left = a.left + a.width / 2 - w / 2;
      if (placement.startsWith('above')) top = a.top - h - gap;
      if (placement === 'right') { left = a.right + gap; top = a.top; }
      if (placement === 'left') { left = a.left - w - gap; top = a.top; }
      if (placement.startsWith('below') && top + h > vh - m && a.top - h - gap > m) top = a.top - h - gap;
      if (placement.startsWith('above') && top < m) top = a.bottom + gap;
      if (placement === 'right' && left + w > vw - m) left = a.left - w - gap;
      if (placement === 'left' && left < m) left = a.right + gap;
      left = Math.max(m, Math.min(left, vw - w - m));
      top = Math.max(m, Math.min(top, vh - h - m));
      setPos({ left, top });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [anchor, placement, gap]);
  useEffect(() => {
    if (!closeOnOutside) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      // clicks inside a nested popover (portaled) should not close the parent
      if ((t as HTMLElement).closest?.('.popover, .scrim-layer-above')) {
        const pops = Array.from(document.querySelectorAll('.popover'));
        const mine = pops.indexOf(ref.current!);
        const theirs = pops.findIndex(p => p.contains(t));
        if (theirs > mine) return;
      }
      onClose();
    };
    const id = setTimeout(() => document.addEventListener('pointerdown', h), 0);
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', h); };
  }, [anchor, onClose, closeOnOutside]);
  return createPortal(
    <div ref={ref} className={cx('popover', className)} style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ...style }}>{children}</div>,
    document.body,
  );
}

export interface MenuItemDef {
  t?: string; ic?: IconName; emoji?: string; dot?: string; sub?: string; sup?: string; sel?: boolean; danger?: boolean; disabled?: boolean;
  divider?: boolean; label?: string; note?: string; onClick?: () => void; keepOpen?: boolean;
}
export function MenuList({ items, onClose, width, header }: { items: MenuItemDef[]; onClose?: () => void; width?: number; header?: ReactNode }) {
  return (
    <div className="menu" role="menu" style={{ width }}>
      {header}
      {items.map((it, i) => {
        if (it.divider) return <div key={i} className="divider" />;
        if (it.label) return <div key={i} className="menu-label">{it.label}</div>;
        if (it.note) return <div key={i} className="menu-note">{it.note}</div>;
        return (
          <button key={i} role="menuitem" type="button" disabled={it.disabled}
            className={cx('menu-item state', it.sub && 'two', it.sel && 'sel', it.danger && 'danger')}
            onClick={() => { it.onClick?.(); if (!it.keepOpen) onClose?.(); }}>
            {it.ic && <Icon name={it.ic} />}
            {it.emoji && <span className="emoji" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{it.emoji}</span>}
            {it.dot && <span style={{ width: 24, display: 'grid', placeItems: 'center' }}><span className="dot" style={{ background: it.dot, width: 10, height: 10, borderRadius: 5 }} /></span>}
            <span className="col grow" style={{ minWidth: 0 }}>
              <span className="ellipsis">{it.t}</span>
              {it.sub && <span className="sub ellipsis">{it.sub}</span>}
            </span>
            {it.sup && <span className="sup">{it.sup}</span>}
            {it.sel && <Icon name="check" />}
          </button>
        );
      })}
    </div>
  );
}

export function Menu({ anchor, onClose, items, width = 280, placement = 'below-start', header }: {
  anchor: HTMLElement | null; onClose: () => void; items: MenuItemDef[]; width?: number; placement?: Placement; header?: ReactNode;
}) {
  return <Popover anchor={anchor} onClose={onClose} placement={placement}><MenuList items={items} onClose={onClose} width={width} header={header} /></Popover>;
}

/** Simple anchored-menu state helper */
export function useAnchor<T extends HTMLElement = HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  return { el, open: (e: React.MouseEvent | HTMLElement) => setEl(('currentTarget' in e ? e.currentTarget : e) as T), close: () => setEl(null), isOpen: !!el, toggle: (e: React.MouseEvent) => setEl(el ? null : (e.currentTarget as T)) };
}

export function Dialog({ onClose, children, width = 560, className, top, label }: { onClose: () => void; children: ReactNode; width?: number; className?: string; top?: boolean; label?: string }) {
  useEsc(onClose);
  return createPortal(
    <div className={cx('scrim', top && 'top')} onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx('dialog', className)} role="dialog" aria-modal aria-label={label} style={{ width }}>{children}</div>
    </div>,
    document.body,
  );
}

export function Confirm({ title, body, confirm, danger, onConfirm, onClose }: { title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog onClose={onClose} width={400} label={title}>
      <div className="t-hs">{title}</div>
      <div className="t-bm c-muted">{body}</div>
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn kind={danger ? 'error' : 'filled'} onClick={() => { onConfirm(); onClose(); }}>{confirm}</Btn></div>
    </Dialog>
  );
}

/** Global tooltip: any element with data-tip gets an M3 plain tooltip on hover. */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let t: number | undefined;
    const over = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
      window.clearTimeout(t);
      if (!el) { setTip(null); return; }
      t = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({ text: el.dataset.tip!, x: r.left + r.width / 2, y: r.bottom + 6 });
      }, 450);
    };
    const out = () => { window.clearTimeout(t); setTip(null); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', out);
    window.addEventListener('scroll', out, true);
    return () => { document.removeEventListener('pointerover', over); document.removeEventListener('pointerdown', out); window.removeEventListener('scroll', out, true); };
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const w = ref.current.offsetWidth;
    setLeft(Math.max(8, Math.min(tip.x - w / 2, window.innerWidth - w - 8)));
  }, [tip]);
  if (!tip) return null;
  return createPortal(<div ref={ref} className="tooltip" style={{ left, top: Math.min(tip.y, window.innerHeight - 32) }}>{tip.text}</div>, document.body);
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div className="t-tm" style={{ color: 'var(--on-surface)' }}>{title}</div>
      {body && <div className="t-bm" style={{ maxWidth: 420 }}>{body}</div>}
      {action}
    </div>
  );
}
