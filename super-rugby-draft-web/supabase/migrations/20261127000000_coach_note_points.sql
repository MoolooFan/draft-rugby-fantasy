-- AI coach notes show the player's projected points for that week at the time the note was
-- written, and after a game what he scored (Ethan, 27 Nov 2026; lib/coach/facts.ts notePoints).
-- Empty for season outlooks and for notes written before this.
alter table public.coach_notes add column if not exists projected numeric;
alter table public.coach_notes add column if not exists scored numeric;
