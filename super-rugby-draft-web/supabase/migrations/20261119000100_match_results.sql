-- Real Super Rugby final scores (Ethan, 19 Nov 2026), for leagues that give points for a team
-- win / draw (custom scoring). To be filled alongside the player stats (set up with Ethan);
-- until then the season's fixtures file's scores are used (lib/results/matchResults.ts).
create table if not exists public.match_results (
  season int not null,
  real_round int not null,
  home_team text not null,   -- team code, e.g. CRU
  away_team text not null,
  home_score int not null,
  away_score int not null,
  updated_at timestamptz not null default now(),
  primary key (season, real_round, home_team)
);
alter table public.match_results enable row level security;
-- read by the server only (service role), like player_round_stats
