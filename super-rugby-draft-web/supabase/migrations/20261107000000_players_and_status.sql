-- Item 13: players live in the database (they were a Google Sheet + a file in the code), so
-- Ethan can edit them on the admin page. Plus weekly player status (Starting / Benched /
-- injury), which will be filled from the official Wednesday team-list and injury articles,
-- with anything that doesn't match flagged for Ethan to check.

create table public.players (
  season integer not null,
  -- the site's player id, e.g. 'D.McKenzie' (used by rosters, lineups and stats)
  id text not null,
  first_name text not null,
  last_name text not null,
  team_code text not null,            -- e.g. 'CHI'
  pos text not null,                  -- main position: PR HO LK LF HB FH CE OB
  pos2 text,                          -- second position, if any
  draft_rank integer,
  external_id integer,                -- playfantasyrugby.com player id (stats and photos)
  status text,                        -- current status shown on the player card, e.g. 'Knee - TBC'
  active boolean not null default true, -- false = not in this season's pool (e.g. left the competition)
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (season, id),
  constraint players_pos_check check (pos in ('PR', 'HO', 'LK', 'LF', 'HB', 'FH', 'CE', 'OB')),
  constraint players_pos2_check check (pos2 is null or pos2 in ('PR', 'HO', 'LK', 'LF', 'HB', 'FH', 'CE', 'OB'))
);
create index players_external_idx on public.players (season, external_id);

-- A player's status for one fantasy week: 'Starting', 'Benched', 'Out', an injury such as
-- 'Knee - TBC', or no row = not named.
create table public.player_week_status (
  season integer not null,
  week integer not null,
  player_id text not null,
  status text not null,
  source text not null default 'manual' check (source in ('manual', 'team-list', 'injury-list', 'import')),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (season, week, player_id)
);

-- Things the automatic team-list / injury-list reader couldn't match (e.g. a misspelt name),
-- shown on the admin page for Ethan to fix.
create table public.status_import_flags (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  week integer not null,
  source text not null,
  team_code text,
  raw_text text not null,
  problem text not null,
  suggestion_player_id text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.player_week_status enable row level security;
alter table public.status_import_flags enable row level security;
revoke all on public.players, public.player_week_status, public.status_import_flags from anon, authenticated;
