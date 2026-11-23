alter table public.projects add column if not exists archived boolean not null default false;
alter table public.tasks add column if not exists paused_at timestamptz;
