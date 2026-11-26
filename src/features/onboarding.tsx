// First-run journey for new people (sign-up → welcome → set-up → first task → first timer),
// a "Getting started" checklist on My Day, and one-time coach marks on each page.
// Returning users (anyone who already has their own tasks) never see any of it.
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useUI } from '../app/ui';
import { Icon, type IconName } from '../ui/Icon';
import { Btn, Chip, Field, IBtn, Ring, cx } from '../ui/kit';
import { TimeInput } from '../ui/pickers';
import { AccentPicker } from '../app/shell';
import { fmtMin, fmtHHMM, todayISO } from '../lib/time';
import type { Onboarding } from '../lib/types';
import { useIsMobile } from '../lib/native';

const PAGES = ['myday', 'timer', 'journal', 'insights', 'projects', 'timeline'] as const;

/** where this person is in the journey */
export function useOnboarding() {
  const st = useStore();
  const ob: Onboarding = st.settings.onboarding ?? {};
  const own = useMemo(() => ({
    tasks: st.tasks.filter(t => !t.isSample),
    entries: st.entries.filter(e => !e.isSample),
  }), [st.tasks, st.entries]);
  const set = (patch: Partial<Onboarding>) => st.updateSettings({ onboarding: { ...(st.settings.onboarding ?? {}), ...patch } });
  const steps = [
    { id: 'task', done: own.tasks.some(t => !!t.estimateMin), label: 'Add a task with an estimate', sub: 'Guess how long it will take. That guess is what you’ll get better at.', icon: 'hourglass' as IconName },
    { id: 'timer', done: own.tasks.some(t => !!t.firstStartedAt), label: 'Start the timer', sub: 'Press ▶ on a task. The ring counts down your estimate.', icon: 'play' as IconName },
    { id: 'finish', done: own.tasks.some(t => !!t.finishedAt), label: 'Finish a task', sub: 'Tick it when you’re done. You’ll see if you beat your estimate.', icon: 'checkCircle' as IconName },
    { id: 'journal', done: own.entries.length > 0, label: 'Write a line in the Journal', sub: 'When a task runs over, note what happened. That’s how the patterns show up.', icon: 'book' as IconName },
    { id: 'insights', done: !!ob.seen?.insights, label: 'Look at your Insights', sub: 'How often you finish within your estimate, and where time slips.', icon: 'insights' as IconName },
  ];
  return { ob, set, steps, own, loaded: st.loaded };
}

