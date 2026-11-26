import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { JournalDefaults, StatusDef, Tone } from '../lib/types';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, Chip, Confirm, Dialog, Field, IBtn, MenuList, Pill, Popover, Switch, TONES, TONE_LIST, Tag, cx, useAnchor } from '../ui/kit';
import { TimeInput } from '../ui/pickers';
import { useToast } from '../ui/Toast';
import { tagChipTone, tagDot } from '../lib/select';
import { fmtHHMM } from '../lib/time';
import { TrackersSettings } from './trackers';

const TABS = [['work-day', 'Work day'], ['default-tags', 'Default tags'], ['trackers', 'Trackers'], ['statuses', 'Statuses'], ['notifications', 'Notifications'], ['account', 'Account']] as const;
const CORE = ['Not started', 'In progress', 'Done'];

export function SettingsPage() {
  const { tab = 'work-day' } = useParams();
  const nav = useNavigate();
  return (
    <>
      <div className="page-head"><div className="title"><span className="t-hl">Settings</span></div></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={cx('tab state', tab === k && 'on')} onClick={() => nav(`/settings/${k}`)}>{l}</button>)}
      </div>
      {tab === 'work-day' && <WorkDay />}
      {tab === 'default-tags' && <DefaultTags />}
      {tab === 'trackers' && <TrackersSettings />}
      {tab === 'statuses' && <Statuses />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'account' && <Account />}
    </>
  );
}

function Card({ title, sub, children, right, danger }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode; danger?: boolean }) {
  return (
    <section className="set-card" style={danger ? { background: 'var(--surface-lowest)', border: '1px solid color-mix(in srgb, var(--error) 50%, transparent)' } : undefined}>
      <div className="row gap-16" style={{ alignItems: 'flex-start', paddingBottom: 4 }}>
        <div className="col gap-4 grow"><span className={cx('t-tm', danger && 'c-error')}>{title}</span>{sub && <span className="t-bm c-muted">{sub}</span>}</div>{right}
      </div>
      {children}
    </section>
  );
}
function Row({ label, sub, children, c }: { label: string; sub?: string; children?: React.ReactNode; c?: string }) {
  return <div className="set-row"><div className="text"><span className="t-bl" style={{ color: c }}>{label}</span>{sub && <span className="t-bs c-muted">{sub}</span>}</div>{children}</div>;
}
const Saved = () => <div className="row gap-8 t-bm c-muted"><Icon name="checkCircle" size={18} style={{ color: 'var(--success)' }} />Changes save automatically.</div>;

function WorkDay() {
  const st = useStore();
  return (
    <>
      <Card title="Your work day" sub="End of day is when “Remind me later” fires by default. Quiet hours use these times too.">
        <Row label="Start of day"><TimeInput value={st.settings.workStart} onChange={v => st.updateSettings({ workStart: v })} label="Start of day" /></Row>
        <Row label="End of day"><TimeInput value={st.settings.workEnd} onChange={v => st.updateSettings({ workEnd: v })} label="End of day" /></Row>
      </Card>
      <Saved />
    </>
  );
}

function TagSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const st = useStore();
  const a = useAnchor();
  const tone = tagChipTone(value);
  return (
    <>
      <button className="select-btn state" style={{ height: 32, borderRadius: 8, background: tone?.[0], color: tone?.[1] }} onClick={e => a.open(e)}><Icon name="tag" style={{ color: 'inherit' }} />{value}<Icon name="chevDown" style={{ color: 'inherit' }} /></button>
      {a.isOpen && <Popover anchor={a.el} onClose={a.close} placement="below-end"><MenuList width={220} onClose={a.close} items={st.settings.journalTags.map(t => ({ t, dot: tagDot(t), sel: t === value, onClick: () => onChange(t) }))} /></Popover>}
    </>
  );
}

