-- Item 7 tidy-up: remove things nothing uses any more.
-- trades: an early version of trade offers (the site uses trade_offers).
-- league_members: never read; membership is the teams table.
-- leagues.draft_order: old copy of the draft order (the draft uses draft_state.draft_order_team_ids).
drop table if exists public.trades;
drop table if exists public.league_members;
alter table public.leagues drop column if exists draft_order;
