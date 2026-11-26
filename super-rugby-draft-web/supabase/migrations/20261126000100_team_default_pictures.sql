-- Every team has a picture (Ethan, 26 Nov 2026: teams can't remove theirs any more): any team
-- with none gets a random default icon, like a new team does (lib/teams/icons.ts randomTeamIcon:
-- boot / posts / ball / jersey 1-23 in one of the picker's colours, not white).
with pick as (
  select id,
    (array['boot', 'posts', 'ball', 'jersey'])[1 + floor(random() * 4)::int] as kind,
    (array['ef4444', 'f97316', 'facc15', '22c55e', '14b8a6', '38bdf8', '3b82f6', 'a855f7', 'ec4899', '8b5a2b', '111827'])[1 + floor(random() * 11)::int] as colour,
    1 + floor(random() * 23)::int as num
  from public.teams
  where picture_url is null or picture_url = ''
)
update public.teams t
set picture_url = case when p.kind = 'jersey' then format('icon:jersey:%s:%s', p.colour, p.num) else format('icon:%s:%s', p.kind, p.colour) end
from pick p
where t.id = p.id;
