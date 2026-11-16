-- Bonus points per league (Ethan, 16 Nov 2026; lib/league/bonus.ts): the winning and losing
-- bonus each on/off with its own margin, set by the commissioner before the draft:
--   { "win": { "on": true, "margin": 140 }, "lose": { "on": true, "margin": 40 } }
-- Empty = the old on/off switch (leagues.bonus_points) with the usual margins.
alter table public.leagues add column if not exists bonus_rules jsonb;
