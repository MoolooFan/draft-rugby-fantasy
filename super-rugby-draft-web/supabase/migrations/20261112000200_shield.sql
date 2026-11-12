-- The Shield (Ethan, Nov 2026): a challenge trophy inside a league (lib/league/shield.ts).
-- The commissioner can switch it off (that season doesn't count; the holder keeps it) or rename
-- it (always ends in "Shield"). Holders and defences are worked out from the results.
alter table public.leagues add column if not exists shield_enabled boolean not null default true;
alter table public.leagues add column if not exists shield_name text not null default 'The Shield';
