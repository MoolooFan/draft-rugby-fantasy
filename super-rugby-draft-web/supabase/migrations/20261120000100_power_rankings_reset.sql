-- Power rankings are now ordered by each team's title chance (lib/league/powerServer.ts, 19-20 Nov
-- 2026). Rankings saved with the old score don't compare with the new ones, so clear them; each
-- round's ranking is worked out again (as it stood at the time) the next time the page needs it.
delete from public.power_rankings;
