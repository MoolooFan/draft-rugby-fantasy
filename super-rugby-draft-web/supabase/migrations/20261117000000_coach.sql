-- AI assistant coach (Ethan, 17 Nov 2026; lib/coach). Short fantasy news notes per player,
-- written by Claude from the site's data plus Ethan's notes:
--   outlook    season outlook (start of season, from the admin page)
--   post_game  after each game's stats are final: how he went, and next week
--   team_list  when the team / injury lists come out (players with a status)
--   status     when Ethan changes a player's status by hand
--   news       when Ethan adds news about a player and asks for an update
-- Server only (the site's server reads and writes these).

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  player_id text not null,
  kind text not null check (kind in ('outlook', 'post_game', 'team_list', 'status', 'news')),
  -- the fantasy week it's about (null for season outlooks)
  week integer,
  headline text not null,
  body text not null,
  next_week text not null default '',
  verdict text,
  trend text,
  factors jsonb not null default '[]'::jsonb,
  -- one note per moment (e.g. post_game:2027:5:<fixture>:<player>)
  source_key text not null unique,
  model text,
  -- Ethan can hide or edit a note
  hidden boolean not null default false,
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coach_notes_player_idx on public.coach_notes (player_id, created_at desc);
create index if not exists coach_notes_recent_idx on public.coach_notes (created_at desc);
alter table public.coach_notes enable row level security;

-- Batches of notes sent to Claude (written within about an hour, at half price), and one-off
-- jobs already done (so nothing is written twice).
create table if not exists public.coach_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  kind text not null,
  season integer not null,
  week integer,
  batch_id text,
  status text not null default 'submitted' check (status in ('submitted', 'done', 'failed', 'skipped')),
  requests integer not null default 0,
  -- what each request in the batch is for: { "<custom id>": { player_id, source_key, week, kind } }
  items jsonb not null default '{}'::jsonb,
  written integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.coach_jobs enable row level security;

-- Ethan's updates for the coach: about a player, a team, or everyone (e.g. "Jacomb is the
-- Highlanders' starting 10 and goal kicker"). Used in every note while active.
create table if not exists public.coach_context (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('player', 'team', 'general')),
  player_id text,
  team_code text,
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.coach_context enable row level security;

-- Player details the stats don't have (by player id, so they carry over each season).
create table if not exists public.player_profiles (
  player_id text primary key,
  birth_date date,
  -- e.g. "All Blacks", "Wallabies", "Fiji"
  international text,
  -- e.g. "All Blacks rest policy: 2 rest weeks before round 12"
  rest_notes text,
  -- e.g. "Hamstring problems 2025 and 2026"
  injury_notes text,
  updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;

-- On / off switch and model (one row).
create table if not exists public.coach_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  model text not null default 'claude-sonnet-5-5',
  updated_at timestamptz not null default now()
);
alter table public.coach_settings enable row level security;
insert into public.coach_settings (id) values (1) on conflict (id) do nothing;
