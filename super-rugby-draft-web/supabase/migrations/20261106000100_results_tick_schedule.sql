-- Item 5: Supabase's scheduler calls the site's /api/cron/tick every 5 minutes.
-- (Replaces the GitHub Actions schedule, which ran up to an hour late and switched itself off.)
--
-- It needs two secrets in Supabase's Vault (Project Settings -> Vault), added by hand so they
-- never sit in this file:
--   site_url    = https://<the site's address>        (no slash at the end)
--   cron_secret = the same CRON_SECRET the site has in Vercel
-- Until both exist, the job does nothing.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_results_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  site text;
  secret text;
begin
  select decrypted_secret into site from vault.decrypted_secrets where name = 'site_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if site is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := site || '/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.call_results_tick() from public, anon, authenticated;

select cron.schedule('results-tick', '*/5 * * * *', 'select public.call_results_tick()');
