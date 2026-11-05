-- 2027: players can have up to three positions.
alter table public.players add column pos3 text;
alter table public.players add constraint players_pos3_check check (pos3 is null or pos3 in ('PR', 'HO', 'LK', 'LF', 'HB', 'FH', 'CE', 'OB'));
