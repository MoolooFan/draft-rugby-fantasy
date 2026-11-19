-- Nightly backups (Ethan, 19 Nov 2026): a copy of every table in the public schema, saved each
-- night as one gzipped JSON file in the private "backups" bucket (lib/backup/run.ts, run from the
-- 5-minute scheduler at about 3am NZ time; the last 30 kept). Only the server (service role) can
-- read the bucket or call these functions; the Admin page lists the files and downloads them.
insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 52428800)
on conflict (id) do nothing;

-- the tables to copy (every table in public, so new ones are included automatically)
create or replace function public.backup_table_names()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select table_name::text
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  order by table_name;
$$;

-- one table's rows as JSON, a page at a time (ordered by the row's physical position so pages
-- don't overlap)
create or replace function public.backup_table_rows(t text, page_offset integer, page_size integer)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result json;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name = t
  ) then
    raise exception 'Unknown table %', t;
  end if;
  execute format(
    'select coalesce(json_agg(x), ''[]''::json) from (select * from public.%I order by ctid offset %s limit %s) x',
    t, greatest(page_offset, 0), least(greatest(page_size, 1), 5000)
  ) into result;
  return result;
end;
$$;

revoke all on function public.backup_table_names() from public, anon, authenticated;
revoke all on function public.backup_table_rows(text, integer, integer) from public, anon, authenticated;
grant execute on function public.backup_table_names() to service_role;
grant execute on function public.backup_table_rows(text, integer, integer) to service_role;
