-- Lock the database down.
--
-- Every read and write the site makes goes through its own server routes, which use
-- the service-role (admin) key and check who the player is first. Browsers therefore
-- need NO direct access to any table, so we remove it all:
--   * the "temp public read/write" rules that let anyone change leagues/rosters/trades
--   * rules based on current_username(), which trusted a header any browser can fake
--   * blanket access for the public (anon) and signed-in (authenticated) browser roles
-- If browser features ever need direct access (e.g. live updates), add narrow rules
-- for exactly that, based on auth.uid().

-- 1. Drop every existing rule on public tables.
do $$
declare
  p record;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Switch protection on for every public table (no rules = browsers see nothing).
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 3. Remove browser roles' access to tables, sequences and functions.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- ...and stop new tables/functions getting that access automatically.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, public;

-- 4. Remove the fake-able "who are you" helpers (only the old rules used them).
drop function if exists public.user_league_ids();
drop function if exists public.current_username();

-- 5. Nothing should stream table changes to browsers any more.
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', t.tablename);
  end loop;
end $$;
