-- The Shield: the holder gets a pop-up once they've secured it for the season (no home games
-- left to lose it). The season they last saw that pop-up for.
alter table public.teams add column if not exists shield_secured_seen integer;
