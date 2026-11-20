-- Who started and who was on the bench, kept for good (Ethan, 20 Nov 2026).
-- The "Starting - #12" / "Bench - #22" statuses (from the official team lists, the official
-- fantasy game's late changes, or Ethan's edits) are cleared once each game finishes, so the
-- XV / SUB badges go away. Just before that they're copied here, one row per player per real
-- round, so the player card can count starts and the projections / AI coach know each player's
-- past roles (lib/status/roles.ts).
create table if not exists public.player_round_roles (
  season integer not null,
  real_round integer not null,
  week integer not null,
  player_id text not null,
  role text not null check (role in ('starting', 'bench')),
  jersey integer,
  source text,
  saved_at timestamptz not null default now(),
  primary key (season, real_round, player_id)
);
create index if not exists player_round_roles_week_idx on public.player_round_roles (season, week);

alter table public.player_round_roles enable row level security;
revoke all on public.player_round_roles from anon, authenticated;

-- Late changes read from the official fantasy game (lib/status/fantasyFeed.ts) are their own source.
alter table public.player_week_status drop constraint if exists player_week_status_source_check;
alter table public.player_week_status add constraint player_week_status_source_check
  check (source in ('manual', 'team-list', 'injury-list', 'import', 'fantasy-feed'));

alter table public.status_imports drop constraint if exists status_imports_kind_check;
alter table public.status_imports add constraint status_imports_kind_check
  check (kind in ('team-list', 'injury-list', 'fantasy-feed'));
