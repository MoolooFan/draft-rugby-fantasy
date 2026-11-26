-- Past seasons' history (Ethan, 26 Nov 2026): everyone who played a season, not just the people
-- who placed, so Admin -> History can link them all to their accounts (Isaac and Josh were
-- missing). They're saved as honours rows with place 'played' (no honour; nothing counts it).
alter table public.honours drop constraint if exists honours_place_check;
alter table public.honours add constraint honours_place_check
  check (place in ('champion', 'runner_up', 'third', 'semi_finalist', 'wooden_spoon', 'played'));
