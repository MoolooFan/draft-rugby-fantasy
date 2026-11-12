-- The Shield switched off / on part-way through a season (Ethan, 12 Nov 2026): each change and
-- the fantasy week it applies from, e.g. [{"week":6,"on":false},{"week":9,"on":true}]. While it's
-- off, the holder keeps it whatever the results.
alter table public.leagues add column if not exists shield_toggles jsonb not null default '[]'::jsonb;
