# Database migrations

Applied in order to both Supabase projects:
- **ontrack** (production, Harshy's real data) — `jehnoqlzcuxhqwfeywyw`
- **ontrack-test** (preview links) — `xfhesoqugagydzqhxsli`

Rules: additive only (add columns/tables with defaults; never drop, rename or retype; never rewrite user rows).
Apply to ontrack-test first, check a preview, then apply to production after `select backup.take_snapshot();`.
The nightly backup job (`backup.take_snapshot`, pg_cron) exists on production only.
