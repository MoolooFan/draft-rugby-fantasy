-- Switch logins to Supabase Auth (email + password).
--
-- public.users stays as each player's profile (username, names, timezone).
-- Every profile is now tied to a Supabase Auth account via auth_user_id.
-- Old username-only rows (auth_user_id is null) can no longer be signed in to.

alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete cascade,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists timezone text;

-- The two unique constraints on username_norm are duplicates; keep one.
alter table public.users drop constraint if exists users_username_norm_unique;

-- When someone signs up, create their profile row from the details they gave.
-- If the username is already taken, the unique constraint makes the sign-up fail.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := btrim(regexp_replace(coalesce(meta ->> 'username', ''), '\s+', ' ', 'g'));
begin
  if length(uname) < 2 then
    raise exception 'USERNAME_REQUIRED';
  end if;

  insert into public.users (auth_user_id, username, username_norm, first_name, last_name, timezone)
  values (
    new.id,
    uname,
    lower(uname),
    nullif(btrim(meta ->> 'first_name'), ''),
    nullif(btrim(meta ->> 'last_name'), ''),
    coalesce(nullif(btrim(meta ->> 'timezone'), ''), 'Australia/Perth')
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
