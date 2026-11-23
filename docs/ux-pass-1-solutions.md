# Ontrack · UX pass 1: problems and settled solutions

Sources: the overall rundown, the My Day, Projects and Journal deep dives (23 Nov 2026), and Harshy's manual-testing notes, including the Steps screenshot (Microsoft To Do style).
Status: **settled → being implemented on branch `ux-pass-1`**. Penpot gets updated only after Harshy approves the build.

Correction to the earlier reports: the "see-through dialogs" were a screenshot-timing mistake. The screenshots caught the 200 ms fade-in; once open, the dialogs are solid. There is nothing to fix.

---

## 1. Core models (these decide most of the fixes below)

### 1.1 Status and the checkbox are separate (Harshy's rule)
- **Status** is a workflow label: *Not started → In progress → Done*, plus any custom statuses. Change it from the drawer's Status row, the row ⋮ menu, or by dragging between groups or columns.
- **Checkbox / Done button** = *finish*: it stops the timer, records the actual time, shows the outcome, and sets the status to Done.
- Setting the status to **Done** does *not* tick the task or stop its timer. Moving a ticked task **out of** Done un-ticks it, because "ticked but In progress" is a contradiction.
- Pressing ▶ sets the status to *In progress* (if it was Not started or a custom status).

### 1.2 One set of groups everywhere
- My Day list, My Day board, the project list, the project board and every status filter all use the same groups, in the order set in Settings → Statuses.
- The core three (**Not started, In progress, Done**) always show. Other statuses (Backlog, Planned, Reviewed…) appear only when a task actually has them. Archived never shows.
- List and board are the same data in two layouts.

### 1.3 Timers
- **Running task = always in My Day.** Pressing ▶ anywhere adds the task to today. While the timer runs, "Remove from My Day" is locked, with the tip "Pause the timer first".
- **No estimate → ask first.** Pressing ▶ on a task without an estimate opens the estimate dialog titled "Add an estimate first". It has quick picks, a primary **Start timer** button and a text button **Start without estimate**.
- **The "Now" timer card** shows the running task. If nothing is running, it shows the most recently paused task in My Day, but only if the last timer action was a pause. After you tick a task done, the card says "Nothing running" instead of pulling up another task. This fixes the bug where Done could finish a second task by accident. Removing a paused task from My Day removes it from the card.
- **The timer is visible on every page.** Outside My Day, a compact timer chip sits in the top bar with the task name, time left, pause or resume, pop-out mini timer and Done. The task drawer's timer block also gets the pop-out button. The mini timer gets pause and resume.
- Time under a minute shows as "<1m", not "0m". A running task with no estimate counts up ("0:07 elapsed"), never "+0:07 left".
- **"What happened?"** only appears while a timer is running over its estimate (with +5, +10, +30 quick extends), or after finishing (the reflection queue). It no longer appears on idle rows.

### 1.4 Manual order, no jumping
- Rows keep a manual order (drag to sort) and never re-sort when you start, pause or estimate.
- Drag works with mouse and touch, within a group or column and between them. Every row also has a ⋮ menu (Status ▸, Move to project, My Day, Move to tomorrow, Delete), so dragging is never the only way.

### 1.5 Undo instead of "are you sure"
- Deleting a task, entry or project, removing from My Day, and finishing a task all show a message with **Undo** (deletes are held back for 6 s).
- Only one message shows at a time, and it sits above the add-task bar instead of covering it.

### 1.6 Sample data never pollutes real use
- Sample tasks never send reminders or notifications.
- As soon as you have 3 real finished tasks, sample data drops out of Insights and the reflection queue.
- A one-line banner, "You're seeing sample data · Clear it", shows until it's cleared.

---

## 2. My Day