function DefaultTags() {
  const st = useStore();
  const s = st.settings;
  const [newTag, setNewTag] = useState<null | 'project' | 'journal'>(null);
  const [name, setName] = useState('');
  const pa = useAnchor();
  const map: [keyof JournalDefaults, string][] = [['overEstimate', 'Over estimate · “What happened?”'], ['late', 'Late on completion'], ['review', 'Needs reflection review'], ['manual', 'New entry (not linked)'], ['fromTask', 'New entry from a task drawer']];
  const addTag = () => {
    const n = name.trim(); if (!n) return;
    if (newTag === 'project' && !s.projectTags.includes(n)) st.updateSettings({ projectTags: [...s.projectTags, n] });
    if (newTag === 'journal' && !s.journalTags.includes(n)) st.updateSettings({ journalTags: [...s.journalTags, n] });
    setName(''); setNewTag(null);
  };
  return (
    <div className="row gap-24" style={{ alignItems: 'flex-start' }}>
      <div className="col gap-24 grow" style={{ flexBasis: 0 }}>
        <Card title="Projects" sub="New projects start with these tags.">
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            {s.projectDefaultTags.map(t => <Chip key={t} onRemove={() => st.updateSettings({ projectDefaultTags: s.projectDefaultTags.filter(x => x !== t) })}>{t}</Chip>)}
            <Chip icon="add" onClick={e => pa.open(e)}>add</Chip>
          </div>
        </Card>
        <Card title="All tags" right={<Btn kind="tonal" icon="add" onClick={() => setNewTag('journal')}>New tag</Btn>}>
          <span className="t-ts c-muted" style={{ paddingTop: 8 }}>Project tags</span>
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>{s.projectTags.map(t => <Chip key={t} icon="tag" onRemove={() => st.updateSettings({ projectTags: s.projectTags.filter(x => x !== t), projectDefaultTags: s.projectDefaultTags.filter(x => x !== t) })}>{t}</Chip>)}<Chip icon="add" onClick={() => setNewTag('project')}>add</Chip></div>
          <span className="t-ts c-muted" style={{ paddingTop: 8 }}>Journal tags</span>
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>{s.journalTags.map(t => <Chip key={t} icon="tag" tone={tagChipTone(t)} onRemove={Object.values(s.journalDefaults).includes(t) ? undefined : () => st.updateSettings({ journalTags: s.journalTags.filter(x => x !== t) })} title={Object.values(s.journalDefaults).includes(t) ? 'Used as a default — change the default first' : undefined}>{t}</Chip>)}</div>
        </Card>
      </div>
      <div className="col gap-24 grow" style={{ flexBasis: 0 }}>
        <Card title="Journal entries" sub="Which tag a new entry gets, depending on where it comes from.">
          {map.map(([k, l]) => <Row key={k} label={l}><TagSelect value={s.journalDefaults[k]} onChange={v => st.updateSettings({ journalDefaults: { ...s.journalDefaults, [k]: v } })} /></Row>)}
        </Card>
      </div>
      {pa.isOpen && <Popover anchor={pa.el} onClose={pa.close}><MenuList width={220} onClose={pa.close} items={s.projectTags.filter(t => !s.projectDefaultTags.includes(t)).map(t => ({ t, ic: 'tag' as const, onClick: () => st.updateSettings({ projectDefaultTags: [...s.projectDefaultTags, t] }) })).concat(s.projectTags.every(t => s.projectDefaultTags.includes(t)) ? [{ note: 'All project tags are defaults.' } as any] : [])} /></Popover>}
      {newTag && (
        <Dialog onClose={() => setNewTag(null)} width={400} label="New tag">
          <span className="t-hs">New {newTag} tag</span>
          <div className="row gap-8"><Chip sel={newTag === 'journal'} onClick={() => setNewTag('journal')}>Journal</Chip><Chip sel={newTag === 'project'} onClick={() => setNewTag('project')}>Project</Chip></div>
          <Field label="Name" value={name} onChange={setName} autoFocus bg="var(--surface-high)" onKeyDown={e => e.key === 'Enter' && addTag()} />
          <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={() => setNewTag(null)}>Cancel</Btn><Btn disabled={!name.trim()} onClick={addTag}>Add tag</Btn></div>
        </Dialog>
      )}
    </div>
  );
}

