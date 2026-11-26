-- Repeating tasks (26 Nov 2026). Additive: one nullable jsonb column, existing rows untouched.
-- Applied to ontrack-test first, then production after `select backup.take_snapshot();`.
alter table public.tasks add column if not exists repeat jsonb;
comment on column public.tasks.repeat is 'Repeat rule {freq: day|week|month, every, days?: 0=Mon..6=Sun, nextId?}. Null = does not repeat.';
