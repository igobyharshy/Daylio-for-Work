# Onboarding & sign-up (26 Nov 2026)

Ontrack is opening up to friends, so it now has sign-up and a first-run journey. Everyone's data is private to them: every table
has row-level security (`auth.uid() = user_id`) for select/insert/update/delete, and realtime respects it.

## Goals (what "good onboarding" means here)
1. **Get to the "aha" in the first session:** guess a time, run the timer, see whether you beat it. Teach by doing, not by slides.
2. **Under a minute of set-up**, every step skippable, nothing that blocks returning users.
3. **Make it feel like theirs:** name, work hours, colour theme.
4. **Keep teaching after the welcome**, in context: a checklist of the core loop and one short tip per page, once.
5. **Replayable:** account menu → Intro & tips, or Settings → Account → Help.

## The journey
1. **Sign in / Create account** (`src/app/SignIn.tsx`). Name, email, password (8+). Desktop shows the value props beside the form.
   - Invite link: **/signup** (also /join, /invite, ?signup) opens straight on "Create your account"; the address follows the mode.
   - Live password strength hint; "Send the link again" on the check-your-email screen (when Confirm email is on).
   - Account menu → **Invite a friend** shares (phone) or copies (desktop) the /signup link.
   - Test: `node tools/ui-test/signup.mjs phone|desktop`.
   Also: Forgot password → reset email → the app opens a "Set a new password" dialog (`PASSWORD_RECOVERY`).
   If email confirmation is on, the form switches to "Check your email".
2. **Welcome** (`src/features/onboarding.tsx`, full screen, progress bar, Back, Skip, Android back = step back):
   - 3 intro cards: what Ontrack is for → the loop (Guess · Time it · Reflect) → what you get (patterns).
   - About you: name + work day (explains how "due today" and quiet hours use it).
   - Pick a colour: mode + the 12 themes, live.
   - Start fresh (clears the sample data) or keep the examples.
   - First task: title (with suggestion chips) + estimate chips → added to My Day.
   - Ready: big ring with the estimate → **Start the timer** (or "I'll start it later").
3. **Coach marks** (one at a time, first visit only): the Now card after the first start, the add bar, Journal, Insights, Projects.
4. **Getting started** card on My Day (collapsed; shows the next step with a "Do it" button):
   add a task with an estimate → start the timer → finish a task → write a line in the Journal → look at Insights.
   Progress is read from real data, so it can't get out of sync. Hide it any time.
5. The browser notification prompt waits until the person has started their first timer.

## State
`user_settings.data.onboarding` (jsonb, no migration): `{ done, doneAt, checklist: 'hidden', seen: {page: true}, replay }`.
People who already have their own tasks (Harshy) are marked done silently on load and never see any of it.

## Supabase settings to check (dashboard)
- Authentication → Sign In / Providers → **Allow new users to sign up: ON** (needed for friends).
- Email provider → **Confirm email: OFF** recommended. Supabase's built-in email only reliably reaches team members unless you
  add your own SMTP, so confirmation and reset emails may not arrive. With it off, people are signed in right after sign-up.
  Password reset still needs email: set up custom SMTP (Resend, Postmark…) when you want resets to work for friends.

## Testing
`node tools/ui-test/onboarding.mjs phone|desktop light|dark` — a fresh account through the whole journey
(`createMock({ fresh: true })`; other scripts use an account that's past onboarding).