function StatusList({ list, onChange, kind }: { list: StatusDef[]; onChange: (l: StatusDef[]) => void; kind: 'task' | 'project' }) {
  const st = useStore();
  const [drag, setDrag] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [val, setVal] = useState('');
  const [menu, setMenu] = useState<{ i: number; el: HTMLElement } | null>(null);
  const [toneMenu, setToneMenu] = useState<{ i: number; el: HTMLElement } | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const locked = (n: string) => kind === 'task' && CORE.includes(n);
  const usedCount = (n: string) => kind === 'task' ? st.tasks.filter(t => t.status === n).length : st.projects.filter(p => p.status === n).length;
  const used = (n: string) => kind === 'task' ? st.tasks.some(t => t.status === n) : st.projects.some(p => p.status === n);
  const rename = (i: number) => {
    const n = val.trim(); setEditing(null);
    if (!n || list.some((s, j) => j !== i && s.name === n)) return;
    const old = list[i].name;
    onChange(list.map((s, j) => (j === i ? { ...s, name: n } : s)));
    if (kind === 'task') st.tasks.filter(t => t.status === old).forEach(t => st.updateTask(t.id, { status: n }));
    else st.projects.filter(p => p.status === old).forEach(p => st.updateProject(p.id, { status: n }));
  };
  return (
    <>
      {list.map((s, i) => (
        <div key={s.name} className="set-row" draggable onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()}
          onDrop={() => { if (drag == null || drag === i) return; const l = list.slice(); const [x] = l.splice(drag, 1); l.splice(i, 0, x); onChange(l); setDrag(null); }}
          style={{ opacity: drag === i ? 0.4 : 1, minHeight: s.note ? 64 : 52 }}>
          <Icon name="drag" style={{ color: 'var(--outline)', cursor: 'grab' }} />
          <div className="text" style={{ alignItems: 'flex-start' }}>
            {editing === i
              ? <Field sm value={val} onChange={setVal} autoFocus bg="var(--surface-low)" onBlur={() => rename(i)} onKeyDown={e => { if (e.key === 'Enter') rename(i); if (e.key === 'Escape') setEditing(null); }} style={{ width: 220 }} />
              : <Pill name={s.name} tone={s.tone} onClick={e => setToneMenu({ i, el: e.currentTarget as HTMLElement })} />}
            {s.note && <span className="t-bs c-muted">{s.note}</span>}
          </div>
          {kind === 'task' && s.name !== 'Archived' && s.myDay && <Tag icon={s.myDay === 'hide' ? 'eyeOff' : 'sun'}>{s.myDay === 'hide' ? 'Hidden in My Day' : 'Always in My Day'}</Tag>}
          <IBtn sm icon="more" label="Status options" onClick={e => setMenu({ i, el: e.currentTarget as HTMLElement })} />
        </div>
      ))}
      <div style={{ paddingTop: 8 }}>
        {adding ? <Field sm value={val} onChange={setVal} placeholder="Status name" autoFocus bg="var(--surface-low)" style={{ width: 260 }}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim() && !list.some(s => s.name === val.trim())) { onChange([...list, { name: val.trim(), tone: 'neutral' }]); setVal(''); setAdding(false); } if (e.key === 'Escape') setAdding(false); }} onBlur={() => setAdding(false)} />
          : <Btn kind="text" icon="add" onClick={() => { setVal(''); setAdding(true); }}>Add status</Btn>}
      </div>
      {menu && <Popover anchor={menu.el} onClose={() => setMenu(null)} placement="below-end"><MenuList width={220} onClose={() => setMenu(null)} items={[
        { t: 'Rename', ic: 'edit', disabled: locked(list[menu.i].name), onClick: () => { setVal(list[menu.i].name); setEditing(menu.i); } },
        { t: 'Colour', ic: 'palette', keepOpen: true, onClick: () => { setToneMenu(menu); setMenu(null); } },
        ...(kind === 'task' && list[menu.i].name !== 'Archived' ? (() => {
          const s = list[menu.i];
          const shown = s.myDay === 'show' || (s.myDay !== 'hide' && CORE.includes(s.name));
          return [{ t: shown ? 'Hide from My Day' : 'Always show in My Day', ic: (shown ? 'eyeOff' : 'sun') as IconName, onClick: () => onChange(list.map((x, j) => (j === menu.i ? { ...x, myDay: shown ? 'hide' as const : 'show' as const } : x))) }];
        })() : []),
        { divider: true },
        { t: used(list[menu.i].name) ? 'Delete and move its tasks…' : 'Delete', ic: 'trash', danger: true, disabled: locked(list[menu.i].name) || list.length <= 1,
          onClick: () => { if (used(list[menu.i].name)) setRemoving(menu.i); else onChange(list.filter((_, j) => j !== menu.i)); } },
        ...(locked(list[menu.i].name) ? [{ note: 'Ontrack sets this status automatically, so it can’t be renamed or deleted.' }] : []),
      ]} /></Popover>}
      {removing != null && list[removing] && (
        <MoveAndDelete name={list[removing].name} count={usedCount(list[removing].name)} kind={kind}
          options={list.filter((_, j) => j !== removing).map(s => s.name).filter(n => n !== 'Archived' || kind === 'project')}
          onClose={() => setRemoving(null)}
          onConfirm={to => {
            const old = list[removing].name;
            if (kind === 'task') st.tasks.filter(t => t.status === old).forEach(t => st.updateTask(t.id, { status: to })); // label only: finished tasks stay finished
            else st.projects.filter(p => p.status === old).forEach(p => st.updateProject(p.id, { status: to }));
            onChange(list.filter((_, j) => j !== removing));
            setRemoving(null);
          }} />
      )}
      {toneMenu && <Popover anchor={toneMenu.el} onClose={() => setToneMenu(null)}>
        <div className="menu" style={{ padding: 12, minWidth: 0 }}><div className="row gap-8">{TONE_LIST.map((t: Tone) => (
          <button key={t} aria-label={`Colour ${t}`} onClick={() => { onChange(list.map((s, j) => (j === toneMenu.i ? { ...s, tone: t } : s))); setToneMenu(null); }}
            style={{ width: 32, height: 32, borderRadius: 16, background: TONES[t][0], display: 'grid', placeItems: 'center', outline: list[toneMenu.i].tone === t ? '2px solid var(--primary)' : undefined, outlineOffset: 2 }}><span className="dot" style={{ background: TONES[t][2] }} /></button>
        ))}</div></div>
      </Popover>}
    </>
  );
}

