alter table public.journal_entries add column if not exists tracker_values jsonb not null default '{}';

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  "values" jsonb not null default '{}',
  skipped boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create trigger daily_checkins_updated before update on public.daily_checkins for each row execute function public.set_updated_at();
alter table public.daily_checkins enable row level security;
create policy "own rows select" on public.daily_checkins for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on public.daily_checkins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows update" on public.daily_checkins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows delete" on public.daily_checkins for delete to authenticated using ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.daily_checkins;
