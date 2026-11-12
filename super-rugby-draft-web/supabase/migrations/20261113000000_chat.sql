-- League chat and direct messages (Ethan, 13 Nov 2026). Server only (the site's server checks
-- who can read and write each conversation).
--   channel 'league'              = the league chat (everyone, plus automated posts)
--   channel 'dm:<teamA>:<teamB>'   = a one-to-one chat (team ids in alphabetical order)
-- sender_team_id null = an automated post (weekly recap, trades, waiver / free agent reports,
-- shield). dedupe_key stops an automated post going out twice.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  league_id text not null references public.leagues (id) on delete cascade,
  channel text not null,
  sender_team_id text references public.teams (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'image', 'trade', 'system', 'taunt')),
  body text,
  image_url text,
  meta jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (league_id, dedupe_key)
);
create index if not exists chat_messages_channel_idx on public.chat_messages (league_id, channel, created_at desc);
alter table public.chat_messages enable row level security;

-- When each team last read each conversation (for unread counts).
create table if not exists public.chat_reads (
  team_id text not null references public.teams (id) on delete cascade,
  channel text not null,
  last_read_at timestamptz not null default now(),
  primary key (team_id, channel)
);
alter table public.chat_reads enable row level security;

-- Pictures sent in chat (public bucket; uploads go through the site's server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Taunts (like ESPN fantasy): ready-made lines Ethan can edit on the admin page.
--   kind 'try'  : your player scored a try       ({player}, {opponent})
--   kind 'card' : their player got a yellow / red ({player}, {card}, {opponent})
create table if not exists public.taunt_lines (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('try', 'card')),
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.taunt_lines enable row level security;
insert into public.taunt_lines (kind, text) values
  ('try', '{player} just scored. Hope you''re watching, {opponent}.'),
  ('try', 'Over the line goes {player}. Try defending that.'),
  ('try', '{player} with the try. That''s 15 more for me.'),
  ('try', 'Another one for {player}. Starting to feel sorry for you.'),
  ('card', '{player} in the bin? Ouch. Discipline issues at your club, {opponent}?'),
  ('card', 'A {card} card for {player}. Couldn''t have planned it better myself.'),
  ('card', '{player} costing you points from the sideline. Love to see it.');

-- Muting chat: the notification settings (users.notification_settings) gain chat_dm,
-- chat_league, chat_auto and taunts (lib/notifications/types.ts); nothing to change here.
