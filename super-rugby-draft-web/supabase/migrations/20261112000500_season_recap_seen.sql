-- Season recap (Ethan, 12 Nov 2026): pops up once when a league's season is over (per team, so
-- per league season); it can be viewed again any time from Team Details.
alter table public.teams add column if not exists season_recap_seen boolean not null default false;
