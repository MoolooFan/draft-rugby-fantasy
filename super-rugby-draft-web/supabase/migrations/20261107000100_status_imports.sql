-- Item 13: log of the official team-list / injury articles the site has read, so the admin
-- page can show what was imported, when, and from where.
create table public.status_imports (
  id uuid primary key default gen_random_uuid(),
  season integer not null,
  real_round integer not null,
  kind text not null check (kind in ('team-list', 'injury-list')),
  url text not null,
  teams text[] not null default '{}',
  matched integer not null default 0,
  flagged integer not null default 0,
  imported_at timestamptz not null default now()
);
create index status_imports_round_idx on public.status_imports (season, real_round, kind, imported_at desc);

alter table public.status_imports enable row level security;
revoke all on public.status_imports from anon, authenticated;
