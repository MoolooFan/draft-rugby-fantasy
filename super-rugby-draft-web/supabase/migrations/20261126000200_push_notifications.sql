-- Phone push notifications (plan item D1; Ethan, 26 Nov 2026). Read and written by the server only
-- (service role), like the other tables.

-- Each phone / browser someone has turned notifications on for. user_id = users.username_norm
-- (the same as teams.user_id). A subscription the push service says is gone is deleted.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

-- Notifications already sent, so the 5-minute job never sends one twice (lineup reminders,
-- draft starting). Old rows can be cleared any time.
create table if not exists public.push_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.push_sent enable row level security;

-- The site's push keys (VAPID), made by the server the first time they're needed, so nothing has
-- to be set up in Vercel. The private key never leaves the server.
create table if not exists public.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;
