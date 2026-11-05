-- Item 14: the draft runs on the server (it used to run in each person's browser).
alter table public.draft_state
  add column if not exists pick_deadline_at timestamptz,          -- when the team on the clock is auto-picked for
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists missed_in_row jsonb not null default '{}'::jsonb, -- team id -> picks missed in a row
  add column if not exists order_edited boolean not null default false;      -- commissioner changed the order

alter table public.draft_picks
  add column if not exists auto boolean not null default false;   -- made by the server when time ran out

-- Each team's draft watchlist, in the order they want them (auto-pick takes from here first).
create table if not exists public.draft_queue (
  league_id text not null references public.leagues (id) on delete cascade,
  team_id text not null references public.teams (id) on delete cascade,
  player_id text not null,
  position integer not null,
  primary key (league_id, team_id, player_id)
);

alter table public.draft_queue enable row level security;
revoke all on public.draft_queue from anon, authenticated;
