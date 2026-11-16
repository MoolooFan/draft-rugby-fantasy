-- Rewards for holding the Shield (Ethan, 16 Nov 2026; lib/league/shield.ts). The commissioner
-- picks them before the draft (locked once it starts):
--   { "firstWaiverPick": true, "defencePoints": 1, "winPoints": 1, "tieBreak": true }
alter table public.leagues add column if not exists shield_rewards jsonb not null default '{}'::jsonb;

-- Saved on each finished regular-season game when it's finalised (lib/league/shieldServer.ts
-- syncShieldRewards), so every ladder counts them:
--   home_shield_pts / away_shield_pts  bonus ladder points from the shield (defence / taking it)
--   shield_holder_after                who held it after this game (only with the tie-break reward)
alter table public.league_matchups add column if not exists home_shield_pts numeric not null default 0;
alter table public.league_matchups add column if not exists away_shield_pts numeric not null default 0;
alter table public.league_matchups add column if not exists shield_holder_after text;
