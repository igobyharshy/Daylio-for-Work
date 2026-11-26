import { isMobileNow, isNative, nativeNotifyNow } from '../lib/native';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useUI } from './ui';
import { activeTask, archivedIds, isLive, needsReflection } from '../lib/select';
import { atTime, dueLabel, elapsed, fmtMin, fmtTimer, inWorkDay, remainingMs, todayISO, totalEstimateMin } from '../lib/time';
import type { Notif } from '../lib/types';
import { useToast } from '../ui/Toast';

const once = (key: string) => {
  try { if (localStorage.getItem(key)) return false; localStorage.setItem(key, '1'); return true; } catch { return true; }
};

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.4);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.45);
    });
  } catch { /* audio not available */ }
}

/** Background checks: estimate used up, reminders, end-of-day reflection. Runs while the app is open. */
export function Engine() {
  const st = useStore();
  const ui = useUI();
  const nav = useNavigate();
  const toast = useToast();
  const ref = useRef({ st, ui, nav });
  ref.current = { st, ui, nav };

  useEffect(() => {
    const notify = (n: Partial<Notif> & { title: string; body: string; kind: Notif['kind'] }, windows: boolean, onClick: () => void, tag: string) => {
      const { st } = ref.current;
      st.addNotif(n);
      const quiet = st.settings.notif.quietOutsideWorkDay && !inWorkDay(st.settings);
      // Android app: reminders and the estimate alert are scheduled natively ahead of time (they fire even when
      // the app is closed), so only the in-the-moment ones are sent from here.
      if (isNative) {
        if (windows && !quiet && !tag.startsWith('remind-') && !tag.startsWith('over-')) nativeNotifyNow(n.title, n.body, { taskId: n.taskId ?? null, kind: n.kind });
      } else if (windows && !quiet && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const w = new Notification(n.title, { body: n.body, icon: '/icon-192.png', tag, requireInteraction: n.kind !== 'info' });
          w.onclick = () => { window.focus(); onClick(); w.close(); };
        } catch { /* ignore */ }
      }
      if (st.settings.notif.sound) chime();
    };

    const tick = () => {
      const { st, ui, nav } = ref.current;
      if (!st.loaded) return;
      const now = Date.now();
      const s = st.settings;

      // Estimate used up / over-estimate nudge
      const t = activeTask(st.tasks, st.projects);
      if (t && t.runStartedAt && t.estimateMin) {
        const rem = remainingMs(t, now);
        if (rem <= 0 && once(`ot-over-${t.id}-${totalEstimateMin(t)}`)) {
          notify({ kind: 'over', title: `${t.title} ran past its estimate`, body: `Estimate ${fmtMin(totalEstimateMin(t))} · took ${fmtMin(elapsed(t, now) / 60000)} so far. What happened?`, taskId: t.id }, s.notif.estimateUsedUp, () => ui.openWhatHappened(t.id), `over-${t.id}`);
        }
        const overMin = -rem / 60000;
        if (s.notif.overNudge && overMin >= 15) {
          const step = Math.floor(overMin / 15);
          if (once(`ot-nudge-${t.id}-${totalEstimateMin(t)}-${step}`)) notify({ kind: 'over', title: `Still on ${t.title}`, body: `${fmtMin(overMin)} over estimate. Extend it, or finish up?`, taskId: t.id }, true, () => ui.openWhatHappened(t.id), `nudge-${t.id}`);
        }
      }

      // Task reminders
      const arch = archivedIds(st.projects);
      st.tasks.forEach(x => {
        // sample tasks and tasks in archived projects never remind
        if (!x.remindAt || x.remindedAt || x.finishedAt || x.isSample || !isLive(x, arch)) return;
        if (new Date(x.remindAt).getTime() > now) return;
        st.updateTask(x.id, { remindedAt: new Date().toISOString() });
        if (!once(`ot-remind-${x.id}-${x.remindAt}`)) return;
        const p = st.projectById(x.projectId);
        notify({ kind: 'reminder', title: `Reminder: ${x.title}`, body: [dueLabel(x), p?.name, x.estimateMin ? `estimate ${fmtMin(x.estimateMin)}` : null].filter(Boolean).join(' · '), taskId: x.id }, s.notif.taskReminder, () => { nav('/my-day'); ui.openTask(x.id); }, `remind-${x.id}`);
      });

      // Snoozed reflections coming due
      st.tasks.forEach(x => {
        if (x.reflection !== 'needed' || !x.snoozeUntil || x.isSample) return;
        if (new Date(x.snoozeUntil).getTime() > now) return;
        if (once(`ot-snooze-${x.id}-${x.snoozeUntil}`)) notify({ kind: 'reflection', title: 'Time to write it down', body: `${x.title} went over. Get back to this while it’s fresh.`, taskId: x.id }, s.notif.reflectionReminder, () => nav('/journal/review'), `snooze-${x.id}`);
      });

      const today = todayISO();
      // Daily check-in reminder
      if (s.checkinRemind && now >= atTime(today, s.checkinRemind).getTime() && s.lastCheckinPrompt !== today) {
        const c = st.checkinFor(today);
        const hasTrackers = s.trackers.some(x => !x.archived && x.askOn === 'checkin');
        if (hasTrackers && !c?.skipped && !Object.keys(c?.values ?? {}).length) {
          st.updateSettings({ lastCheckinPrompt: today });
          notify({ kind: 'info', title: 'Daily check-in', body: 'How did you sleep, and how’s your energy? Takes 10 seconds.' }, true, () => nav('/journal'), 'checkin');
        }
      }

      // End-of-day reflection reminder
      const eod = atTime(today, s.workEnd).getTime();
      if (now >= eod && s.lastReflectionPrompt !== today) {
        const n = needsReflection(st.tasks, now).length;
        if (n > 0) {
          st.updateSettings({ lastReflectionPrompt: today });
          notify({ kind: 'reflection', title: 'Reflection reminder', body: 'Some tasks ran over or finished late today. Write a line on each while it’s fresh.' }, s.notif.reflectionReminder, () => nav('/journal/review'), 'eod');
        }
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  // live timer in the browser tab title
  useEffect(() => {
    const id = setInterval(() => {
      const t = activeTask(ref.current.st.tasks, ref.current.st.projects);
      if (t && t.runStartedAt) {
        const rem = remainingMs(t);
        const up = ref.current.st.settings.timerDirection === 'up' && !!t.estimateMin;
        document.title = `${up ? fmtTimer(elapsed(t)) : t.estimateMin ? (rem < 0 ? fmtTimer(rem) + ' over' : fmtTimer(rem)) : fmtTimer(elapsed(t))} · ${t.title}`;
      } else document.title = 'Ontrack';
    }, 1000);
    return () => { clearInterval(id); document.title = 'Ontrack'; };
  }, []);

  // offer Windows notifications once, with a gentle snackbar — for new people, only after their first timer (not mid-welcome)
  const startedOnce = st.tasks.some(t => !t.isSample && !!t.firstStartedAt);
  const ready = (st.settings.onboarding?.done ?? true) && (startedOnce || !st.settings.onboarding?.doneAt);
  useEffect(() => {
    if (!ready || isNative || typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const id = setTimeout(() => {
      if (!once('ot-asked-notif')) return;
      toast.show(isMobileNow() ? 'Turn on notifications so reminders reach you.' : 'Turn on Windows notifications so reminders reach you while you work.', { icon: 'bell', duration: 15000, action: { label: 'Turn on', onClick: () => Notification.requestPermission() } });
    }, 2500);
    return () => clearTimeout(id);
  }, [toast, ready]);
  return null;
}