/** Existing users (real tasks before onboarding existed) are marked done once, silently. */
export function OnboardingGate() {
  const { ob, set, own, loaded } = useOnboarding();
  const fresh = loaded && !ob.done && own.tasks.length === 0 && own.entries.length === 0;
  // once the journey starts it stays open until finished or skipped (adding the first task mustn't close it)
  const [started, setStarted] = useState(false);
  useEffect(() => { if (fresh) setStarted(true); }, [fresh]);
  const needs = (fresh || started) && !ob.done;
  useEffect(() => {
    if (loaded && !ob.done && !fresh && (own.tasks.length > 0 || own.entries.length > 0)) {
      set({ done: true, checklist: 'hidden', seen: Object.fromEntries(PAGES.map(p => [p, true])) });
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (needs) return <Welcome onDone={() => set({ done: true, doneAt: new Date().toISOString() })} />;
  if (ob.replay) return <Welcome tourOnly onDone={() => set({ replay: false })} />;
  return <CoachHost />;
}

// ---------- the welcome journey ----------
type Step = 'intro' | 'you' | 'look' | 'start' | 'task' | 'go';
const ORDER: Step[] = ['intro', 'you', 'look', 'start', 'task', 'go'];
const SUGGEST: [string, number][] = [['Reply to emails', 15], ['Plan this week', 30], ['Write the brief', 45], ['Review designs', 60]];

function Welcome({ onDone, tourOnly }: { onDone: () => void; tourOnly?: boolean }) {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('intro');
  const [slide, setSlide] = useState(0);
  const [name, setName] = useState(st.displayName || '');
  const [hours, setHours] = useState({ start: st.settings.workStart, end: st.settings.workEnd });
  const [title, setTitle] = useState('');
  const [est, setEst] = useState<number | null>(30);
  const [taskId, setTaskId] = useState<string | null>(null);
  const i = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(ORDER.length - 1, i + 1)]);
  const back = () => (step === 'intro' ? setSlide(Math.max(0, slide - 1)) : setStep(ORDER[Math.max(0, i - 1)]));
  const skip = () => { if (!tourOnly) finishSetup(); onDone(); };
  const finishSetup = () => {
    if (name.trim() && name.trim() !== st.displayName) st.setDisplayName(name.trim());
    if (hours.start !== st.settings.workStart || hours.end !== st.settings.workEnd) st.updateSettings({ workStart: hours.start, workEnd: hours.end });
  };
  const addTask = () => {
    const t = st.addTask({ title: title.trim(), estimateMin: est, dueDate: todayISO(), myDayDate: todayISO() });
    setTaskId(t.id); next();
  };
  const startNow = () => {
    finishSetup();
    if (taskId) st.startTask(taskId);
    onDone(); nav('/my-day');
  };

  // Esc skips; the Android back button steps back (and leaves the intro from its first screen)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.popover, .scrim')) skip(); };
    const b = () => { if (step === 'intro' && slide === 0) skip(); else back(); };
    window.addEventListener('keydown', h);
    window.addEventListener('ot-back', b);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('ot-back', b); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const firstName = (name || st.displayName || '').split(' ')[0];
  return createPortal(
    <div className="ob" role="dialog" aria-label="Welcome to Ontrack">
      <div className="ob-top">
        {(step !== 'intro' || slide > 0) ? <IBtn icon="back" label="Back" onClick={back} /> : <span style={{ width: 40 }} />}
        <div className="ob-progress" aria-hidden><i style={{ width: `${tourOnly ? ((slide + 1) / 3) * 100 : ((i + (step === 'intro' ? slide / 3 : 0)) / (ORDER.length - 1)) * 100}%` }} /></div>
        {step !== 'go' ? <Btn kind="text" onClick={skip}>Skip</Btn> : <span style={{ width: 40 }} />}
      </div>

      <div className="ob-body" key={step + slide}>
        {step === 'intro' && <Intro slide={slide} />}

        {step === 'you' && (
          <div className="ob-step">
            <span className="ob-kicker">About you</span>
            <h1>Nice to meet you{firstName ? `, ${firstName}` : ''}.</h1>
            <p>Two quick things so Ontrack fits your day.</p>
            <Field label="Your name" value={name} onChange={setName} placeholder="What should we call you?" autoFocus />
            <div className="col gap-8">
              <span className="t-ts">Your work day</span>
              <div className="row gap-12" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <TimeInput value={hours.start} onChange={v => setHours({ ...hours, start: v })} label="Start of day" />
                <span className="c-muted">to</span>
                <TimeInput value={hours.end} onChange={v => setHours({ ...hours, end: v })} label="End of day" />
              </div>
              <span className="t-bs c-muted">Tasks due “today” are due by {fmtHHMM(hours.end)}. Reminders stay quiet outside these hours.</span>
            </div>
          </div>
        )}

        {step === 'look' && (
          <div className="ob-step">
            <span className="ob-kicker">Make it yours</span>
            <h1>Pick a colour.</h1>
            <p>Change it any time in Settings → Appearance. Every colour has a light and a dark version.</p>
            <div className="theme-seg" role="radiogroup" aria-label="Mode" style={{ margin: 0, maxWidth: 360 }}>
              {([['light', 'light', 'Light'], ['dark', 'dark', 'Dark'], ['system', 'autoTheme', 'Auto']] as const).map(([v, ic, l]) => (
                <button key={v} role="radio" aria-checked={(st.settings.theme ?? 'light') === v} className={cx('state', (st.settings.theme ?? 'light') === v && 'on')} onClick={() => st.updateSettings({ theme: v })}><Icon name={ic} />{l}</button>
              ))}
            </div>
            <AccentPicker big />
          </div>
        )}

        {step === 'start' && (
          <div className="ob-step">
            <span className="ob-kicker">Your space</span>
            <h1>Start fresh, or look around first?</h1>
            <p>Examples show what a few weeks of use looks like. You can clear them later with one tap.</p>
            <div className="ob-choices">
              <button className="ob-choice state" onClick={async () => { if (st.hasSample) await st.clearSample(); next(); }}>
                <Icon name="add" /><span className="t-tm">Start fresh</span><span className="t-bs c-muted">An empty My Day, ready for your first task.</span>
              </button>
              <button className="ob-choice state" onClick={next}>
                <Icon name="folder" /><span className="t-tm">Keep the examples</span><span className="t-bs c-muted">Sample projects, timed tasks and journal entries next to yours.</span>
              </button>
            </div>
          </div>
        )}

        {step === 'task' && (
          <div className="ob-step">
            <span className="ob-kicker">Your first task</span>
            <h1>What will you work on next?</h1>
            <p>Something you’ll do today. Then guess how long it will take: no need to be right, that’s the point.</p>
            <Field label="Task" value={title} onChange={setTitle} placeholder="e.g. Write the project brief" autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && title.trim() && est) addTask(); }} />
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              {!title && SUGGEST.map(([t, m]) => <Chip key={t} icon="add" onClick={() => { setTitle(t); setEst(m); }}>{t}</Chip>)}
            </div>
            <div className="col gap-8">
              <span className="t-ts">How long will it take?</span>
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                {[15, 30, 45, 60, 90, 120].map(m => <Chip key={m} sel={est === m} onClick={() => setEst(m)}>{fmtMin(m)}</Chip>)}
              </div>
            </div>
          </div>
        )}

        {step === 'go' && (
          <div className="ob-step center">
            <span className="ob-kicker">Ready</span>
            <Ring pct={100} size={140} stroke={10}><span className="ob-big tnum">{est ? `${est}:00` : '0:00'}</span></Ring>
            <h1>{title || 'Your task'}</h1>
            <p>Press start and work on it. The ring counts down your {est ? fmtMin(est) : ''} estimate. When it runs out it turns pink. That’s fine: finish, and you’ll see by how much.</p>
          </div>
        )}
      </div>

      <div className="ob-foot">
        {step === 'intro' && <Btn big onClick={() => (slide < 2 ? setSlide(slide + 1) : tourOnly ? onDone() : setStep('you'))}>{slide < 2 ? 'Next' : tourOnly ? 'Done' : 'Set up in a minute'}</Btn>}
        {step === 'you' && <Btn big onClick={next}>Continue</Btn>}
        {step === 'look' && <Btn big onClick={next}>Continue</Btn>}
        {step === 'task' && <Btn big disabled={!title.trim() || !est} onClick={addTask}>Add to My Day</Btn>}
        {step === 'go' && <>
          <Btn big icon="play" onClick={startNow}>Start the timer</Btn>
          <Btn kind="text" onClick={() => { finishSetup(); onDone(); nav('/my-day'); ui.openTask(null); }}>I’ll start it later</Btn>
        </>}
        {step === 'intro' && <div className="ob-dots">{[0, 1, 2].map(d => <i key={d} className={cx(d === slide && 'on')} />)}</div>}
      </div>
    </div>,
    document.body,
  );
}

