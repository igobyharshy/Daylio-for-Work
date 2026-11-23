create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '',
  emoji text not null default '📁',
  cover text not null default 'blue',
  status text not null default 'Not started',
  start_date date,
  due_date date,
  due_time time,
  tags text[] not null default '{}',
  is_inbox boolean not null default false,
  sort double precision not null default 0,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects(user_id);
create unique index projects_one_inbox on public.projects(user_id) where is_inbox;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null default '',
  status text not null default 'Not started',
  due_date date,
  due_time time,
  estimate_min integer,
  re_estimates jsonb not null default '[]',
  my_day_date date,
  remind_at timestamptz,
  reminded_at timestamptz,
  steps jsonb not null default '[]',
  note text not null default '',
  elapsed_ms bigint not null default 0,
  run_started_at timestamptz,
  first_started_at timestamptz,
  finished_at timestamptz,
  reflection text not null default 'none',
  snooze_until timestamptz,
  sort double precision not null default 0,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_idx on public.tasks(user_id);
create index tasks_project_idx on public.tasks(project_id);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null default '',
  when_at timestamptz not null default now(),
  tags text[] not null default '{}',
  task_ids uuid[] not null default '{}',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index journal_user_idx on public.journal_entries(user_id);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null default '',
  data jsonb not null default '{}',
  seeded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  task_id uuid references public.tasks(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id);
create index notifications_task_idx on public.notifications(task_id);

do $$ declare t text; begin
  foreach t in array array['projects','tasks','journal_entries','user_settings'] loop
    execute format('create trigger %I_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
  foreach t in array array['projects','tasks','journal_entries','user_settings','notifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.projects, public.tasks, public.journal_entries, public.user_settings, public.notifications;
