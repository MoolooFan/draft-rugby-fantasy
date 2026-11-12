-- Weekly power rankings (lib/league/powerRankings.ts): each league's ranking as of each
-- finalised round (0 = before round 1), saved the first time it's worked out, so the League
-- page can show who moved up or down. Server only.
create table if not exists public.power_rankings (
  league_id text not null references public.leagues (id) on delete cascade,
  week integer not null,
  team_id text not null references public.teams (id) on delete cascade,
  rank integer not null,
  score numeric not null,
  created_at timestamptz not null default now(),
  primary key (league_id, week, team_id)
);
alter table public.power_rankings enable row level security;
