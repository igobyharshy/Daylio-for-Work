# Ontrack — working notes for Claude

- Design source of truth: Penpot page **“Hi-fi v1 · Material 3 New”** (purple M3 baseline). Not the “Material 3 Blue” page.
- Colour meaning: tertiary/pink = estimate ran out / over; error/red = deadline passed or Mistake; primary = running, under estimate.
- Product rules: one countdown (the estimate); Insights score against the ORIGINAL estimate; re-estimates are logged; Due never counts down; Inbox can't be deleted; new tasks default due today; tasks added from My Day go to My Day + Inbox.
- Auth: email + password only, no sign-up. Never commit secrets; Supabase publishable key lives in Vercel env vars.
- Do not commit or push unless asked. Work on a branch; Vercel gives a preview URL; merge to `main` for production.
