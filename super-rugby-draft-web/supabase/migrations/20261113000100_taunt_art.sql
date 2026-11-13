-- Try taunt pictures (Ethan, 13 Nov 2026; lib/chat/tauntArt.ts).
-- Generic pictures (player_id null) are drawn with key colours the site repaints: green = jersey,
-- magenta = the team's second colour, blue = skin. A player's own picture (top players) is
-- shown as it is. Kept by player id, so they carry over from season to season.
create table if not exists public.taunt_art (
  id uuid primary key default gen_random_uuid(),
  player_id text,
  url text not null,
  path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists taunt_art_player_idx on public.taunt_art (player_id);
alter table public.taunt_art enable row level security;

-- Each player's skin tone for the generic pictures (1 light, 2 medium, 3 brown, 4 dark;
-- none set = medium). By player id, so it carries over from season to season.
create table if not exists public.player_looks (
  player_id text primary key,
  skin_tone smallint check (skin_tone between 1 and 4),
  updated_at timestamptz not null default now()
);
alter table public.player_looks enable row level security;

-- Team colours for the taunt graphics (jersey + second colour), editable on the admin Taunts
-- tab. Teams not listed use the colours in lib/chat/tauntArt.ts.
create table if not exists public.team_colours (
  team_code text primary key,
  jersey text not null check (jersey ~* '^#[0-9a-f]{6}$'),
  trim_colour text not null check (trim_colour ~* '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now()
);
alter table public.team_colours enable row level security;

-- The pictures (public bucket; uploads go through the site's server, admin only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('taunt-art', 'taunt-art', true, 4194304, array['image/png', 'image/webp'])
on conflict (id) do nothing;
