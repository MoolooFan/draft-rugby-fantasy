-- Draft grades (Ethan, 25 Nov 2026; lib/draft/grades.ts): when a league's draft finishes, every
-- team gets a grade (A+ to F, curved within the league; below C- only for a deliberately poor
-- draft) from expected points, positional balance and boom / bust risk. Fixed once written.
-- The bullet points start as plain ones from the facts; the AI coach rewrites them (within a
-- few minutes) when it's switched on.
create table if not exists public.draft_grades (
  league_id text not null,
  team_id text not null,
  grade text not null,
  score double precision not null,
  rank integer not null,              -- 1 = best in the league
  facts jsonb not null default '{}'::jsonb,
  bullets jsonb not null default '[]'::jsonb,
  written_by text not null default 'rules', -- 'rules' or 'coach'
  coach_tried_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (league_id, team_id)
);

alter table public.draft_grades enable row level security;
revoke all on public.draft_grades from anon, authenticated;
