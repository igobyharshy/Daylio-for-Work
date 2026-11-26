# Ontrack — handoff for new chats (iteration, QA, feedback)

> Paste or attach this at the start of a new chat. It replaces the long build history.
> Owner: **Harshy** (igobyharshy@gmail.com). Not a programmer, so explain things in plain words, keep messages short, and give the result, not a log of steps.
> Last updated 2026-11-24, after UX pass 2 went live.

---

## 0. TL;DR for Claude
1. The app is **live and holds Harshy's real work data**. Never lose or rewrite it.
2. **Release rule: when Harshy asks for a change, build it, typecheck and build, then commit and push straight to `main`.** Vercel auto-deploys to production in about 30 s. No preview link or approval round, unless he asks for one.
3. **Database changes are additive only**: add columns or tables with defaults. Take a snapshot first, and apply to `ontrack-test` before production.
4. Never promote a preview deployment to production, because previews are built against the **test** database.
5. Don't run destructive SQL on user tables without Harshy's explicit OK.

---

## 1. What Ontrack is
A personal **estimate-training task timer and work journal** (formerly "Daylio for Work"). The loop:

- Harshy plans his day.
- He estimates each task and runs a countdown timer on it.
- When the time runs out or a task is late, he reflects in the journal.
- Insights show how accurate his estimates are over time.

