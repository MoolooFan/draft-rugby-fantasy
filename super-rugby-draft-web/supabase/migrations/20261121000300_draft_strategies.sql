-- Draft strategies (Ethan, 21 Nov 2026; lib/draft/strategy.ts): a position to aim for each round,
-- position targets, do-not-draft players and their own rankings. One per person as their
-- default (league_id = '', also used for mock drafts), plus one per league if they make one.
-- Auto-pick uses the league's one (or their default) after the draft watchlist.
create table if not exists public.draft_strategies (
  username text not null,            -- lower case, like teams.owner_username
  league_id text not null default '', -- '' = their default
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (username, league_id)
);

alter table public.draft_strategies enable row level security;
revoke all on public.draft_strategies from anon, authenticated;
