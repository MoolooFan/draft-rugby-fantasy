-- Item 5: saved weekly results, the league schedule, season history, fixture difficulty,
-- and a site-admin flag. All of these are only read/written by the site's server
-- (service role); browsers have no direct access (see the lock-down migration).

-- ---------------------------------------------------------------------------
-- Site admin (Ethan): can use the admin page (difficulty ratings, players, fixtures, ...)
alter table public.users
  add column if not exists is_site_admin boolean not null default false;

-- ---------------------------------------------------------------------------
-- League settings
alter table public.leagues
  add column if not exists season integer not null default 2026,
  add column if not exists bonus_points boolean not null default true,
  add column if not exists scoring_system text not null default 'standard',
  add column if not exists scoring_custom jsonb,
  -- first fantasy week the league plays (leagues can start mid-season)
  add column if not exists first_week integer,
  -- set when the draft starts: scoring, bonus points and finals can't change after this
  add column if not exists settings_locked_at timestamptz,
  add column if not exists schedule_built_at timestamptz,
  -- the built schedule's layout, incl. weeks whose matchups are picked from the ladder
  add column if not exists schedule_plan jsonb;

alter table public.leagues alter column season set default 2027;

alter table public.leagues
  add constraint leagues_scoring_system_check check (scoring_system in ('standard', 'alternate', 'custom')),
  add constraint leagues_playoff_format_check check (playoff_format in ('none', 'final2', 'final3', 'final4', 'final6'));

-- ---------------------------------------------------------------------------
-- Every matchup in a league's season: regular-season games, byes, finals, wooden spoon
-- playoff and fill-in games. Replaces the old, unused matchup_results table.
create table public.league_matchups (
  id uuid primary key default gen_random_uuid(),
  league_id text not null references public.leagues (id) on delete cascade,
  kind text not null check (kind in ('regular', 'finals', 'consolation', 'fill-in')),
  -- playoffs only: the game's key in the layout (e.g. 'SF1', 'GF', 'WS') and its name
  playoff_key text,
  label text,
  -- fantasy weeks the game is played over; more than one = scores added together
  weeks integer[] not null check (cardinality(weeks) >= 1),
  home_team_id text references public.teams (id) on delete set null,
  -- null on a regular-season row = bye; null on a playoff row = not known yet
  away_team_id text references public.teams (id) on delete set null,
  -- playoffs: where each team comes from, e.g. {"seed":1} or {"winnerOf":"SF1"}
  home_source jsonb,
  away_source jsonb,
  decides text check (decides in ('champion', 'spoon')),
  status text not null default 'scheduled' check (status in ('scheduled', 'final')),
  home_score integer,
  away_score integer,
  home_tries integer,
  away_tries integer,
  winner_team_id text references public.teams (id) on delete set null,
  home_bonus integer not null default 0,
  away_bonus integer not null default 0,
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  unique (league_id, playoff_key)
);
create index league_matchups_league_idx on public.league_matchups (league_id);

-- Each team's finalised result for a week. Keeps the lineup the team picked AND the
-- final lineup after auto-subs, so nothing is overwritten.
create table public.team_week_results (
  league_id text not null references public.leagues (id) on delete cascade,
  week integer not null,
  team_id text not null references public.teams (id) on delete cascade,
  picked_lineup jsonb,
  picked_captain_id text,
  picked_vice_id text,
  final_lineup jsonb,
  -- who actually got the x2 (captain, or vice-captain if the captain didn't play)
  captain_used_id text,
  -- player id -> points that counted, before the captain's x2
  player_points jsonb not null default '{}'::jsonb,
  score integer not null,
  tries integer not null default 0,
  finalised_at timestamptz not null default now(),
  primary key (league_id, week, team_id)
);

-- One row per league per finalised week, so a week can never be finalised twice.
create table public.league_week_finalisations (
  league_id text not null references public.leagues (id) on delete cascade,
  week integer not null,
  finalised_at timestamptz not null default now(),
  primary key (league_id, week)
);

-- Season history: champions, runners-up, wooden spoons... Stored by person so it can be
-- linked to an account later (people make fresh accounts each season).
create table public.honours (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  league_id text references public.leagues (id) on delete set null,
  league_name text not null,
  person_name text not null,
  user_id uuid references public.users (id) on delete set null,
  place text not null check (place in ('champion', 'runner_up', 'third', 'semi_finalist', 'wooden_spoon')),
  created_at timestamptz not null default now()
);

-- Fixture difficulty (1 = easy ... 5 = hard) of playing each Super Rugby team.
-- home_rating: playing them at THEIR ground; away_rating: them visiting YOUR ground.
-- The *_strength numbers are what the in-season update nudges; pinned = admin-set, leave alone.
create table public.team_difficulty (
  season integer not null,
  team text not null,
  home_rating smallint not null check (home_rating between 1 and 5),
  away_rating smallint not null check (away_rating between 1 and 5),
  home_strength numeric,
  away_strength numeric,
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (season, team)
);

-- 2027 starting ratings: worked out from 2026 results, then adjusted by Ethan (6 Nov 2026).
insert into public.team_difficulty (season, team, home_rating, away_rating, updated_by) values
  (2027, 'Hurricanes', 5, 4, 'ethan'),
  (2027, 'Chiefs', 4, 4, 'ethan'),
  (2027, 'Crusaders', 4, 4, 'ethan'),
  (2027, 'Blues', 4, 3, 'ethan'),
  (2027, 'Brumbies', 3, 3, 'ethan'),
  (2027, 'Reds', 3, 2, 'ethan'),
  (2027, 'Force', 3, 2, 'ethan'),
  (2027, 'Waratahs', 3, 2, 'ethan'),
  (2027, 'Highlanders', 3, 2, 'ethan'),
  (2027, 'Drua', 3, 1, 'ethan');

drop table if exists public.matchup_results;

-- ---------------------------------------------------------------------------
-- Server only: protect the new tables like every other table.
alter table public.league_matchups enable row level security;
alter table public.team_week_results enable row level security;
alter table public.league_week_finalisations enable row level security;
alter table public.honours enable row level security;
alter table public.team_difficulty enable row level security;

revoke all on public.league_matchups, public.team_week_results, public.league_week_finalisations,
  public.honours, public.team_difficulty from anon, authenticated;
