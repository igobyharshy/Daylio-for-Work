import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useUI } from './ui';
import { Icon } from '../ui/Icon';
import { Btn, Chip, IBtn, Popover, Tag, cx, useAnchor, type Placement } from '../ui/kit';
import { myDayTasks, needsReflection, tagChipTone } from '../lib/select';
import { TimerChip } from '../features/common';
import { fmtClock, fmtDayShort, isDone, relDay, isoDate, cap } from '../lib/time';

/** Apply the colour theme to <html data-theme>; 'system' follows the device. Mirrors to localStorage so the next load paints right away. */
export function useApplyTheme(theme: 'light' | 'dark' | 'system' = 'light') {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const eff = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = eff;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', eff === 'dark' ? '#141218' : '#fffbfe');
      try { localStorage.setItem('ontrack-theme', theme); } catch { /* private mode */ }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
export const effectiveTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

/** Left sidebar (replaces the old top bar): brand + bell + theme, search, pages, timer, profile. */
export function Sidebar() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const loc = useLocation();
  const ba = useAnchor(), pa = useAnchor();
  const unread = st.notifs.filter(n => !n.readAt).length;
  const theme = st.settings.theme ?? 'light';
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.setSearchOpen(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ui]);
  const [, force] = useState(0);
  const isDark = theme === 'dark' || (theme === 'system' && effectiveTheme() === 'dark');
  const toggleTheme = () => { st.updateSettings({ theme: isDark ? 'light' : 'dark' }); force(x => x + 1); };
  const name = st.displayName || 'You';
  const initial = (st.displayName || st.email || '?').charAt(0).toUpperCase();
  return (
    <aside className="side" aria-label="Sidebar">
      <div className="side-top">
        <button className="side-brand state" onClick={() => nav('/my-day')} aria-label="Ontrack home">
          <span className="brand-logo"><Icon name="timer" /></span><span className="t-ts">Ontrack</span>
        </button>
        <IBtn sm icon="bell" label="Notifications" badge={st.settings.notif.bellBadge && unread ? unread : null} kind={ba.isOpen ? 'selected' : 'standard'} onClick={e => ba.open(e)} />
        <IBtn sm icon={isDark ? 'light' : 'dark'} label={isDark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme} />
      </div>
      <button className="side-search state" onClick={() => ui.setSearchOpen(true)} aria-label="Search (Ctrl K)">
        <Icon name="search" /><span className="grow">Search</span><span className="keycap">Ctrl K</span>
      </button>
      <NavDrawer />
      <div className="side-timer-slot"><TimerChip side /></div>
      <div className="grow" />
      <div className="side-foot">
        <button className={cx('side-profile state', pa.isOpen && 'open')} onClick={e => pa.open(e)} aria-label="Account menu" aria-expanded={pa.isOpen}>
          <span className="avatar sm">{initial}</span>
          <span className="t-ts ellipsis grow">{name}</span>
          <Icon name="unfold" size={18} className="c-muted" />
        </button>
        <IBtn sm icon="settings" label="Settings" kind={loc.pathname.startsWith('/settings') ? 'selected' : 'standard'} onClick={() => nav('/settings/work-day')} />
      </div>
      {ba.isOpen && <NotificationsPanel anchor={ba.el} onClose={ba.close} />}
      {pa.isOpen && <ProfileMenu anchor={pa.el} onClose={pa.close} placement="above-start" />}
    </aside>
  );
}

/** Account menu: settings, account, theme, sign out (sidebar drop-up on desktop, top-bar avatar on phones). */
export function ProfileMenu({ anchor, onClose, placement }: { anchor: HTMLElement | null; onClose: () => void; placement: Placement }) {
  const st = useStore();
  const nav = useNavigate();
  const theme = st.settings.theme ?? 'light';
  const name = st.displayName || 'You';
  const initial = (st.displayName || st.email || '?').charAt(0).toUpperCase();
  return (
    <Popover anchor={anchor} onClose={onClose} placement={placement}>
          <div className="menu profile-menu" role="menu" style={{ width: 272 }}>
            <div className="row gap-12" style={{ padding: '8px 12px 10px' }}>
              <span className="avatar">{initial}</span>
              <span className="col" style={{ minWidth: 0 }}><span className="t-ts ellipsis">{name}</span><span className="t-bs c-muted ellipsis">{st.email}</span></span>
            </div>
            <div className="divider" />
            <button role="menuitem" className="menu-item state" onClick={() => { nav('/settings/work-day'); onClose(); }}><Icon name="settings" />Settings</button>
            <button role="menuitem" className="menu-item state" onClick={() => { nav('/settings/account'); onClose(); }}><Icon name="person" />Account</button>
            <div className="divider" />
            <div className="menu-label">Theme</div>
            <div className="theme-seg" role="radiogroup" aria-label="Theme">
              {([['light', 'light', 'Light'], ['dark', 'dark', 'Dark'], ['system', 'autoTheme', 'System']] as const).map(([v, ic, l]) => (
                <button key={v} role="radio" aria-checked={theme === v} className={cx('state', theme === v && 'on')} onClick={() => st.updateSettings({ theme: v })}><Icon name={ic} />{l}</button>
              ))}
            </div>
            <div className="divider" />
            <button role="menuitem" className="menu-item state" onClick={() => { onClose(); supabase.auth.signOut(); }}><Icon name="logout" />Sign out</button>
          </div>
    </Popover>
  );
}

