-- Articles Ethan shares with the AI coach (Ethan, 21 Nov 2026; lib/coach/articles.ts). The site
-- reads the article (or Ethan pastes its text when it can't), and the coach uses the paragraphs
-- about each player in its notes while the article is on.
create table if not exists public.coach_articles (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  title text not null default '',
  source text not null default '',          -- the site, e.g. nzherald.co.nz
  text text not null,                       -- the article's text
  how text not null default 'read' check (how in ('read', 'pasted')),
  player_ids text[] not null default '{}',  -- who it's about
  team_codes text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coach_articles enable row level security;
revoke all on public.coach_articles from anon, authenticated;
