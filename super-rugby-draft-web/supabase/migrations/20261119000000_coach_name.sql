-- Each user can name their AI assistant coach (Ethan, 19 Nov 2026). Empty = "AI Coach".
alter table public.users add column if not exists coach_name text;
alter table public.users drop constraint if exists users_coach_name_len;
alter table public.users add constraint users_coach_name_len check (coach_name is null or char_length(coach_name) between 1 and 24);