/** deleting a status that's in use: pick where its tasks (or projects) go */
function MoveAndDelete({ name, count, kind, options, onClose, onConfirm }: { name: string; count: number; kind: 'task' | 'project'; options: string[]; onClose: () => void; onConfirm: (to: string) => void }) {
  const [to, setTo] = useState(options.includes('Not started') ? 'Not started' : options[0]);
  const what = kind === 'task' ? (count === 1 ? 'task' : 'tasks') : (count === 1 ? 'project' : 'projects');
  return (
    <Dialog onClose={onClose} width={420} label={`Delete ${name}`}>
      <span className="t-hs">Delete “{name}”?</span>
      <span className="t-bm c-muted">{count} {what} {count === 1 ? 'has' : 'have'} this status. Move {count === 1 ? 'it' : 'them'} to:</span>
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>{options.map(o => <Chip key={o} sel={to === o} onClick={() => setTo(o)}>{o}</Chip>)}</div>
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn kind="error" icon="trash" onClick={() => onConfirm(to)}>Move and delete</Btn></div>
    </Dialog>
  );
}

function Statuses() {
  const st = useStore();
  return (
    <div className="row gap-24" style={{ alignItems: 'flex-start' }}>
      <div className="grow" style={{ flexBasis: 0 }}><Card title="Task statuses" sub="Drag to reorder. Click a status to change its colour. Use ⋮ to rename, hide from My Day or delete.">
        <StatusList kind="task" list={st.settings.taskStatuses} onChange={l => st.updateSettings({ taskStatuses: l })} />
      </Card></div>
      <div className="grow" style={{ flexBasis: 0 }}><Card title="Project statuses" sub="For the Projects board.">
        <StatusList kind="project" list={st.settings.projectStatuses} onChange={l => st.updateSettings({ projectStatuses: l })} />
      </Card></div>
    </div>
  );
}