export function NotificationsPanel({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const list = st.notifs.slice(0, 30);
  const reflect = needsReflection(st.tasks).length;
  const icon = { reminder: 'bellOn', reflection: 'review', over: 'warn', info: 'info' } as const;
  const tone = { reminder: ['var(--primary-container)', 'var(--primary)'], reflection: ['var(--tertiary-container)', 'var(--tertiary)'], over: ['var(--warning-container)', 'var(--warning)'], info: ['var(--surface-high)', 'var(--on-surface-variant)'] } as const;
  return (
    <Popover anchor={anchor} onClose={onClose} placement="below-start">
      <div className="menu" style={{ width: 400, padding: '8px 0' }}>
        <div className="row" style={{ padding: '8px 8px 8px 24px', minHeight: 48 }}>
          <span className="t-tm grow">Notifications</span>
          <Btn kind="text" disabled={!st.notifs.some(n => !n.readAt)} onClick={() => st.markNotifsRead()}>Mark all read</Btn>
        </div>
        {reflect > 0 && (
          <button className="menu-item two state" onClick={() => { nav('/journal/review'); onClose(); }} style={{ padding: '8px 24px', gap: 16 }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'var(--tertiary-container)', color: 'var(--tertiary)' }}><Icon name="review" /></span>
            <span className="col grow"><span className="t-ts">{reflect} {reflect === 1 ? 'task needs' : 'tasks need'} a reflection</span><span className="sub">Write a line while it’s fresh</span></span>
            <Icon name="chevRight" />
          </button>
        )}
        {list.length === 0 && reflect === 0 && <div className="empty" style={{ padding: 32 }}><Icon name="bell" /><span className="t-bm">You’re all caught up.</span></div>}
        {list.map(n => (
          <button key={n.id} className="menu-item two state" style={{ padding: '8px 24px', gap: 16, alignItems: 'center' }}
            onClick={() => { st.markNotifsRead([n.id]); if (n.taskId && st.taskById(n.taskId)) { if (n.kind === 'reflection') nav('/journal/review'); else ui.openTask(n.taskId); } onClose(); }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', background: tone[n.kind][0], color: tone[n.kind][1], flex: 'none' }}><Icon name={icon[n.kind]} /></span>
            <span className="col grow" style={{ minWidth: 0 }}><span className="t-ts ellipsis">{n.title}</span><span className="sub ellipsis">{n.body}</span><span className="sub">{relDay(isoDate(new Date(n.createdAt))) === 'today' ? '' : cap(relDay(isoDate(new Date(n.createdAt)))) + ' · '}{fmtClock(n.createdAt)}</span></span>
            {!n.readAt && <span className="dot" style={{ background: 'var(--primary)' }} />}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function NavDrawer() {
  const st = useStore();
  const loc = useLocation();
  const left = myDayTasks(st.tasks, st.projects).filter(t => !isDone(t)).length;
  const reflect = needsReflection(st.tasks).length;
  const items = [
    { to: '/my-day', label: 'My Day', icon: 'sun', on: 'sunFill', count: left },
    { to: '/projects', label: 'Projects', icon: 'folder', on: 'folderFill' },
    { to: '/journal', label: 'Journal', icon: 'book', on: 'bookFill', warn: reflect },
    { to: '/insights', label: 'Insights', icon: 'insights', on: 'insights' },
  ] as const;
  return (
    <nav className="nav" aria-label="Main">
      {items.map(it => {
        const active = loc.pathname.startsWith(it.to);
        return (
          <NavLink key={it.to} to={it.to} className={cx('nav-item state', active && 'on')}>
            <Icon name={active ? it.on : it.icon} />{it.label}
            {'count' in it && it.count > 0 && <span className="count-r">{it.count}</span>}
            {'warn' in it && it.warn > 0 && <span className="count-r" data-tip={`${it.warn} ${it.warn === 1 ? 'task' : 'tasks'} to reflect on`}>{it.warn}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

// ---------- Search (F06) ----------
type Kind = 'all' | 'tasks' | 'projects' | 'journal';
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const ql = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!ql) return [] as { kind: Kind; id: string; title: string; sub: string; lead: React.ReactNode; go: () => void }[];
    const out: { kind: Kind; id: string; title: string; sub: string; lead: React.ReactNode; go: () => void }[] = [];
    if (kind === 'all' || kind === 'tasks') st.tasks.filter(t => t.title.toLowerCase().includes(ql) || t.note.toLowerCase().includes(ql)).sort((a, b) => Number(!!a.finishedAt) - Number(!!b.finishedAt)).slice(0, kind === 'all' ? 5 : 30).forEach(t => {
      const p = st.projectById(t.projectId);
      out.push({ kind: 'tasks', id: t.id, title: t.title, sub: [p?.name, p?.archived ? 'Archived project' : null, t.runStartedAt ? 'Running' : null, t.finishedAt ? 'Done' : t.dueDate ? 'Due ' + relDay(t.dueDate) : null].filter(Boolean).join(' · '), lead: <Icon name={t.finishedAt ? 'checkCircle' : 'circle'} style={{ color: t.finishedAt ? 'var(--primary)' : 'var(--outline)' }} />, go: () => ui.openTask(t.id) });
    });
    if (kind === 'all' || kind === 'projects') st.projects.filter(p => p.name.toLowerCase().includes(ql) || p.tags.some(t => t.toLowerCase().includes(ql))).slice(0, kind === 'all' ? 3 : 30).forEach(p => {
      const open = st.tasks.filter(t => t.projectId === p.id && !t.finishedAt).length;
      out.push({ kind: 'projects', id: p.id, title: p.name, sub: [p.archived ? 'Archived' : null, `${open} open`, p.tags.join(', ')].filter(Boolean).join(' · '), lead: <span className="emoji" style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{p.emoji}</span>, go: () => nav(`/projects/${p.id}`) });
    });
    if (kind === 'all' || kind === 'journal') st.entries.filter(e => e.body.toLowerCase().includes(ql) || e.tags.some(t => t.toLowerCase().includes(ql))).slice(0, kind === 'all' ? 4 : 30).forEach(e => {
      out.push({ kind: 'journal', id: e.id, title: e.body, sub: [fmtDayShort(e.whenAt), ...e.tags].join(' · '), lead: <Icon name="draw" style={{ color: 'var(--tertiary)' }} />, go: () => { nav('/journal'); ui.openEntry(e.id); } });
    });
    return out;
  }, [ql, kind, st.tasks, st.projects, st.entries, ui, nav]);
  useEffect(() => setI(0), [ql, kind]);
  const kinds: Kind[] = ['all', 'tasks', 'projects', 'journal'];
  const pick = (k: number) => { const r = results[k]; if (r) { r.go(); onClose(); } };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(results.length - 1, x + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
    if (e.key === 'Enter') pick(i);
    if (e.key === 'Tab') { e.preventDefault(); setKind(kinds[(kinds.indexOf(kind) + (e.shiftKey ? 3 : 1)) % 4]); }
    if (e.key === 'Escape') onClose();
  };
  const groups: [Kind, string][] = [['tasks', 'TASKS'], ['projects', 'PROJECTS'], ['journal', 'JOURNAL']];
  let idx = -1;
  return (
    <div className="scrim top" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Search" style={{ width: 720, background: 'var(--surface-high)', borderRadius: 28, boxShadow: 'var(--elev-3)', overflow: 'hidden', animation: 'pop 160ms var(--ease-emph)' }}>
        <div className="row gap-16" style={{ height: 56, padding: '0 8px 0 16px' }}>
          <Icon name="search" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search tasks, projects, journal" aria-label="Search" className="inline-input t-bl" />
          <IBtn icon="close" label="Close search" onClick={onClose} />
        </div>
        <div className="row gap-8" style={{ padding: '0 16px 8px' }}>{kinds.map(k => <Chip key={k} sel={kind === k} onClick={() => setKind(k)}>{k[0].toUpperCase() + k.slice(1)}</Chip>)}</div>
        <div className="divider" />
        <div style={{ maxHeight: 'min(560px, calc(100vh - 220px))', overflow: 'auto', padding: '4px 0' }}>
          {!ql && <div className="t-bm c-muted" style={{ padding: '20px 24px' }}>Type to search. Results update as you type.</div>}
          {ql && !results.length && <div className="t-bm c-muted" style={{ padding: '20px 24px' }}>Nothing matches “{q}”.</div>}
          {groups.map(([k, label]) => {
            const rs = results.filter(r => r.kind === k);
            if (!rs.length) return null;
            return (
              <div key={k}>
                <div className="t-lm" style={{ padding: '12px 16px 4px', color: 'var(--primary)' }}>{label}</div>
                {rs.map(r => { idx++; const my = idx; return (
                  <button key={r.id} className={cx('menu-item two state', my === i && 'active-key')} style={{ padding: '0 16px', gap: 16 }} onMouseEnter={() => setI(my)} onClick={() => pick(my)}>
                    {r.lead}
                    <span className="col grow" style={{ minWidth: 0 }}><span className="ellipsis t-bl">{r.title}</span><span className="sub ellipsis">{r.sub}</span></span>
                    {k === 'journal' && st.entries.find(e => e.id === r.id)?.tags.slice(0, 1).map(t => <Tag key={t} tone={tagChipTone(t)}>{t}</Tag>)}
                    {my === i && <span className="t-ll c-muted kb-hint">↵</span>}
                  </button>
                ); })}
              </div>
            );
          })}
        </div>
        <div className="divider" />
        <div className="row gap-12" style={{ height: 48, padding: '0 16px' }}><span className="t-bs c-muted grow">↑↓ move · ↵ open · Tab switches All / Tasks / Projects / Journal</span><span className="keycap">Esc</span></div>
      </div>
    </div>
  );
}