| Problem | Solution |
|---|---|
| The list (In progress / Up next / Completed) doesn't match the board (Not started / Planned / In progress / Done) | Both use the groups from 1.2. The "Now" card sits above both views. |
| You can't move a task to In progress from the list | Drag it into the In progress group, use row ⋮ → Status, or press ▶. |
| Can't reorder tasks | Drag to sort (1.4). New tasks go to the bottom of Not started and briefly highlight. |
| "Remove from My Day" doesn't hide a paused task, and the card pulls in removed tasks | Card rule in 1.3. |
| Pressing Done drops the next task under the mouse | Card shows "Nothing running" after Done (1.3). |
| Rows jump under the pointer | Manual order (1.4). |
| Timer can start with no estimate | Estimate-first dialog (1.3). |
| Overdue tasks not on My Day are invisible | A line above the groups: "3 tasks are due today or overdue · Plan". It opens a list where you add tasks to today with ☀. Tasks carried over from earlier days show "From yesterday". |
| No "Move to tomorrow" | Row ⋮ → Move to tomorrow (sets the due date and removes from today). |
| Overdue isn't flagged on the card | The card and rows show an **Overdue** tag. |
| A row can show 4 times at once (reminder, due, start-by, bell) | Rows show at most: project · due (or Overdue) · steps x/y · 🔔. "Start by" lives in the drawer only. |
| Done group collapsed in some places and expanded in others | Expanded by default everywhere; the choice is remembered. |
| Filter is tags only | Same filter on My Day and project pages: Status, Due (Overdue / Today / This week), Project (My Day only). Active filters show as removable chips. |
| Add bar says "Add project" though the task goes to Inbox | The chip shows **📥 Inbox**. The hint becomes "↵ Add". Due today stays the default as a removable chip. |
| "tomorrow 30m" stays in the title | Quick-add understands a trailing *today / tomorrow / mon…sun* and *30m / 1h / 1h30*, shown as chips before you press Enter. |
| Done chips show noise like "9h 30m early" | The "early" chip is gone. "Late" stays. |
| Undo for Done comes back paused | Undo restores the running timer. |
| Board can only be dragged with a mouse, has no checkbox or run state, and Done is off-screen | Board cards get a checkbox, the running or paused time, the ⋮ menu and touch drag. Columns fit in the 1080px page and scroll inside it. |

## 3. Task drawer (Harshy's layout)

