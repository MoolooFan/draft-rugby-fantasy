-- Ethan, 23 Nov 2026:
-- 1. League Settings: flip the waiver order in the finals (on by default): from the first finals
--    week the waiver order is the final regular-season ladder (1st seed picks first).
-- 2. League Settings: eliminated teams can't trade (off by default). Waivers / free agents still ok.
-- 3. The commissioner can reverse a trade, waiver claim or free agent move after it's gone through.
alter table public.leagues add column if not exists playoff_waiver_flip boolean not null default true;
alter table public.leagues add column if not exists block_eliminated_trades boolean not null default false;

-- when a trade went through (updated_at changes when it's reversed), and who reversed it / when
alter table public.trade_offers add column if not exists accepted_at timestamptz;
alter table public.trade_offers add column if not exists reversed_at timestamptz;
alter table public.trade_offers add column if not exists reversed_by text;
update public.trade_offers set accepted_at = updated_at where status = 'accepted' and accepted_at is null;

-- status 'REVERSED' plus when / by whom
alter table public.free_agent_transfers add column if not exists reversed_at_ms bigint;
alter table public.free_agent_transfers add column if not exists reversed_by text;
alter table public.waiver_claims add column if not exists reversed_at_ms bigint;
alter table public.waiver_claims add column if not exists reversed_by text;
