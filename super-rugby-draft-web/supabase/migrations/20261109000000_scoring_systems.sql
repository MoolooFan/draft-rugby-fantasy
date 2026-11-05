-- Item 12: league scoring options (Standard / Alternate / Custom).
-- The Standard and Alternate point values live here so Ethan can edit them on the admin page.
create table public.scoring_systems (
  id text primary key check (id in ('standard', 'alternate')),
  rules jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.scoring_systems (id, rules, updated_by) values
  ('standard', '{"minutesUpTo60":1,"minutes61Plus":2,"minutesFullAt":61,"metresPer":10,"scrumPositions":["PR","HO"],"perEvent":{"tries":15,"tryAssists":9,"lineBreaks":7,"lineBreakAssists":5,"defendersBeaten":2,"metresGained":1,"offloads":2,"tackles":1,"tacklesMissed":-1,"turnoversForced":4,"interceptions":5,"fiftyTwentyTwos":10,"penaltiesConceded":-1,"errors":-1,"lineoutsWon":1,"lineoutSteals":5,"lineoutErrors":-2,"scrumsWon":3,"conversions":2,"conversionsMissed":-1,"penaltyGoals":3,"penaltyGoalsMissed":-1,"dropGoals":3,"dropGoalsMissed":-1,"yellowCards":-5,"redCards":-10}}'::jsonb, 'ethan'),
  ('alternate', '{"minutesUpTo60":1,"minutes61Plus":2,"minutesFullAt":60,"metresPer":5,"scrumPositions":["PR"],"perEvent":{"tries":7,"tryAssists":4,"lineBreaks":3.5,"lineBreakAssists":2.5,"defendersBeaten":1.2,"metresGained":0.2,"offloads":0.8,"tackles":0.5,"tacklesMissed":-1,"turnoversForced":3,"interceptions":3,"fiftyTwentyTwos":4,"penaltiesConceded":-2.5,"errors":-1,"lineoutsWon":0.4,"lineoutSteals":4,"lineoutErrors":-1.5,"scrumsWon":2.5,"conversions":1.5,"conversionsMissed":-1,"penaltyGoals":2,"penaltyGoalsMissed":-1,"dropGoals":2,"dropGoalsMissed":-1,"yellowCards":-6,"redCards":-12}}'::jsonb, 'ethan');
alter table public.scoring_systems enable row level security;
revoke all on public.scoring_systems from anon, authenticated;

-- A league's scoring is frozen when its draft starts, so later edits to Standard/Alternate
-- don't change a season that is already running.
alter table public.leagues add column if not exists scoring_rules_locked jsonb;

-- Alternate scoring gives scores with one decimal place.
alter table public.team_week_results alter column score type numeric(8,1);
alter table public.league_matchups alter column home_score type numeric(8,1), alter column away_score type numeric(8,1);

