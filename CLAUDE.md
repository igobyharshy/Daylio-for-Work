# Ontrack — working notes for Claude

- Design source of truth: Penpot page **“Hi-fi v1 · Material 3 New”** (purple M3 baseline). Not the “Material 3 Blue” page.
- Colour meaning: tertiary/pink = estimate ran out / over; error/red = deadline passed or Mistake; primary = running, under estimate.
- Product rules: one countdown (the estimate); Insights score against the ORIGINAL estimate; re-estimates are logged; Due never counts down; Inbox can't be deleted; new tasks default due today; tasks added from My Day go to My Day + Inbox.
- Auth: email + password only, no sign-up. Never commit secrets; Supabase publishable key lives in Vercel env vars.
- Do not commit or push unless asked. Work on a feature branch (Vercel gives a preview URL); production is the branch `build/ontrack-v1` → ontrack-harshy.vercel.app.

## Harshy's real data lives in production — never lose it
- Code deploys never touch data; data lives only in Supabase. Every update must keep working with the data already there.
- **Database changes are additive only**: add columns/tables with safe defaults. Never drop, rename or retype a column, never delete or rewrite user rows in a migration. If a shape must change, add the new field and read old values in code (see `projectFromRow`: old status "Archived" → `archived` flag).
- Settings live in `user_settings.data` (jsonb); new settings must have defaults in `DEFAULT_SETTINGS` and old stored values must keep loading.
- Before any migration: take a snapshot (`select backup.take_snapshot()` if the backup job exists) and say what the migration does.
- Test new features locally against the mock backend (`/home/claude/ontrack-test`) before pushing; previews may share the production database.
- Never run destructive SQL (delete/update/truncate on user tables) without Harshy's explicit OK.