**Core product rules (don't break these):**
- There is **one countdown**: the estimate. The due date never counts down.
- Insights score against the **original** estimate. Re-estimates are logged, not overwritten.
- New tasks are due today by default. Tasks added from My Day go to **My Day and Inbox**.
- **Inbox can't be deleted.**
- **Status is a label and is separate from the checkbox.**
  - Ticking the checkbox, or pressing Done, finishes the task: it stops the timer, records the time, and sets status to Done.
  - Choosing "Done" in the status menu does **not** tick the box.
  - Moving a task out of Done un-ticks it.
- A running or paused-in-progress task is **always in My Day** and can't be removed from it while the timer runs.
- Pressing ▶ with no estimate opens "Add an estimate first", which offers **Start timer** or **Start without estimate**.
- My Day's list and board use the same status groups (`statusGroups`): Not started / In progress / Done always show; other statuses show only when in use; Archived never shows.
- Drag and drop sorts tasks and moves them between statuses. Dragging never starts a timer and never ticks a task.
- Overdue is shown as a tag in the Due row.
- Archiving a project is a flag (`projects.archived`), separate from its status. Archived projects' tasks are hidden from My Day.
- Deletes use Undo: the server delete waits 6.5 s.
- Sign-in is email and password only, with no sign-up. It's a single user (Harshy).

**Colour meaning:**
- primary (purple) means running and under the estimate
- tertiary (pink) means the estimate ran out or the task is over
- error (red) means the deadline has passed, or a Mistake

---

## 2. Links & accounts
| What | Where |
|---|---|
| **Live app (real data)** | https://beingontrack.vercel.app (renamed 26 Nov; ontrack-harshy.vercel.app redirects there; also ontrack-harshy1.vercel.app, daylioforwork.vercel.app) |
| GitHub | `igobyharshy/Daylio-for-Work`. Branch **`main` = production**. Old branches: `ux-pass-1`, `ux-pass-2`, `build/ontrack-v1` |
| Vercel | project `ontrack` (`prj_f2Tg7jH60t39Plr1Ew8N94YXZSbx`), team `harshy1` (`team_Pq0AgXklHoWIIOLKPPgnReR3`). Pushes to `main` auto-deploy to production (confirmed 24 Nov). Previews are behind Vercel login (SSO). |
| Supabase **production** | project `ontrack`, id `jehnoqlzcuxhqwfeywyw`, ap-south-1 (Mumbai), free plan |
| Supabase **test** | project `ontrack-test`, id `xfhesoqugagydzqhxsli`. Used by preview and dev builds. It has a login for Harshy's email with a test password (the password is in the old chat; reset it in Supabase if needed). |
| Env vars (Vercel) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key). Production points to ontrack; Preview and Development point to ontrack-test. **Never commit keys.** `.env.local` is git-ignored. |
| Design | Penpot page **"Hi-fi v1 · Material 3 New"** (purple M3 baseline), not "Material 3 Blue". Update Penpot only when Harshy gives a green light. It currently lags behind the code (UX pass 1 and 2 aren't in Penpot yet). |
| Project docs (claude.ai project "Daylio for work") | `claude/live-app-and-data-safety.md`, `claude/ux-pass-1-solutions.md`, `claude/ux-pass-2-decisions.md`, plus older design-decision docs. Read them only if needed. |

---

## 3. Data safety (the non-negotiables)
- **Code deploys never touch data.** All data lives in Supabase. Every update must keep working with the rows already there.
- **Additive-only migrations:**
  - Never drop, rename or retype a column.
  - Never delete or rewrite user rows in a migration.
  - If a shape must change, add a new field and read old values in code. Example: `projectFromRow` turns the old status `"Archived"` into `archived: true`.
- **Settings** live in `user_settings.data` (jsonb). A new setting gets a default in `DEFAULT_SETTINGS`, and old stored values must keep loading. The settings-load code in `store.tsx` patches old defaults.
- **Before any migration:**
  1. Run `select backup.take_snapshot();` on production.
  2. Tell Harshy what the migration does.
  3. Apply it to ontrack-test first, then to production.
  4. Save the SQL in `supabase/migrations/` with the next number.
- **Nightly backups:** pg_cron job `ontrack-nightly-backup` runs at 2:00 am IST (`30 20 * * *` UTC). It calls `backup.take_snapshot()`, which stores full per-user JSON in the private table `backup.snapshots` and keeps 30 days.
- **Restore:** read the JSON from `backup.snapshots` and re-insert only what's missing. Ask Harshy first.
- **Rollback of code:** Vercel Instant Rollback to the previous production deployment, or revert the commit on `main` and push.
- **Export:** in the app, Settings → Account → Export downloads a JSON copy.

**Migrations so far** (all in `supabase/migrations/`, applied to both databases):
1. core schema
2. `delete_my_account` RPC
3. trackers and check-ins
4. `ux_pass_1_archive_flag_and_paused_at` (`projects.archived`, `tasks.paused_at`)

Production also has `nightly_backup_snapshots` (the `backup` schema and the cron job).

**Tables** (all have row-level security per user, realtime is on):
- `projects`
- `tasks`
- `journal_entries`
- `user_settings`
- `notifications`
- `daily_checkins`

**Current real data (24 Nov):** a clean start after removing sample data. Harshy started using the app for real work, so assume every row is precious.

---

## 4. Stack & code map
React 19, TypeScript, Vite 8 (PWA via vite-plugin-pwa), React Router 7, `@supabase/supabase-js`, `react-icons/md` (Material icons) and plain CSS with M3 tokens. There's no component library. The code is about 6.5k lines in total.

```
src/
  App.tsx            routes; UIWithStore wrapper; renders DayPanel + EstimateFirstHost
  main.tsx
  app/
    shell.tsx        SIDEBAR shell (no top bar): brand + bell + theme toggle, search (Ctrl K),
                     nav (My Day/Projects/Journal/Insights), running-timer chip, profile drop-up
                     (Settings, Account, Theme Light/Dark/System, Sign out); search overlay
    engine.tsx       reminders, notifications, reflection prompts (skips sample/archived)
    ui.tsx           UI context: drawer/task focus, day panel (openDay/openEntry/newEntry), askEstimate
    SignIn.tsx
  features/
    myday.tsx        My Day page: header counts, filter, SampleBanner, Now (RunCard), PlanLine, list/board
    tasks.tsx        TaskRow, TaskMenu (⋮), useTaskActions, TaskGroups, TaskBoard, AddTaskBar
                     (quick-add parses "tomorrow"/weekday + "30m"/"1h30"), filters, EstimateFirstHost
    drawer.tsx       task drawer: title + Steps (To Do style, drag-reorder), timer block,
                     details card (Status, Project, Estimate, Due, Remind, My Day, Started/Finished), note, journal
    projects.tsx     Projects list/gallery/board, ⋮ menus, archive/delete (move-or-delete dialog),
                     ProjectPage (stats, list/board per project), DatesPopover, Cover/emoji pickers
    journal.tsx      JournalPage (calendar/list, CheckinBar), DayPanel sheet (check-in + entries),
                     EntryForm (same everywhere), ReviewPage (reflections), WhatHappenedDialog
    trackers.tsx     tracker inputs/editors (scale, stepper, duration, etc.)
    insights.tsx     estimate accuracy charts (uses realTasks)
    settings.tsx     tabs: work-day, default-tags, trackers, statuses, notifications, account
    mini.tsx         Picture-in-Picture mini timer (follows theme)
    common.tsx       SampleBanner, TimerChip
    dnd.ts           useDragSort: pointer-based DnD, ghost, auto-scroll, data-drag-id/data-drop-group
  lib/
    types.ts         Task/Project/Settings types, DEFAULT_SETTINGS, CORE_STATUSES
    db.ts            row ↔ model mapping (fromRow/toRow) — add new columns here both ways
    store.tsx        useStore(): all data + actions (startTask, pauseTask, finishTask, setStatus,
                     removeTask/removeEntry/removeProject with undo, …); settings migration on load
    select.ts        selectors: myDayTasks, activeTask, statusGroups, inMyDay, realTasks, hideSample,
                     projectStats, sortBetween, tag/cover colours
    time.ts          fmtMs, parseQuickAdd, date helpers
    seed.ts          sample data (hidden once ≥3 real finished tasks)
    trackers.ts, patterns.ts, supabase.ts
  ui/  kit.tsx (Tag, buttons…), pickers.tsx (Calendar Monday-first, DuePicker, EstimateDialog,
       TimeInput), Icon.tsx, Toast.tsx
  styles/ tokens.css (M3 light + dark tokens, --c-* accent palettes), app.css
supabase/migrations/   SQL history + README (release/migration rules)
tools/ui-test/         mock.mjs (in-memory Supabase stand-in) + smoke.mjs (screenshots + page errors)
docs/                  ux-pass-1-solutions.md, this file
```

**Routes:**
- `/my-day`
- `/projects` and `/projects/:id`
- `/journal` and `/journal/review`
- `/insights`
- `/settings/:tab`

**UX pass 2 (live 24 Nov):**
- **Shell:** a sidebar replaces the top bar.
  - The bell (notifications popover) and theme toggle sit in the sidebar's top row.
  - The profile drop-up is at the bottom.
- **Density:** compact, To Do-like.
  - Type: body 14/20, meta 12/16, titles 17/24.
  - Sizes: rows ≥ 48 px, checkbox 32, icon buttons 32, chips 28, fields 44.
  - This replaces the old 40 px icon-button rule.
- **Steps:** drag to reorder; inset dividers.
- **Dark theme:** `settings.theme` is `light | dark | system` (optional, defaults to light).
  - It's applied as `<html data-theme>` and mirrored to localStorage.
  - An inline script in `index.html` applies it before first paint.
  - Dark tokens follow M3 baseline dark: surface #141218, cards #2b2930, primary #d0bcff.

---

## 4b. Phones + Android app (26 Nov)
Phone layout below 720 px (bottom nav, mini player, focus timer, bottom sheets) and a Capacitor Android app that opens the live site. Details: `docs/mobile-app.md`. APK: https://github.com/igobyharshy/Daylio-for-Work/releases/latest/download/Ontrack.apk (built by GitHub Actions when `android/` changes). Keep desktop unchanged when touching `src/styles/mobile.css`.

## 4c. Themes, repeating tasks, sign-up & onboarding (26 Nov evening)
- 12 colour themes × light/dark: `src/styles/themes.css` + `src/lib/accents.ts` are GENERATED by `tools/gen-themes.mjs`
  (`settings.accent`, `<html data-accent>`). Pink "over estimate" and red "late" keep their meaning in every theme.
- Repeating tasks: `tasks.repeat` jsonb (migration `20261126160000_repeating_tasks.sql`). Finishing creates the next one;
  helpers in time.ts (`nextOccurrence`, `repeatLabel`); UI `RepeatPicker` in tasks.tsx.
  Picker (Harshy, 26 Nov): Doesn't repeat · Daily · Weekdays · Weekends · Monthly (opens a day-of-month grid, 1–31 + Last day) ·
  Custom (every N days/weeks/months; weekday buttons or the same day grid). No single-weekday presets: use Custom.
  Monthly rules store `monthDay` (1–31, -1 = last day) in the jsonb; older rules without it get pinned from the due date
  (`pinRepeat`) so the 31st no longer drifts to the 28th.
- Sign-up + onboarding for new people: docs/onboarding.md. Existing users are auto-marked done.
- Phone: swipe right = done, left = tomorrow; long-press = menu / drag. Desktop: press N to add a task; Esc closes the side sheet.

## 5. How to work on a change (the routine)
1. **Get the code.** If the repo isn't in the session, attach `igobyharshy/Daylio-for-Work` with push access, clone it, then run `npm ci`.
2. **Make the change.** Keep to M3 tokens in `tokens.css`, and to existing components and patterns. Don't add new screens or flows beyond what Harshy asks for without checking with him.
3. **Check:** `npm run build`, which runs typecheck plus the Vite build.
   - Optional quick visual QA: run `npx vite preview --port 4173 &`, then `node tools/ui-test/smoke.mjs light` (or `dark`).
   - Screenshots go to `tools/ui-test/shots/`. Look at them with Read.
   - Mock login: `ontrack-test@example.com` / `test-password`.
   - The sandbox usually can't reach supabase.co, which is why the mock exists.
   - Playwright is at `/opt/npm-tools/node_modules`; Chrome is at `/usr/bin/google-chrome`.
4. **Commit to `main` and push.** End the commit message with the attribution lines the session gives you.
5. **Confirm the deploy.** Use Vercel `list_deployments`: the newest has target production, is READY, and has the new sha. If no deployment appeared, use `create_deployment` with target production and gitSource github igobyharshy/Daylio-for-Work, ref main.
6. **Tell Harshy in 1–3 lines** what changed and to refresh.

If a change needs a database column, follow section 3 first: snapshot, apply to test, apply to production, add the migration file, update `db.ts` both ways and give a default in types.

---

## 6. Known open items / backlog
- Harshy still needs to turn off "Allow new users to sign up" in the Supabase dashboard (Authentication → Sign In / Providers), on both projects.
- Supabase free plan: a project pauses after about 7 days unused. The data is kept; resume it from the dashboard.
- Penpot doesn't have UX pass 1 or 2 yet. Update it only on Harshy's green light.
- Deferred ideas (not built; ask Harshy before building):
  - end-of-day wrap-up
  - multi-select tasks
  - duplicate project
- A spare test login `ontrack-test@example.com` exists in **production** auth. It's harmless and Harshy didn't ask to remove it.

---

## 7. How Harshy likes to work
- Plain language, short messages, outcome first. No jargon or step-by-step logs.
- He'll send batches of bugs and feedback from daily use, often with screenshots. Fix them all, push live, and report briefly.
- Ask questions only when a wrong guess would be costly. Otherwise make the sensible call and mention it.
- Don't paste tokens, keys, MCP URLs or passwords in chat.
