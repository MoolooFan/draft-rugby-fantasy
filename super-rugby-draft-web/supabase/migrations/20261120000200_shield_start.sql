-- How the Shield is first given out (Ethan, 20 Nov 2026; lib/league/shield.ts): {"method":
-- "top_score" | "random" | "chosen", "teamId": the team drawn / picked}. Empty = top score in the
-- first round (as before). Set by the commissioner until the league's first round kicks off; a
-- random draw happens once the draft finishes.
alter table public.leagues add column if not exists shield_start jsonb not null default '{}'::jsonb;
