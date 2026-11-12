-- F2 (expected points): Ethan's start-of-season notes on a player, e.g. one who moved team.
--   expected_role: starter / bench / squad (not expected to be named) - counts like one extra
--                  team list from before round 1, so real team lists take over within a few rounds
--   kick_order:    1 = first-choice goal kicker, 2 = second choice - counts like kicks taken
--                  before round 1, so real kicking takes over within a few rounds
alter table public.players add column if not exists expected_role text
  check (expected_role in ('starter', 'bench', 'squad'));
alter table public.players add column if not exists kick_order smallint
  check (kick_order in (1, 2));
