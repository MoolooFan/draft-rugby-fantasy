-- Questionable (QUES) status: the real round of the injury list (or Ethan's edit) that set a
-- player's current card status, so his return round can be worked out from "Knee - 2 weeks".
alter table public.players add column if not exists status_round integer;