function Intro({ slide }: { slide: number }) {
  if (slide === 0) return (
    <div className="ob-step center">
      <div className="ob-art">
        <Ring pct={72} size={150} stroke={10}><div className="col" style={{ alignItems: 'center' }}><span className="ob-big tnum">21:30</span><span className="t-bs c-muted">left of 30m</span></div></Ring>
      </div>
      <span className="ob-kicker">Welcome to Ontrack</span>
      <h1>Get better at knowing how long things take.</h1>
      <p>Most of us guess wrong about time. Ontrack helps you guess, check, and get closer every week.</p>
    </div>
  );
  if (slide === 1) return (
    <div className="ob-step center">
      <div className="ob-loop">
        {([['hourglass', 'Guess', 'Give each task an estimate.'], ['timer', 'Time it', 'Press ▶. One countdown: your estimate.'], ['edit', 'Reflect', 'Ran over? Note why in the Journal.']] as const).map(([ic, t, s], k) => (
          <div key={t} className="ob-loop-step"><span className="ob-loop-ic"><Icon name={ic} /></span><span className="t-tm">{k + 1}. {t}</span><span className="t-bs c-muted">{s}</span></div>
        ))}
      </div>
      <span className="ob-kicker">How it works</span>
      <h1>Guess. Time it. Reflect.</h1>
      <p>That’s the whole loop. Plan your day in My Day, run one task at a time, and tick it when it’s done.</p>
    </div>
  );
  return (
    <div className="ob-step center">
      <div className="ob-art ob-bars" aria-hidden>{[40, 72, 55, 90, 64, 80, 96].map((h, k) => <i key={k} style={{ height: `${h}%` }} />)}</div>
      <span className="ob-kicker">What you get</span>
      <h1>Your patterns, in plain numbers.</h1>
      <p>Insights show how often you finish within your estimate, and where time slips: “You usually run 15 minutes over. Try adding 15.”</p>
    </div>
  );
}

