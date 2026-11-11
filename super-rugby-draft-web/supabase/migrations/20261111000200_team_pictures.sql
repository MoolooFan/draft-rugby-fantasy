-- E5: team pictures (uploaded on Team Details, shown in a circle).
-- The file lives in Supabase Storage (public bucket "team-pictures"); teams.picture_url is its address.
-- Uploads go through the site's server (/api/teams/picture), never straight from a browser.
alter table public.teams add column if not exists picture_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-pictures', 'team-pictures', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
