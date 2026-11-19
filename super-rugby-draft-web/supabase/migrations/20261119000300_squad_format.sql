-- Custom squads (Ethan, 19 Nov 2026): a league's starting slots, bench size and IR spots
-- (lib/league/squad.ts). null = Standard (15 starters + 5 bench + 1 IR). Locks when the draft starts.
alter table public.leagues add column if not exists squad_format jsonb;