// ---------- Getting started checklist (My Day) ----------
export function GettingStarted() {
  const { ob, set, steps } = useOnboarding();
  const nav = useNavigate();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  if (!ob.done || ob.checklist === 'hidden') return null;
  const n = steps.filter(s => s.done).length;
  const allDone = n === steps.length;
  const next = steps.find(s => !s.done);
  const go = (id: string) => {
    if (id === 'task') document.querySelector<HTMLElement>('.add-bar')?.click();
    else if (id === 'timer') { const b = document.querySelector<HTMLElement>('.task-row [aria-label="Start timer"], .task-row .play'); if (b) b.click(); else document.querySelector<HTMLElement>('.add-bar')?.click(); }
    else if (id === 'finish') document.querySelector<HTMLElement>('.run-card, .task-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else if (id === 'journal') { nav('/journal'); setTimeout(() => ui.newEntry({ source: 'manual' }), 150); }
    else if (id === 'insights') nav('/insights');
  };
  return (
    <section className={cx('gs', allDone && 'all')} aria-label="Getting started">
      <button className="gs-head state" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Ring pct={(n / steps.length) * 100} size={36} stroke={4}><span className="t-ll">{n}/{steps.length}</span></Ring>
        <span className="col grow" style={{ alignItems: 'flex-start', minWidth: 0 }}>
          <span className="t-tm">{allDone ? 'You’re all set 🎉' : 'Getting started'}</span>
          <span className="t-bs c-muted ellipsis" style={{ maxWidth: '100%' }}>{allDone ? 'That’s the whole loop. Keep going, and Insights gets sharper every week.' : `Next: ${next?.label}`}</span>
        </span>
        {!open && next && <span className="gs-do" onClick={e => { e.stopPropagation(); go(next.id); }} role="button" tabIndex={0}>{next.id === 'insights' ? 'Open' : next.id === 'finish' ? 'Show me' : 'Do it'}</span>}
        <Icon name={open ? 'chevUp' : 'chevDown'} />
      </button>
      {open && (
        <div className="gs-list">
          {steps.map(s => (
            <div key={s.id} className={cx('gs-item', s.done && 'done')}>
              <span className="gs-ic"><Icon name={s.done ? 'checkCircle' : s.icon} /></span>
              <span className="col grow" style={{ minWidth: 0 }}><span className="t-bl">{s.label}</span>{!s.done && <span className="t-bs c-muted">{s.sub}</span>}</span>
              {!s.done && s.id === next?.id && <Btn kind="tonal" onClick={() => go(s.id)}>{s.id === 'insights' ? 'Open' : s.id === 'finish' ? 'Show me' : 'Do it'}</Btn>}
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'flex-end', padding: '2px 4px 0' }}>
            <Btn kind="text" onClick={() => set({ checklist: 'hidden' })}>{allDone ? 'Close' : 'Hide this'}</Btn>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- coach marks: one short tip per page, the first time you're there ----------
interface Tip { id: typeof PAGES[number]; target: string; title: string; body: string; when: (path: string) => boolean }
const TIPS: Tip[] = [
  { id: 'timer', target: '.run-card', title: 'Your timer', body: 'The ring counts down your estimate. Focus makes the whole screen a quiet timer. Press Done when you finish.', when: p => p.startsWith('/my-day') },
  { id: 'myday', target: '.add-bar', title: 'Plan your day here', body: 'Add what you’ll do today. Type “Write brief 45m” to set the estimate as you type, or “daily” to make it repeat.', when: p => p.startsWith('/my-day') },
  { id: 'journal', target: '.checkin-bar, .page-head .title', title: 'Your journal', body: 'A 10-second check-in each day (sleep, energy), and notes on tasks that ran over. Tap a day to see or add to it.', when: p => p === '/journal' },
  { id: 'insights', target: '.content .card, .page-head .title', title: 'Your patterns', body: 'Scored against your first estimate. The more tasks you time, the sharper this gets.', when: p => p.startsWith('/insights') },
  { id: 'projects', target: '.page-head .title', title: 'Projects', body: 'Group tasks by client or goal. Inbox catches everything else, and tasks still show up in My Day.', when: p => p === '/projects' },
];

function CoachHost() {
  const { ob, set } = useOnboarding();
  const st = useStore();
  const loc = useLocation();
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    setTip(null);
    if (!ob.done || ob.checklist === 'hidden') return;
    const id = window.setTimeout(() => {
      const t = TIPS.find(x => !ob.seen?.[x.id] && x.when(loc.pathname) && document.querySelector(x.target) && !document.querySelector('.popover, .scrim, .sheet, .focus, .ob'));
      setTip(t ?? null);
    }, 900);
    return () => window.clearTimeout(id);
  }, [loc.pathname, ob.done, ob.checklist, ob.seen, st.tasks.some(t => !!t.runStartedAt)]); // eslint-disable-line react-hooks/exhaustive-deps
  // Insights counts as "looked at" once you open it
  useEffect(() => { if (ob.done && loc.pathname.startsWith('/insights') && !ob.seen?.insights) set({ seen: { ...(ob.seen ?? {}), insights: true } }); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tip) return null;
  return <Coach tip={tip} onDone={() => { set({ seen: { ...(ob.seen ?? {}), [tip.id]: true } }); setTip(null); }} />;
}

function Coach({ tip, onDone }: { tip: Tip; onDone: () => void }) {
  const phone = useIsMobile();
  const [r, setR] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(tip.target);
    if (!el) { onDone(); return; }
    el.scrollIntoView({ block: 'nearest' });
    const place = () => setR(el.getBoundingClientRect());
    place();
    window.addEventListener('resize', place);
    document.querySelector('.main')?.addEventListener('scroll', place);
    return () => { window.removeEventListener('resize', place); document.querySelector('.main')?.removeEventListener('scroll', place); };
  }, [tip]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  const pad = 6;
  const below = r.bottom + 180 < window.innerHeight || r.top < 200;
  const w = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  return createPortal(
    <div className="coach" onClick={onDone} role="dialog" aria-label={tip.title}>
      <div className="coach-hole" style={{ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 }} />
      <div className="coach-bubble" style={{ left, width: w, ...(below ? { top: r.bottom + 14 } : { bottom: window.innerHeight - r.top + 14 }) }} onClick={e => e.stopPropagation()}>
        <span className="t-tm">{tip.title}</span>
        <span className="t-bm">{tip.body}</span>
        <div className="row" style={{ justifyContent: 'flex-end' }}><Btn kind={phone ? 'filled' : 'tonal'} onClick={onDone}>Got it</Btn></div>
      </div>
    </div>,
    document.body,
  );
}

/** Settings → Account / account menu: show the welcome and the tips again */
export function useReplayIntro() {
  const st = useStore();
  return () => st.updateSettings({ onboarding: { ...(st.settings.onboarding ?? {}), done: true, checklist: undefined, seen: {}, replay: true, replayAt: new Date().toISOString() } });
}
