-- B3 (IR): a player dropped to bring a player back from IR is listed in the Transactions tab as
-- "dropped by <team>", with no player added. Those rows have no add_player_id.
alter table public.free_agent_transfers alter column add_player_id drop not null;
