-- E7 (weekly recap): the last finalised week whose recap this team's owner has seen, so the
-- recap pops up once per league per round.
alter table public.teams add column if not exists recap_seen_week integer;
