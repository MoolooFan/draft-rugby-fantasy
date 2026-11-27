# Change log

Every change made for the 2027 rebuild, newest first. Each one has a code (its commit) you can use to undo it later. Branch merges and updates to this log itself aren't listed.

## How to undo a change

The easy way: ask Claude, e.g. *"undo 365d736"*. Claude will check whether later changes depend on it first.

To do it yourself:

1. In VS Code, open the terminal: **Terminal → New Terminal** (or Ctrl + `).
2. Make sure you're on the working branch: type `git checkout rebuild-2027` and press Enter.
3. Type `git revert --no-edit 365d736` (with the code of the change you want gone) and press Enter. This adds a new change that reverses the old one, so nothing is lost and you can undo the undo the same way.
4. Type `git push` and press Enter. Then bring it into the demo site as usual (`git checkout demo-2026`, `git merge rebuild-2027`, `git push`, `git checkout rebuild-2027`).

If step 3 says **CONFLICT**, a later change touched the same lines. Type `git revert --abort` to cancel and ask Claude instead.

**Database = Yes** means that change also changed the database (new tables or columns). Undoing the code doesn't undo the database part. That's usually harmless (an unused table does nothing), but ask Claude if you want it removed too.

## Changes

### 27 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `135c618` | **AI coach**: the season outlook, the next-week outlook and each update are separate boxes; projected points only show on the next-week box. Attack / defence ranks are gone: the coach now uses the fantasy points each team gives up per position (per 80 minutes; position from the jersey number on the team list when known). **Live match scores** (plan D2): scores come from the official fantasy game every 5 minutes while a game is on, shown with a red LIVE tag, pages refresh every minute; only final scores count for win / draw points. The site no longer adds up team scores from player stats where the official score exists (coach after-game notes, team strength in projections) | Yes (match_results: final) |
| `7abc1c3` | **AI coach**: never says "the commissioner" or where news came from; notes are shorter (2-3 sentences); always says which season a stat is from (e.g. "in 2026"). Player card AI Coach tab: the season outlook in its own box, then a box for each week with his projected points at the time (and what he scored after the game); the "Written by AI" line is gone. Pressing Write Season Outlooks again now writes fresh ones | Yes (coach_notes: projected, scored) |
| `1d8e5d5` | Go-live checklist: AI coach key added in Vercel (this push also rebuilds the test site so it picks the key up) | No |

### 26 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `e6c4ef2` | **Push notifications**: turn them on per phone (Account page, and a one-time card on the Dashboard; iPhones need the site on the Home Screen first). Trade offers, your trades answered, league trades, waiver results, chat, draft starting in 30 minutes, team selection closing in 2 hours (says if a starter isn't playing). Each type on or off on the Account page | Yes (push_subscriptions, push_sent, push_keys) |
| `24ab97d` | Plan (REBUILD-PLAN.md) brought up to date: what's left at the top, everything from 18-26 Nov added | No |
| `92713e7` | **Real match scores**: final scores come from the official fantasy game after each game (the 5-minute background job), shown on Fixtures, player cards, Matchup and Team Selection, and used for team win / draw points. `scripts/import-match-scores.ts` fills in a whole season | No (uses the match_results table that was already there) |
| `c01071c` | Draft Room page split into smaller files (looks and works the same); Moana players show "Moana" instead of "MOA" | No |
| `b8c5626` | iPhone bar behind the clock is navy (it was green with a fade below it) | No |
| `6dda7e7` | No blur at the top of the Home Screen app (solid status bar); strategy / mock draft tops match the other pages; team pictures can't be removed (every team gets a default icon); FDR shadows; 10-starter squad has 4 bench; home/away games mixed so runs are short; Stats Hub names cut off; "Upcoming" games; drag to swap in Team Selection; Isaac and Josh in Admin History | Yes (honours "played" rows, default team icons) |
| `9b85e37` | **Dashboard before the draft**: draft date and time with Enter Draft Room, Draft Preparation (Draft Strategy, Mock Draft); this round's games and Player of the Week if the season has started. Mock Draft moved out of the strategy box in the Draft Room and out of the menu | |
| `0d5f3d5` | Draft Strategy: Filters and a stat column on every list (like the Draft Room), drag players to reorder (press and hold), explanation text removed | |
| `92f8674` | **Draft Strategy redone**: three tabs (Overall Rankings, Targets in Early / Mid / Late Rounds groups, Positional Rankings), each group ranked, players added from an "Add Players" list. Round Plan and Do Not Draft removed. Auto-pick uses your targets for that part of the draft, then your Overall Rankings. Draft room tags your targets. One strategy per league (no more "default") | |

### 25 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `c16b2e5` | **Draft grades removed** (and the AI coach write-ups for them). **Draft Strategy** is no longer its own page: it opens inside the Draft Room (Set Up / Edit Strategy) with back and close buttons; Mock Draft's Edit button opens it there | Yes (removes the draft grades table) |
| `8b0ac60` | Draft grades moved to the bottom of the Teams tab (under each team), written as full sentences; Draft Complete keeps the last-pick banner | |
| `2f95814` | Draft room after the practice draft: pick clock always shows, "On the clock", Draft Complete screen with **draft grades** (A+ to F, written up by the AI coach, posted in chat), First Pick opens the draft order, Teams tab opens on your team and keeps positions together, owner initials on Draft Results, no Mock Draft link during the draft, draft watchlist moves to Transactions at the end. Fixed: a late auto-pick eating the next team's turn, "On the Clock: TBC", empty Teams tab after the draft. Player card switches only change the card; "Fantasy Points"; filters Reset; mock draft computer picks about 5 s | Yes |

### 23 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `c2772d1` | Commissioner button at the bottom of the Transactions tab (reverse moves there; 24 hours, and not once the next round kicks off). League Settings: hand the commissioner job to another member. Dashboard: home team on the left | |
| `48a1f24` | League Settings → Trades & Waivers: flip the waiver order in the finals (on by default) and eliminated teams can't trade (off by default). Commissioner can reverse a trade, waiver claim or free agent move on the Transactions tab. Matchup page: home team always on the left. Finals: the better seed is always at home | Yes |

### 21 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `04bae63` | AI coach articles: paste a link in Admin → Coach and the site reads it and finds the players and teams it mentions (or says why it can’t, so you paste the text); coach notes use the parts about each player. Coach notes box now 1,500 characters | Yes |
| `82e9fe3` | Draft Strategy page (round-by-round plan, position targets, do-not-draft list, your own rankings) and Mock Draft against computer teams (last 5 kept on the device). Auto-pick now uses the strategy after the watchlist; the draft room shows your plan, targets and Plan / Avoid tags | Yes |

### 20 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `962e00a` | Split the Transactions page again (1,912 -> 1,461 lines): header and tabs, player list, player card buttons and watchlist handling moved to components/transactions; unused example data removed. No visible change |  |
| `a86ef5f` | Split the Team of the Week page (1,028 -> 529 lines): top card, field and player tiles, and helpers moved to their own files in app/team-of-the-week. No visible change |  |
| `7dbc863` | Split the Admin page (1,077 -> 101 lines): each tab (Players, Status, Difficulty, Rounds, Scoring, History, Coach) moved to its own file in components/admin. No visible change |  |
| `590787f` | Split the player card (1,163 -> 412 lines): status strip and header, numbers and button bars, round points pop-up and data helpers moved to their own files in components/playerCard. No visible change |  |
| `0d1b1fd` | Split the trade page (1,469 -> 646 lines): top card, player lists, Cancel / Propose buttons and helpers moved to their own files in app/trade/propose. No visible change |  |
| `5e85444` | Split the League page (1,844 -> 838 lines): Standings, Fixtures and Results tabs, Join and Create League pop-ups moved to their own files in app/league. No visible change |  |
| `794ab2a` | Split the Team Selection page (1,959 -> 1,170 lines): header, pitch, subs & IR box, tiles and helpers moved to components/teamSelection. No visible change |  |
| `6bc4c96` | Dashboard: tapping the watchlist eye a second time now removes the player (it used to add him again) |  |
| `f795eff` | Split the Dashboard page (2,397 -> 1,145 lines): header, cards and helpers moved to components/dashboard. No visible change |  |
| `3195ef6` | Split the Matchup page (2,410 -> 1,202 lines): header, scoreboard, lineup rows and helpers moved to components/matchup. No visible change |  |
| `365d736` | Split the Transactions page (3,753 -> 1,927 lines): the Transactions tab, Pending Claims tab, add/drop pop-up, accept-trade pop-up, player row and … |  |
| `e0a5be9` | League Table Updated shows Pending until done; first and last names are required to create an account |  |
| `e65b856` | Ethan's list (20 Nov, 3): dashboard games box (Not started / Live / Complete / Finalised per game, League Table Updated) with player stats now pulled … | Yes |
| `6a20488` | Team profile pop-up: tap a team on the standings, power rankings, dashboard or matchup to see its squad (Trade button on each player, IR listed … |  |
| `ebe3fcf` | Starts and late team changes: keep who started each round (player_round_roles, saved as each game finishes) so the player card counts starts (named … | Yes |
| `032a6e2` | Ethan's list (20 Nov, 2): captain's projection in purple on Team Selection and the matchup; lineup check off Team Selection; dashboard Power Rankings … |  |
| `9a6ca76` | Ethan's list (20 Nov): power rankings tidy-up, preseason dashboard, Shield first holder, FDR rounds | Yes |
| `9206e92` | Standings: cleaner up / down / no change icons |  |

### 19 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `b245a9d` | Power Rankings: preseason rank and 5-round trend | Yes |
| `0b9154e` | Ethan's list (19 Nov, 3): playoff and title chances from a season simulation (Playoff % on the standings; Power Rankings now ranked by title chance) … | Yes |
| `0b06664` | Round recap: best / worst pickups only count players who played that round (injured players picked up early aren't "worst"); the chat card and … |  |
| `52589a1` | Round recap in the league chat: one "Round N recap" card per round (no results text or separate Shield post) that opens a pop-up with the results … |  |
| `6c7e450` | Ethan's list (19 Nov, 2): 10-starter squad as a preset (3 tight five, 2 forward, 2 halves, 3 back, 5 bench, 1 IR); draft date & time labelled on … |  |
| `734413d` | Ethan's list (19 Nov): stat view and 2026/2027 season in Filters (Transactions, draft room) with the column name over the numbers; draft room pool … |  |
| `92f5776` | Custom squads: the commissioner sets the starting slots (positions, or Tight five / Halves / Forward / Back / Any), bench size and IR spots before … | Yes |
| `ff4eb83` | League rewards and punishments: optional text the commissioner sets in League Settings (any time); league mates get an "I agree" pop-up on any page … | Yes |
| `d4f0d44` | Custom scoring: points for a team win and a team draw (each player who played in that game); results from a new match_results table (to be filled … | Yes |
| `5689d74` | Small changes from Ethan's list: name your AI coach on the Account page (shown on player cards and Coach News); no zoom when tapping a text box on … | Yes |
| `b78d4c6` | Demo league: team selection works (league ids starting "demo_" are no longer turned into "league_demo_...", which made /api/rosters refuse) … |  |
| `eb61463` | Expected points shown ESPN-style: matchup scores in the scoreboard font with each projection right under it (team totals and every player); Team … |  |
| `51a300b` | Demo league: team selection works (league ids starting "demo_" are no longer turned into "league_demo_...", which made /api/rosters refuse) … |  |

### 18 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `f9e4b1b` | Design refresh (trial branch): Barlow fonts, lighter text weights, solid white cards on the same gradient, white pop-ups, small teal/amber accents … |  |
| `fc8da42` | GO-LIVE: remove the demo league and branch before launch |  |
| `02cf9e3` | Demo site: on the demo-2026 branch the site shows the 2026 season frozen just after round 8 (clock frozen at Wed 8 Apr 2026 7pm NZ, stats up to round … |  |
| `7a3d479` | Local test database: picture storage on (team pictures, chat pictures) |  |

### 17 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `d8cbc49` | AI assistant coach: Claude-written player notes (season outlook, after each game, team/injury lists, status changes, news) from a fact sheet of … | Yes |

### 16 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `1b14887` | Stats Hub for everyone (every stat in one sortable table; filters, season, rounds, per game/total/per 80, stat groups, owners) and a player … |  |
| `762debb` | Bonus points per league: winning and losing bonus each on/off with its own margin (commissioner, locked at the draft) | Yes |
| `41c312e` | Team icons: boot heel and ankle collar lowered |  |
| `6921b20` | Team icons: boot toe flush with the sole (no overhang), slightly higher |  |
| `2e61168` | Team icons: boot with three stripes, smaller studs and a slimmer toe |  |
| `772c7b5` | Team icons: boot reshaped to Ethan's reference (small low rounded toe, top rising to a raised heel, laces inside the boot, bigger studs) |  |
| `2f59997` | Team icons redrawn side by side with Ethan's references: shaded ball lying flat with two trim bands, low sleek boot (toe left, heel raised, thin … |  |
| `69dd87c` | Team icons redrawn from Ethan's references: white circle, thin outlines; white Shield posts with coloured flags and pads; white ball with coloured … |  |
| `c60e9d4` | Default team pictures: boot, posts, ball or numbered jersey (1-23) in a chosen colour with white details, instead of uploading a photo (Team Details … |  |
| `2b3cdc6` | Shield rewards (commissioner, locked at the draft): first waiver pick in round 1 of each week's claims, ladder points per defence and for taking it … | Yes |
| `2bc2f3e` | Remove taunts entirely (Ethan, 16 Nov): Matchup page button, taunt messages and graphics, admin Taunts tab and pictures, taunts mute setting … | Yes |

### 13 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `013987a` | Taunt graphics: points card then an animated graphic (try: team-colour rays, picture, TRY! slam; cards: SIN BIN! / RED CARD!); players' own pictures … | Yes |
| `06fe625` | Chat: league chat and direct messages (menu message button, unread count, banner), pictures, trade offers in DMs with Review, automated league posts … | Yes |
| `4ce2dd4` | Waivers run automatically at their deadline (5-minute job), not only when someone opens Transactions; waiver logic moved to lib/waivers/process.ts … |  |
| `ede23dd` | Transactions tab: pick an earlier round to see its moves (waivers, free agents, trades between the two lineup deadlines) |  |

### 12 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `1e62486` | Weekly power rankings: League Power tab (season average, last 3 rounds, best possible XV projection; movement since last round) | Yes |
| `4ce5773` | Season recap (pops up once at season end; stories: pickups, draft steals and busts, comebacks, streaks; shield, crowns, league roundup); recaps to … | Yes |
| `25c8e4b` | Shield secured for the season: holder pop-up, recap line for everyone else; weekly recaps can be opened again for any finalised round | Yes |
| `dcc1a1e` | Shield: SHIELD DEFENCE / SHIELD CHALLENGE labels (matchup, dashboard, recap, fixtures); switching it off part-way keeps the holder whatever the … | Yes |
| `9c601c2` | Shield on the pages: League Shield tab, holder icon on the ladder / matchup / dashboard, SHIELD GAME on the matchup and upcoming fixture, weekly … |  |
| `4eb9870` | Shield: league settings (on/off, name ending in Shield; create, settings, restart), loader across seasons, /api/leagues/shield, summary in league … | Yes |
| `11b6832` | The Shield: rules worked out from results (first award, home defences, carries over seasons, handed back / re-awarded) |  |
| `5517fdf` | Questionable (QUES) status: injured players due back next round turn QUES once this round finishes, until the next lists; works like injured for IR. … | Yes |
| `a237e03` | Shield icon: bottom plaques moved up |  |
| `c9978ed` | Shield icon: corner plaques moved in (lower ones more) |  |
| `ada8ae7` | Shield icon: side plaques moved in from the rim |  |
| `94218d5` | Shield icon: post pads flush with the base of the posts |  |
| `5947153` | Shield icon: shorter posts (flags clear of the plate edge), padded post bottoms from 32px |  |
| `2267a1c` | Shield icon: bigger, lower ball; flags on the posts from 32px |  |
| `dc16864` | Shield icon: bigger ball overlapping the posts |  |
| `db4202b` | Shield icon: rugby posts behind a ball in the silver centre, same at every size |  |
| `1c26608` | Shield icon: upright plaques; finer detail on the silver centre from 32px |  |
| `9a00dea` | Shield holder icon (Ethan's pick: option B, oak, oval plaques) |  |
| `43349ba` | Matchup page switches to the upcoming round when the team lists come out (Wednesday 4:30pm NZ), marked UPCOMING until the deadline |  |
| `e5cd2e0` | Expected points on the pages: Matchup (projected totals, win probability bar that moves as real points come in, each player's projection), player … |  |
| `073d523` | Expected points on the server: /api/projections (every player's week, league scoring), ranges, live team outlook and win probability (2026: Brier … |  |
| `f9d298d` | Expected points: better-ranked players start from more minutes until they have starts of their own |  |
| `7365103` | Expected points: kicking order by share of the team's kicks in games he played (an injured first-choice kicker keeps his place); last season's … |  |
| `1445d45` | Expected points: draft rank as the starting estimate; Ethan's start-of-season notes (expected role, goal kicker) on the admin player form | Yes |
| `371b3ac` | Expected points: hookers' lineout errors rise against teams that steal lineouts (checked against Ethan's 2026 set-piece numbers) |  |
| `7f9fedb` | Expected points v2: stat-by-stat trust, position minutes, opponent strength by position, goal-kicking duty, auto-subs in team totals, injured stays 0 |  |
| `0cea9be` | Expected points before team lists: expected lineup from recent team lists, plus the midweek injury list; fair 2026 test |  |
| `dc328b6` | Expected points: projection recipe and a 2026 backtest (11.5 pts average miss per player, projected winner right 71-74%) |  |
| `5c8e70e` | Clean player ids (mckenda01 style): id maker, switch-over script for every stored id, admin uses it for new players |  |

### 11 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `548636f` | Owner name under team name on the ladder; win/loss records and streaks count the regular season only |  |
| `85caaea` | Filters pop-up for the player pools (Transactions and draft room): players, team, position, status, sort, clear; several options per filter |  |
| `932d9cb` | Trade review pop-up: received offers show Review (players, one stat at a time, per game/total/per 80, Accept/Decline inside) |  |
| `e5e31a8` | Per game / Total / Per 80 switch on the player card, player pools and trade screen |  |
| `e76bed3` | Player card: Transactions tab (this league's moves, newest first) and AI Coach placeholder tab |  |
| `49ee5eb` | Join in two steps (code, then team name and picture, pre-filled when rejoining); league restart only in the month before the season starts |  |
| `d75ac3e` | Championship stars and league history: honours recorded at season end, restart a league for the new season, team carried over on rejoin, admin … | Yes |
| `70ebc62` | Weekly recap pop-up on the dashboard: result, best player, biggest dud, crown and spoon, ladder change, next opponent | Yes |
| `162d187` | Crown and spoon move each week (latest round only, no tally); gold championship star drawn on team pictures |  |
| `82e5e0c` | Weekly crown and spoon: worked out from finalised regular-season scores; tally column on the League ladder |  |
| `1383481` | Team pictures: upload and crop on Team Details; shown on ladder, matchup, dashboard and transactions | Yes |
| `bde9bcd` | Account page (password, notifications, switch team, log out); fewer pages and a browse-only Player Pool with no league | Yes |
| `9eb1432` | Plan: Ethan's second list (E1-E8); FDR key under the ratings; no min/m in score breakdowns |  |
| `ad2e7dd` | Plan: IR drops are listed in Transactions |  |
| `37db040` | IR: a player dropped to bring someone back from IR is listed in Transactions | Yes |
| `80fd57f` | IR spot (B3) with the subs on Team Selection; bench status tag says SUB |  |
| `50a7c4a` | Lineups fix themselves after adds, waivers and trades; captain/vice rules; server checks position rules |  |

### 10 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `eb07eed` | Status tags (style B), injury-list fixes, home-screen top, log out on Team Details, menu on empty League page |  |
| `b3ac83d` | Phase 1: home-screen layout, automatic timezones, short positions, stat counts, trade icon, 2026 stats before kickoff |  |
| `ace704c` | Plan: Ethan's 2027 changes and additions with agreed details |  |
| `2edbc39` | Go-live status and launch-day checklist (items 8, 9, 10) |  |
| `937e344` | Go-live guide: db push --remote, region check, Vercel Sydney region |  |
| `1da99a3` | Shared helpers, smaller pages, every page finds its league (item 15) |  |
| `54d2695` | Speed check and leftovers (item 15) |  |

### 5 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `15e34a1` | Go-live prep: safe scripts, guide, Node 22, security fixes (items 8, 10) |  |
| `819abde` | Tidy-up: stop rebuilding pitch/bench/tiles on every refresh (item 7) |  |
| `4f87dd5` | Tidy-up: remove unused tables, empty files and ~1,300 lines of dead code (item 7) | Yes |
| `3feb25c` | Tidy-up: expired trades, display warnings, one trade deadline (items 4b, 4c, 7) |  |
| `cd7a325` | Scoring editor: plain type-in boxes |  |
| `c58183f` | League scoring options on the pages and admin (item 12, part 2) |  |
| `8bf98c0` | League scoring options: Standard / Alternate / Custom engine (item 12, part 1) | Yes |
| `36938b2` | Draft room runs on the server (item 14, part 2) |  |
| `a06b052` | Server draft engine (item 14, part 1) | Yes |
| `74f38d2` | Team lists read once on Wednesday 4:30pm NZT; standard injury wording; three positions | Yes |
| `1df4dd9` | Read the official team lists and injury list into player statuses (item 13) | Yes |
| `ad78275` | Admin page: players, round status, difficulty ratings, finalise again (item 13) |  |
| `ca51763` | Players move into the database (item 13, part 1) | Yes |
| `d31812f` | Season settings across the site (item 6) |  |
| `8a0bf0c` | Tracker: item 5 done; leftovers moved to items 6 and 13 |  |
| `640f497` | Pages read results from the database; Lock scores button removed (item 5) |  |
| `cf22501` | Stats sync: every 5 min while a game is live, hourly until final |  |
| `4fb58fa` | Run the results job every 5 minutes from Supabase's scheduler (item 5) | Yes |
| `712603c` | Automatic results engine (item 5) |  |
| `c1f42a2` | Tracker: carried-forward lineups and re-finalise button agreed |  |
| `bcab508` | Ladder with bonus points, and carried-forward lineups (item 5) |  |
| `9c34f15` | Tracker: item 5 progress, difficulty ratings agreed, new item 13 (admin page) |  |
| `68022d0` | Week scoring engine: auto-subs by minutes, captain rule, tries (item 5) |  |
| `5718654` | Database tables for results, schedule, history and difficulty (item 5) | Yes |
| `d31e61c` | Schedule: 3rd/5th place games, fair byes, round names, mid-season starts |  |
| `438da9a` | Season settings and schedule maker (item 5) |  |
| `3c41be9` | Add the 2027 Super Rugby Pacific draw (from the official PDF) |  |
| `d4c0c39` | Tracker: season rules agreed for results, finals and scoring |  |
| `00aa16e` | Server refuses lineup changes after the deadline (item 5) |  |
| `699e496` | One shared copy of the scoring rules (item 5) |  |
| `6a4800a` | Tracker: item 5 decisions and new item 12 (league scoring options) |  |

### 4 Nov 2026

| Code | What changed | Database |
|---|---|---|
| `c976af3` | Fix hook-order crash risks (item 4) |  |
| `c82e7f0` | Lock down the database and remove unused/risky routes | Yes |
| `fafba22` | Replace username-only sign-in with Supabase Auth (email + password) | Yes |
| `18d6321` | Add Supabase CLI setup and current database schema |  |
