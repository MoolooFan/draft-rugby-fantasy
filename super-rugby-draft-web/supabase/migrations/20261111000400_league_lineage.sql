-- E8: a league's history across seasons. Restarting a league for a new season makes a new
-- league with the same lineage_id; championship stars count titles within a lineage.
-- Leagues and honours that existed before this have no lineage (a league is its own lineage).
alter table public.leagues add column if not exists lineage_id text;
alter table public.honours add column if not exists lineage_id text;
create index if not exists leagues_lineage_idx on public.leagues (lineage_id);
create index if not exists honours_lineage_idx on public.honours (lineage_id);