Order from top to bottom:
1. **Header:** project chip (click to move the task) · close.
2. **Title card:** checkbox + title. **Steps sit directly below in the same card**, To Do style: each step is a row with a small circle, its text (click to edit) and a ⋮ menu (Rename, Delete), with dividers between. Below them is "+ Add a step", which becomes "+ Next step" once steps exist.
3. **Timer block** (once started): time left or elapsed, then pause or resume, pop-out and Done. When over the estimate, a second row shows "+5 · +10 · +30 · What happened?". Nothing overlaps.
4. **Details card:** **Status** (first row) · Project · Estimate · Due (with an inline **Overdue** tag and a "Start by" sub-line that says "based on end of work day" when there's no due time) · Remind me · **My Day** (switch, locked while running) · Started · Finished.
5. Note (grows as you type, saves on blur).
6. Journal entries + "Write a journal entry".
7. Footer: created date · delete (with Undo).

Also:
- The "Added to My Day" banner becomes the switch in the details card.
- A first estimate on a started task is not treated as a re-estimate.
- "30 min before due" reminders move when the due date or time changes.

## 4. Estimate and date pickers

- Minutes roll over (90 → 1h 30m). The + and − buttons snap to steps of 5.
- The "you usually run over" tip is a clickable chip ("Use 45m"), rounded to 5 minutes, and hidden at 0.
- "Remove" only appears when there's an estimate.
- Every calendar starts on Monday. The due picker greys out past dates (except the current value).
- Time fields show one clock icon, not two.

## 5. Projects

| Problem | Solution |
|---|---|
| No ⋮ on rows, cards or board cards (Harshy) | ⋮ on every list row, gallery card and board card: Open · Status ▸ · Archive/Unarchive · Delete. |
| Board stretches the page to 1920px; header and top-bar icons go off-screen (Harshy) | Board stays in the 1080px container like My Day and scrolls sideways inside it. |
| Can't see or control the timer from inside a project (Harshy) | Top-bar timer chip and pop-out (1.3). ▶ in a project adds the task to My Day and asks for an estimate. |
| Archive is just a status: tasks stay on My Day, reminders keep firing, unarchive forgets the status | **Archive is a flag, separate from status** (new `archived` column). Archived projects are hidden by default in all three views ("Show archived (5)" toggle). Their tasks leave My Day, reminders and search. The project page shows a banner "Archived · Unarchive" and no add bar. Unarchive keeps the original status. |
| Delete always moves tasks to Inbox, with no undo | The delete dialog asks: **Move N tasks to Inbox** (default) or **Delete them too**. Then an Undo message. |
| Counts don't match ("6 projects" next to 2 cards) | "2 projects · 5 archived". |
| No sort or search | A search field and a sort menu (Manual / Name / Due date / Progress) on the Projects page. |
| Clicking a status in the list opens the project | The status pill opens the status menu. |
| Status never updates itself | Starting a task in a Not started or Backlog project moves it to In progress. Marking Done with open tasks asks "N tasks are still open. Mark done anyway?". When every task is done, a hint says "All tasks done · Mark project Done". |
| "In progress" and "Done" pills look the same; "Reviewed" is pink (the over-estimate colour) | Done uses the secondary tone and Reviewed uses grey by default. Pink is reserved for "over estimate". |
| The 7 covers are really 4 colours, two of them the over-estimate pink | 7 distinct, meaning-free covers: lavender, blue, teal, green, yellow, peach, grey. |
| Icon picker: 24 emoji, includes the Inbox tray, no selection mark | 48 emoji, no 📥, the current icon is marked. |
| Cover and icon editing only appears on hover in New project | Always-visible "Change cover" button and pencil badge. |
| Dates popover pre-fills a due date 2 weeks out and opens on December | Starts empty on the current month. |
| List or board inside a project isn't remembered | Remembered per project. |
| "Done" filter says "No tasks match" | Status filters show the matching tasks, including done ones. |
| Inbox shows a progress ring | Inbox shows "N open" with no ring or %. |
| A project shows no estimate stats | The header shows "Estimated 6h · Spent 4h 20m · 75% within estimate". |
| Can't move tasks between projects from a list | Row ⋮ → Move to project. (Selecting several tasks at once is deferred.) |

## 6. Journal

| Problem | Solution |
|---|---|
| The check-in card hides trackers after the 4th, has uneven box heights, squeezes when a panel opens and pushes the calendar down (Harshy) | It becomes a **one-line check-in bar** that is always the same height: "☀ Today's check-in · 2 of 5 · Sleep Good · Energy 4 · **Log check-in** · Skip". When complete: "✓ Checked in · … · Edit". When skipped: "Skipped · Undo". |
| New entry is a pop-up but editing is a drawer; 4 different editors (Harshy) | **One day panel** (right-side drawer) for everything. Clicking a calendar day, a list day heading, "Log check-in" or "New entry" opens the panel for that day. It has a **check-in section** (every tracker, one row each, label left and input right, so the shape is the same however many trackers there are; editable for any past day; auto-saves) and that **day's entries** (edit in place, auto-save, Undo on delete) plus "+ New entry". The reflection page and "What happened?" use the same entry form (same fields, order and labels). |
| Unsaved entry edits are thrown away on close | Everything auto-saves, with a "Saved" hint. |
| Can't edit today's check-in after logging it; skip can't be undone; past days can't be logged | Fixed by the bar and the day panel. |
| Check-in data never appears in the Journal | Each calendar day shows a colour strip for one chosen check-in tracker (Energy by default). The list day headings show that day's check-in summary. |
| The day preview pops up on hover and covers other days | Clicking a day opens the day panel; nothing appears on hover. Future days look disabled. Days show up to 2 entry lines. |
| Tag colours repeat | Each tag gets its own colour: Mistake red, Task delay pink, Lesson purple, Idea teal, Win green; others take the next free colour. |
| Every manual entry defaults to "Mistake" and asks "what will you do differently?" | No default tag on manual entries. The question becomes "What's on your mind?". "Win" is added as a tag. |
| List is one flat list with no search | Day headings with times, a search field and multi-tag filtering. "No task linked" is removed. |
| A tracker added to an entry can't be removed; "Manage trackers…" loses the draft | Added trackers get a ✕. "Manage trackers" only appears in the check-in section, where nothing is lost. |
| Reflection queue says "went over" for tasks that were only late | Each item shows its reason ("+5m over" or "14h late"). The detail bar shows actual vs estimate. Dismiss is a visible button. |
| Badges disagree; the pink badge looks like an error | One count: the Journal nav item shows the reflection count in a neutral style. The header button reads "5 to reflect". Old reminder notifications don't quote stale numbers. |
| The time-of-sleep stepper uses sideways arrows, and minutes stop at 55 | Uses − and + like the estimate dialog, and minutes roll over. |
| Adding a suggested tracker says "Mood restored" and doesn't ask where it goes | Asks "Ask in daily check-in / Ask on journal entries", then confirms "Mood added to daily check-in". Tracker ⋮ gets "Move to …". |

## 7. Global

- The Settings gear shows as selected while you're on Settings.
- Search results show "Archived" and "Running".
- Insights: days with no tasks show a dashed baseline; 0% days show a short red stub. Sample data is excluded per 1.6.
- Account copy: "Email changes are handled by your account admin" (no "ask Harshy").

## 8. Deferred (new flows; ask before building)
End-of-day wrap-up · selecting several tasks at once · duplicate project · mobile layout pass.
