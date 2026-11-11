-- E1 (Account page): which notifications each person wants, e.g. {"waivers": false}.
-- A type not listed is on (lib/notifications/types.ts).
alter table public.users add column if not exists notification_settings jsonb not null default '{}'::jsonb;
