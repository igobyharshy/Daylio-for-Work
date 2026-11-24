-- Timeline (My Day → Timeline view). Additive only: two new task columns with defaults, one new table.
--   tasks.planned_start : when Harshy plans to work on the task (length = its estimate). Separate from the due date.
--   tasks.sessions      : timer work sessions [{ "s": iso, "e": iso | null }] logged from now on, so the Actual
--                         view can show real gaps between pauses. Old tasks keep '[]' and show one bar start → finish.
--   time_blocks         : meetings, lunch, breaks and other non-task time on the timeline.

alter table public.tasks add column if not exists planned_start timestamptz;
alter table public.tasks add column if not exists sessions jsonb not null default '[]';

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  kind text not null default 'meeting',
  start_at timestamptz not null,
  end_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists time_blocks_user_idx on public.time_blocks(user_id);
create index if not exists time_blocks_start_idx on public.time_blocks(user_id, start_at);

drop trigger if exists time_blocks_updated on public.time_blocks;
create trigger time_blocks_updated before update on public.time_blocks for each row execute function public.set_updated_at();

alter table public.time_blocks enable row level security;
drop policy if exists "own rows select" on public.time_blocks;
drop policy if exists "own rows insert" on public.time_blocks;
drop policy if exists "own rows update" on public.time_blocks;
drop policy if exists "own rows delete" on public.time_blocks;
create policy "own rows select" on public.time_blocks for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on public.time_blocks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows update" on public.time_blocks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows delete" on public.time_blocks for delete to authenticated using ((select auth.uid()) = user_id);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'time_blocks') then
    alter publication supabase_realtime add table public.time_blocks;
  end if;
end $$;