function Notifications() {
  const st = useStore();
  const n = st.settings.notif;
  const set = (k: keyof typeof n) => (v: boolean) => st.updateSettings({ notif: { ...n, [k]: v } });
  const nav = useNavigate();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const ask = async () => { if (typeof Notification === 'undefined') return; setPerm(await Notification.requestPermission()); };
  return (
    <>
      {perm !== 'granted' && (
        <div className="row gap-16" style={{ background: perm === 'denied' ? 'var(--error-container)' : 'var(--primary-container)', color: perm === 'denied' ? 'var(--on-error-container)' : 'var(--on-primary-container)', borderRadius: 16, padding: '12px 12px 12px 20px' }}>
          <Icon name={perm === 'denied' ? 'bellOff' : 'bell'} />
          <span className="t-bm grow">{perm === 'denied' ? 'Windows notifications are blocked for Ontrack. Allow them from the lock icon in the address bar, then reload.' : 'Allow notifications so reminders show up in Windows, even when Ontrack is in the background.'}</span>
          {perm === 'default' && <Btn onClick={ask}>Allow notifications</Btn>}
        </div>
      )}
      <div className="row gap-24" style={{ alignItems: 'flex-start' }}>
        <div className="grow" style={{ flexBasis: 0 }}><Card title="Windows notifications" sub="Shown while Ontrack is open, even minimised.">
          <Row label="Task reminder" sub="When a task’s reminder time arrives"><Switch on={n.taskReminder} onChange={set('taskReminder')} label="Task reminder" /></Row>
          <Row label="Estimate used up" sub="When the timer reaches your estimate"><Switch on={n.estimateUsedUp} onChange={set('estimateUsedUp')} label="Estimate used up" /></Row>
          <Row label="Reflection reminder" sub="At end of day, if tasks need a note"><Switch on={n.reflectionReminder} onChange={set('reflectionReminder')} label="Reflection reminder" /></Row>
          <Row label="Over-estimate nudge" sub="Every 15 min while a task runs over"><Switch on={n.overNudge} onChange={set('overNudge')} label="Over-estimate nudge" /></Row>
        </Card></div>
        <div className="col gap-24 grow" style={{ flexBasis: 0 }}>
          <Card title="In-app">
            <Row label="Toast when you finish" sub="Says if you came in under or over estimate"><Switch on={n.finishToast} onChange={set('finishToast')} label="Toast when you finish" /></Row>
            <Row label="Bell badge" sub="Counts reminders and reviews waiting for you"><Switch on={n.bellBadge} onChange={set('bellBadge')} label="Bell badge" /></Row>
            <Row label="Sound" sub="Play a short chime with notifications"><Switch on={n.sound} onChange={set('sound')} label="Sound" /></Row>
          </Card>
          <Card title="Quiet hours">
            <Row label="Outside your work day" sub={`${fmtHHMM(st.settings.workStart)} – ${fmtHHMM(st.settings.workEnd)} · no Windows notifications`}><Switch on={n.quietOutsideWorkDay} onChange={set('quietOutsideWorkDay')} label="Quiet outside work day" /></Row>
            <div><Btn kind="text" trail="chevRight" onClick={() => nav('/settings/work-day')}>Change work day hours</Btn></div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Account() {
  const st = useStore();
  const toast = useToast();
  const [name, setName] = useState(st.displayName);
  const [pw, setPw] = useState(false);
  const [clear, setClear] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => setName(st.displayName), [st.displayName]);
  const exportAll = () => {
    const data = { exportedAt: new Date().toISOString(), projects: st.projects, tasks: st.tasks, journal: st.entries, settings: st.settings };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `ontrack-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="row gap-24" style={{ alignItems: 'flex-start' }}>
      <div className="grow" style={{ flexBasis: 0 }}>
        <Card title="Profile">
          <div className="row gap-16" style={{ padding: '8px 0 16px' }}>
            <span className="avatar" style={{ width: 64, height: 64, borderRadius: 32, font: '400 28px/36px var(--font)' }}>{(st.displayName || st.email || '?').charAt(0).toUpperCase()}</span>
            <div className="col"><span className="t-tl">{st.displayName || 'Your name'}</span><span className="t-bs c-muted">Signed in with email</span></div>
          </div>
          <div className="col gap-16" style={{ '--label-bg': 'var(--surface-low)' } as React.CSSProperties}>
            <Field label="Name" value={name} onChange={setName} onBlur={() => name.trim() && name !== st.displayName && st.setDisplayName(name.trim())} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            <div className="col"><Field label="Email" value={st.email} onChange={() => {}} trail={<Icon name="lock" />} style={{ opacity: 0.8 }} /><span className="field-help">Email changes are handled by your account admin.</span></div>
          </div>
        </Card>
      </div>
      <div className="col gap-24 grow" style={{ flexBasis: 0 }}>
        <Card title="Your data">
          <Row label="Export everything" sub="Projects, tasks and journal as a JSON file"><Btn kind="tonal" icon="download" onClick={exportAll}>Export</Btn></Row>
          {st.hasSample && <Row label="Clear sample data" sub="Removes the example projects, tasks and journal entries. Your own stay."><Btn kind="outlined" icon="trash" onClick={() => setClear(true)}>Clear</Btn></Row>}
        </Card>
        <Card title="Session">
          <Row label="Password" sub="Change the password you sign in with"><Btn kind="outlined" icon="key" onClick={() => setPw(true)}>Change password</Btn></Row>
          <Row label="Sign out" sub="Your data stays saved"><Btn kind="outlined" icon="logout" onClick={() => supabase.auth.signOut()}>Sign out</Btn></Row>
        </Card>
        <Card title="Danger zone" danger>
          <Row label="Delete account" sub="Deletes all your tasks, projects and journal entries. This can’t be undone."><Btn kind="error" icon="trash" onClick={() => setDel(true)}>Delete account</Btn></Row>
        </Card>
      </div>
      {pw && <PasswordDialog onClose={() => setPw(false)} />}
      {clear && <Confirm title="Clear sample data?" body="The example projects, tasks and journal entries are deleted. Anything you created stays. Tasks you added to a sample project move to Inbox." confirm="Clear sample data" danger onClose={() => setClear(false)} onConfirm={async () => { await st.clearSample(); toast.show('Sample data cleared', { icon: 'checkCircle' }); }} />}
      {del && (
        <Dialog onClose={() => setDel(false)} width={440} label="Delete account">
          <span className="t-hs">Delete your account?</span>
          <span className="t-bm c-muted">Everything in Ontrack is deleted for good: tasks, projects, journal and settings. Type <b>delete</b> to confirm.</span>
          <Field value={confirmText} onChange={setConfirmText} placeholder="delete" bg="var(--surface-high)" autoFocus />
          <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={() => setDel(false)}>Cancel</Btn>
            <Btn kind="error" disabled={confirmText.trim().toLowerCase() !== 'delete'} onClick={async () => { const { error } = await supabase.rpc('delete_my_account'); if (error) toast.show('Couldn’t delete the account. Try again.', { icon: 'warn' }); else await supabase.auth.signOut(); }}>Delete account</Btn></div>
        </Dialog>
      )}
    </div>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    if (a.length < 8) return setErr('Use at least 8 characters.');
    if (a !== b) return setErr('The two passwords don’t match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: a });
    setBusy(false);
    if (error) setErr(error.message); else { toast.show('Password changed', { icon: 'checkCircle' }); onClose(); }
  };
  return (
    <Dialog onClose={onClose} width={440} label="Change password">
      <span className="t-hs">Change password</span>
      <Field label="New password" type={show ? 'text' : 'password'} value={a} onChange={v => { setA(v); setErr(''); }} autoFocus bg="var(--surface-high)" autoComplete="new-password"
        trail={<IBtn sm icon={show ? 'eyeOff' : 'eye'} label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} />} />
      <Field label="Repeat new password" type={show ? 'text' : 'password'} value={b} onChange={v => { setB(v); setErr(''); }} bg="var(--surface-high)" autoComplete="new-password" onKeyDown={e => e.key === 'Enter' && save()} />
      {err && <span className="t-bs c-error">{err}</span>}
      <div className="dialog-actions"><span className="spacer" /><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn disabled={busy || !a || !b} onClick={save}>Change password</Btn></div>
    </Dialog>
  );
}
