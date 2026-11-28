-- The draft lottery (Ethan, 28 Nov 2026). The commissioner sets a time; at that time the server
-- picks a random seed, runs the race (lib/draft/lottery/sim.ts) and saves the draft order. Every
-- run is kept, so the league can see any reruns. Read and written by the server only.
create table if not exists public.draft_lotteries (
  id uuid primary key default gen_random_uuid(),
  league_id text not null references public.leagues (id) on delete cascade,
  run_number integer not null,               -- 1, then 2, 3... for reruns
  scheduled_at timestamptz not null,         -- when it runs (everyone watching sees it then)
  created_by text not null,                  -- the commissioner's username
  created_at timestamptz not null default now(),
  ran_at timestamptz,                        -- when the race started (null: still waiting)
  seed bigint,                               -- picked by the server at ran_at, never before
  team_ids text[],                           -- the runners, lane by lane
  result_team_ids text[]                     -- the order it set, first pick first
);
-- one run waiting at a time, and each run number once
create unique index if not exists draft_lotteries_waiting on public.draft_lotteries (league_id) where ran_at is null;
create unique index if not exists draft_lotteries_run on public.draft_lotteries (league_id, run_number);
alter table public.draft_lotteries enable row level security;

-- Who set the draft order last: 'lottery', 'commissioner' (by hand), or null (shuffled as teams
-- joined). Shows "changed by the commissioner after the lottery".
alter table public.draft_state add column if not exists order_source text;
