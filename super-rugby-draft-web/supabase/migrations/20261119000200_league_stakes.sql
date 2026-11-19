-- League rewards / punishments (Ethan, 19 Nov 2026): optional text the commissioner writes in
-- League Settings. Everyone else must tap "I agree" (a pop-up) so nobody can say they didn't
-- know. Any change bumps stakes_version and everyone agrees again.
alter table public.leagues add column if not exists stakes_rewards text;
alter table public.leagues add column if not exists stakes_punishments text;
alter table public.leagues add column if not exists stakes_version int not null default 0;
alter table public.teams add column if not exists stakes_agreed_version int not null default 0;
alter table public.teams add column if not exists stakes_agreed_at timestamptz;
