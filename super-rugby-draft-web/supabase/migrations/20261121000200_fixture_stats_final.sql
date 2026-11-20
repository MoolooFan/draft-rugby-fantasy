-- Each Super Rugby game's last stats run (Ethan, 20 Nov 2026; lib/stats/gameRuns.ts). A game's
-- player stats are pulled every few minutes while it's on, then hourly, then once more about
-- 13.5 hours after kickoff; that last run is recorded here, and after it the game's points
-- don't change. The dashboard's games box shows a game as "Finalised" once it's here.
create table if not exists public.fixture_stats_final (
  season integer not null,
  fixture_id text not null,
  real_round integer not null,
  finalised_at timestamptz not null default now(),
  primary key (season, fixture_id)
);

alter table public.fixture_stats_final enable row level security;
revoke all on public.fixture_stats_final from anon, authenticated;
