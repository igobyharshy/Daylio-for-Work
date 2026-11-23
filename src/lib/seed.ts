import type { Project, Task, Entry } from './types';
import type { Checkin } from './trackers';
import { addDays, isoDate, uid } from './time';

/** Sample data modelled on the hi-fi designs, placed relative to today. */
export function buildSample(inboxId: string, now = new Date()) {
  const d = (n: number) => isoDate(addDays(now, n));
  const at = (n: number, h: number, m = 0) => { const x = addDays(now, n); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const today = d(0);
  const created = new Date().toISOString();

  const P = (p: Partial<Project>): Project => ({
    id: uid(), name: '', emoji: '📁', cover: 'blue', status: 'Not started', archived: false, startDate: null, dueDate: null, dueTime: null,
    tags: [], isInbox: false, sort: 0, isSample: true, createdAt: created, ...p,
  });
  const motion = P({ name: 'Motion reel', emoji: '🎬', cover: 'blue', status: 'In progress', startDate: d(-10), dueDate: d(18), dueTime: '18:00', tags: ['Work', 'Motion design'], sort: 1 });
  const clientA = P({ name: 'Client A website', emoji: '🌐', cover: 'teal', status: 'In progress', startDate: d(-7), dueDate: d(30), tags: ['Work', 'Graphic design'], sort: 2 });
  const brand = P({ name: 'Brand refresh', emoji: '✦', cover: 'purple', status: 'Not started', startDate: d(-2), dueDate: d(22), tags: ['Work', 'Graphic design'], sort: 3 });
  const personal = P({ name: 'Personal site', emoji: '🏠', cover: 'green', status: 'Backlog', tags: ['Personal'], sort: 4 });
  const portfolio = P({ name: 'Portfolio refresh', emoji: '📦', cover: 'amber', status: 'Done', startDate: d(-42), dueDate: d(-4), tags: ['Personal'], sort: 5 });
  const projects = [motion, clientA, brand, personal, portfolio];

  let sort = 0;
  const T = (t: Partial<Task>): Task => ({
    id: uid(), projectId: inboxId, title: '', status: 'Not started', dueDate: null, dueTime: null, estimateMin: null,
    reEstimates: [], myDayDate: null, remindAt: null, remindedAt: null, steps: [], note: '', elapsedMs: 0,
    runStartedAt: null, pausedAt: null, firstStartedAt: null, finishedAt: null, reflection: 'none', snoozeUntil: null,
    sort: ++sort, isSample: true, createdAt: created, ...t,
  });
  const step = (title: string, done = false) => ({ id: uid(), title, done });
  const doneTask = (t: Partial<Task> & { dayOffset: number; estimate: number; tookMin: number; finishH?: number }) => {
    const { dayOffset, estimate, tookMin, finishH = 12, ...rest } = t;
    const fin = at(dayOffset, finishH, 10);
    return T({
      status: 'Done', estimateMin: estimate, elapsedMs: tookMin * 60000, finishedAt: fin,
      firstStartedAt: new Date(new Date(fin).getTime() - tookMin * 60000).toISOString(), ...rest,
    });
  };

  const exportReel = T({
    title: 'Export motion reel v2', projectId: motion.id, status: 'In progress', dueDate: today, dueTime: '20:00',
    estimateMin: 120, myDayDate: today, elapsedMs: 30 * 60000 + 15000, firstStartedAt: at(0, 9, 30),
    steps: [step('Render at 4K', true), step('Compress for web'), step('Upload to client folder')],
    note: 'Use the H.264 preset from last time.',
  });
  const ravi = T({ title: 'Follow up with Ravi on brand assets', projectId: brand.id, dueDate: today, dueTime: '18:00', estimateMin: 15, myDayDate: today, remindAt: at(0, 16) });
  const hero = T({ title: 'Client A: homepage hero', projectId: clientA.id, dueDate: d(3), estimateMin: 45, myDayDate: today, steps: [step('Hero layout'), step('Copy pass')] });
  const emails = T({ title: 'Reply to studio emails', dueDate: today, estimateMin: 30, myDayDate: today });
  const planner = doneTask({ title: 'Update planner', dayOffset: 0, estimate: 20, tookMin: 12, finishH: 9, myDayDate: today });
  const standup = doneTask({ title: 'Morning status update', dayOffset: 0, estimate: 10, tookMin: 15, finishH: 10, myDayDate: today, reflection: 'needed' });

  const grade = T({ title: 'Color grade intro shot', projectId: motion.id, dueDate: today, estimateMin: 60 });
  const story = T({ title: 'Storyboard frames 4–8', projectId: motion.id, dueDate: d(2), estimateMin: 90 });
  const sound = T({ title: 'Sound pass', projectId: motion.id, dueDate: d(4), estimateMin: 30, steps: [step('Music bed'), step('Final mix')] });
  const footer = T({ title: 'Client A: footer links', projectId: clientA.id, dueDate: d(4), estimateMin: 30 });
  const moodboard = T({ title: 'Moodboard round 2', projectId: brand.id, dueDate: d(3), estimateMin: 60 });
  const about = T({ title: 'Write the About page', projectId: personal.id, estimateMin: 45, status: 'Backlog' });

  const renderPrev = doneTask({ title: 'Render preview for client', projectId: motion.id, dayOffset: -1, estimate: 120, tookMin: 125, finishH: 19, reflection: 'needed', dueDate: d(-1), dueTime: '19:00' });
  const invoice = doneTask({ title: 'Client A: send invoice', projectId: clientA.id, dayOffset: -1, estimate: 15, tookMin: 10, finishH: 11 });

  // History for Insights: ~3 weeks of finished tasks
  const names = ['Review feedback', 'Edit timeline', 'Prep assets', 'Team sync notes', 'Icon set tweaks', 'Layout pass', 'Client call prep', 'Export stills', 'Update style guide', 'Plan sprint'];
  const projCycle = [motion.id, clientA.id, brand.id, inboxId, portfolio.id];
  const history: Task[] = [];
  let k = 0;
  for (let day = 2; day <= 24; day++) {
    const n = (day * 7) % 3 + 1;
    for (let j = 0; j < n; j++) {
      k++;
      const est = [15, 30, 45, 60, 90, 120, 150][(k * 3 + day) % 7];
      const swing = [-0.3, -0.1, 0, 0.1, 0.25, 0.4, -0.2, 0.15][(k + day) % 8];
      const took = Math.max(5, Math.round(est * (1 + swing)));
      history.push(doneTask({ title: names[(k + j) % names.length], projectId: projCycle[k % projCycle.length], dayOffset: -day, estimate: est, tookMin: took, finishH: 10 + j * 3, dueDate: d(-day + (k % 3 === 0 ? -1 : 1)) }));
    }
  }

  const tasks = [exportReel, ravi, hero, emails, planner, standup, grade, story, sound, footer, moodboard, about, renderPrev, invoice, ...history];

  const E = (e: Partial<Entry>): Entry => ({ id: uid(), body: '', whenAt: created, tags: [], taskIds: [], trackerValues: {}, isSample: true, createdAt: created, ...e });
  const entries = [
    E({ body: 'Render settings were wrong, had to re-export. Next time, check the export preset before starting the render.', whenAt: at(-1, 19, 9), tags: ['Task delay'], taskIds: [renderPrev.id], trackerValues: { cause: ['Missed a step'] } }),
    E({ body: 'Client call ran long, pushed export.', whenAt: at(-2, 18, 30), tags: ['Task delay'], taskIds: [hero.id], trackerValues: { cause: ['Scope grew'] } }),
    E({ body: "Forgot fonts weren't synced.", whenAt: at(-2, 16, 10), tags: ['Task delay'], taskIds: [story.id] }),
    E({ body: 'Spoke too sharply to Priya in standup.', whenAt: at(-3, 10, 20), tags: ['Mistake'], trackerValues: { severity: 3, cause: ['Stress'] } }),
    E({ body: 'Underestimated the revisions round.', whenAt: at(-3, 17, 45), tags: ['Task delay'], taskIds: [hero.id], trackerValues: { cause: ['Rushed'] } }),
    E({ body: "Didn't ask the client for final copy before designing.", whenAt: at(-4, 15, 0), tags: ['Mistake'], trackerValues: { severity: 4, cause: ['Unclear brief'] } }),
    E({ body: 'Blocking 30 minutes before calls to prep made the review smooth.', whenAt: at(-6, 12, 0), tags: ['Lesson'] }),
  ];

  // Daily check-ins for the last ~4 weeks, loosely tied to how each day went (so Patterns has something to show)
  const checkins: Checkin[] = [];
  const mistakeDays: [number, number, string][] = [[-8, 4, 'Rushed'], [-11, 2, 'Distracted'], [-14, 5, 'Stress'], [-17, 2, 'Unclear brief'], [-20, 4, 'Rushed'], [-23, 1, 'Missed a step']];
  for (let day = 1; day <= 27; day++) {
    if (day % 9 === 5) continue; // a few skipped days
    const fin = history.filter(t => t.finishedAt && isoDate(new Date(t.finishedAt)) === d(-day));
    const within = fin.length ? fin.filter(t => t.elapsedMs <= (t.estimateMin ?? 0) * 60000).length / fin.length : 0.5;
    const noise = ((day * 37) % 7) / 7 - 0.4;
    const level = Math.max(0, Math.min(4, Math.round(within * 3.2 + noise + 0.4)));
    const sleep = 330 + level * 25 + ((day * 13) % 30);
    const bed = (23 * 60 + (4 - level) * 18 + ((day * 7) % 25)) % 1440;
    const energy = Math.max(1, Math.min(5, level + 1 + (day % 4 === 0 ? -1 : 0)));
    checkins.push({ id: uid(), day: d(-day), values: { sleep_quality: level, sleep_time: sleep, bedtime: `${String(Math.floor(bed / 60)).padStart(2, '0')}:${String(bed % 60).padStart(2, '0')}`, energy }, skipped: false, isSample: true });
  }
  checkins.push({ id: uid(), day: today, values: { sleep_quality: 3, sleep_time: 400, bedtime: '00:15' }, skipped: false, isSample: true });
  mistakeDays.forEach(([off, sev, cause], i) => entries.push(E({
    body: ['Sent the wrong file version to the client.', 'Lost 20 minutes looking for the brief.', 'Snapped at a teammate during review.', 'Started before the copy was final.', 'Skipped the checklist before export.', 'Forgot to book the render machine.'][i],
    whenAt: at(off, 15, 30), tags: ['Mistake'], trackerValues: { severity: sev, cause: [cause] },
  })));
  return { projects, tasks, entries, checkins };
}
