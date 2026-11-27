-- Live match scores during games (plan item D2; Ethan, 27 Nov 2026). The scores come from the
-- official fantasy game every few minutes while a game is on (lib/results/matchScores.ts);
-- final = false while it's being played, true once the official game marks it completed.
-- Only final scores count for team win / draw points (lib/results/matchResults.ts).
alter table public.match_results add column if not exists final boolean not null default true;
