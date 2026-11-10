# 2027 Rebuild Plan

Work happens on the `rebuild-2027` branch. The live site keeps running from `main` until we merge.
Rule for now: **no changes to the site's look or formatting** unless agreed first.

Status key: ⬜ not started · 🔶 in progress · ✅ done

## Security (fix first)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Proper logins with passwords.** Today anyone can sign in as anyone just by typing their username. | 🔶 | Built 4 Nov 2026 with Supabase's login system (email + password, working "Remember me", forgot-password emails). 34/34 automated tests pass on the local test database. **Still to do:** Ethan tries it in his browser; when the new Supabase project is made (item 8): turn off "Confirm email" (or add an email provider), set the Site URL, and load the reset-email template. Old username-only accounts can't sign in; everyone makes a fresh account. |
| 2 | **Lock down the database.** 3 tables have "temp public write" rules, 6 have no protection, and the database's "who are you" check trusts whatever the browser says. | ✅ | Done 5 Nov 2026 on the test database: all 44 old rules removed, every table protected, browsers have no direct access (the site's server does everything). **Not applied to the live 2026 database** (Ethan's call, 5 Nov 2026: skip, since the new project gets it automatically and more table changes are coming). |
| 3 | **Remove unused and risky server routes** (about 12), including the sign-in-as-anyone route, an unprotected "overwrite player stats" route, the debug page, and a broken team-rename route. | ✅ | Done 5 Nov 2026: 11 routes + debug page removed. Also fixed: any player could save another team's lineup or change league settings (now own team only / league creator only); drop-lock cleanup now needs sign-in. 37/37 tests pass. Kept the player-image sync route (password-protected, useful for 2027 photos). |

## Bugs

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4 | **Crash risks** in the player card pop-up, league settings pop-up and transactions page. | ✅ | Done 5 Nov 2026, no visual changes. Also fixed: the league settings pop-up lost anything you'd typed if you switched apps and came back. Checked in a real browser (Edge, phone-sized): 18/18 checks pass, including a browser run of the new sign-in/create-account screens. |
| 4b | **Expired trade offers are never auto-declined.** | ✅ | 9 Nov 2026: the trade list already cancels expired offers on the server; the transactions page's call to a route that never existed was removed. |
| 4c | **Minor: two pages drew differently on the server than in the browser** (matchup page; dashboard had a button inside a button). | ✅ | 9 Nov 2026: fixed both; all browser checks now pass in full. |
| 5 | **Save weekly results.** Scores were recalculated every time, results were typed into a Google Sheet, and "Lock scores" was a manual button whose lock only lived in one browser. | ✅ | Done 6 Nov 2026 on the test database. Results, schedule, finals, wooden spoon, bonus points and history now live in the database; Supabase's scheduler runs /api/cron/tick every 5 minutes: stats sync every 5 min while a game is live and hourly until final, lineups lock at each deadline (missing lineups carried forward and matched to the roster), each round finalises 13.5 h after its last kickoff (auto-subs by minutes, captain rule, finals tie-breaks), next matchups and finals teams filled in automatically. The schedule is built when the last draft pick is made; finals/scoring/bonus settings lock when the draft starts. Pages read results from the database (LIVE / FINAL tag on matchups); the manual Lock button, the browser-trusting finalise route and the GitHub workflow are gone. 2026 results + 2025/2026 honours imported. Tests: scripts/tests (schedule, week scoring, ladder/lineups, full 2026 season replay) + browser check. Left for other items: pages still use 2026 week numbering and fixtures (item 6), players/fixtures still from Google Sheets (item 13). |
| 12 | **League scoring options.** Commissioner picks the scoring system when creating a league: Standard, Alternate, or Custom (set every stat's value). Same stats, different points. | ✅ | Done 9 Nov 2026 (test database). Ethan's Alternate values loaded (decimals, metres per 5 m, scrum points to props only, extra minutes point at 60). Standard and Alternate values live in the database and Ethan edits them on the admin Scoring tab; a league's scoring is frozen when its draft starts. League creation and settings have Scoring (Standard / Alternate / Custom with an editor) and a Bonus points switch; all lock once the draft starts. Every page and the results job score with the league's own rules; scores show one decimal place. Also fixed: league settings never saved (the draft time was sent in the wrong format); after the draft even a rename failed; tall pop-ups couldn't scroll on phones. Tested: scoring worked by hand, Standard unchanged vs 2026, browser test of create/settings/admin/locking. |
| 13 | **Admin page for Ethan.** Small edits without going into Supabase. | 🔶 | Built 7 Nov 2026 (test database): players now live in the database (2026 pool imported; 2027 starts as a copy, Moana hidden) and the Google Sheets are gone; Admin page (menu item only for the admin, every request checked on the server) with Players (search, add, edit, hide, status per round), Difficulty (1–5, pin) and Rounds (regather stats + preview + finalise again). scripts/make-admin.ts makes an account admin. ✅ 7 Nov: the official team-list and injury articles are read automatically, once, at 4:30pm NZT on the Wednesday before each round (found via the official news page; retried until they're out). Injuries are written one way ("Knee - Season", "Hamstring - 6-8 weeks", "Knee - TBC") whatever wording the team used, and last until the next injury list (teams not in it keep theirs); Starting/Benched clear once the game finishes; players can have up to three positions. Only the two official super.rugby articles are used. Earlier note: into player statuses; names that don't match are flagged on the admin Status tab with one-tap fixes; hand-set statuses are never overwritten (tested on 2026 round 7: agrees with Ethan's typed statuses for 264 of 269 players, and caught the article's own misspellings). **Still to do:** swap in the official 2027 player list when it comes out (a couple of weeks before the season): take playfantasyrugby's positions, Ethan sets draft ranks; slow in-season update of the difficulty ratings (unless pinned). |
| 14 | **Rebuild the draft.** In 2026 the draft was done in a Google Sheet and Ethan entered every team by hand; the draft room ran in each person's browser (order, timer, auto-pick, rosters). | 🔶 | Rules agreed 8 Nov 2026: snake order, shuffled when teams join, commissioner can rearrange until the draft; 90 s a pick; auto-pick from the team's ordered draft watchlist, then best draft rank, never breaking position rules; after 3 misses in a row, auto-pick after 10 s; roster 2 PR, 1 HO, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB + 5 wildcards (20), any of a player's three positions counts; no commissioner pause/undo. ✅ Server draft engine built and tested (full 80-pick draft with nobody watching). ✅ 9 Nov: draft room switched to the server (same look): server countdown, picks checked on the server, auto-picks by the server (and the 5-minute job, so a draft keeps going with nobody watching), ordered watchlist with ▲▼ on the Watchlist tab, third positions shown; order shuffled on join and editable by the commissioner until the draft; fixed: joining a league used to reset the draft to pick 1, the order-saving route never existed, and any player could save a made-up roster for their own team (roster saving is now server-only). Browser-tested. **Still to check with Ethan:** a real multi-person test draft once the site is on the new project. |

## Getting ready for 2027

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | **One season settings file.** "2026" was typed into about 30 files, plus Google Sheet links. | ✅ | Done 6 Nov 2026. lib/season holds each season's draw and rules; the site runs one season at a time (2027 by default; the local test copy is set to 2026 with NEXT_PUBLIC_CURRENT_SEASON). Pages get fixtures and stats numbered by fantasy week and show round names ("Round 10/11"); new leagues get the season and its 16 weeks; trades/lineup deadlines use the season rules; fixtures come from /api/fixtures/season with difficulty from the database (fixtures + round-stats Google Sheets no longer used; the players sheet goes with item 13). Draft: 20 picks per team, as in 2026. |
| 7 | **Tidy up.** Duplicate code, unused database tables, empty junk files, pop-ups/panels built inside their pages. | ✅ | 9 Nov 2026: unused trades/league_members tables and old draft_order column dropped; 4 empty files removed; ~1,300 lines of dead code removed; one copy of the trade deadline rules; the team-selection pitch, bench, tiles and menu button (and team of the week, matchup) are no longer rebuilt on every refresh. Not done: splitting the biggest pages (transactions 4,100 lines) — best done together with the design changes. |
| 15 | **Speed check and leftovers (Ethan: "laggy when clicking buttons").** | ✅ | 10 Nov 2026, measured on a production build with the CPU slowed 4x like a phone. Causes found and fixed (no visual changes): the transactions page froze for **46 s** on load (the player list re-scanned the whole season's stats for every comparison while sorting): now **1.2 s**; trade page 1.9 s → 0.1 s. Almost every page rebuilt all its panels/rows from scratch on every refresh (now kept and updated; also stops lists jumping and pop-ups losing typing). The dashboard and draft room asked the server for the league, the whole draft and rosters **every second** (3 calls/s per open dashboard, forever): now every few seconds only around draft time, once a minute otherwise, never while the tab is hidden; the draft countdown redraws only itself. Player cards re-downloaded the season's stats (3 MB) on every open: now shared and cached; that download is 30% smaller. Team images 9.3 MB → 1.3 MB (same look, WebP): team selection 3.5 MB → 0.36 MB of images per visit, team of the week 3.5 MB → 0.04 MB. Leftovers removed: 8 unused files, 1 unused route, ~10 unused functions, the browser database client and its dead live-update/direct-write code (the database already blocked it), placeholder draft teams, 5 starter icons. Also: finished drafts no longer overwritten by draft-day rosters in the browser. Follow-up the same day: ~560 lines of helpers copied between pages now live once (lib/teams/images.ts: jerseys and logos; lib/league/weekHelpers.ts: week and deadline helpers; copies that had drifted apart were left alone so nothing changes on screen); self-contained chunks moved to their own files unchanged (transactions filters, league settings pop-up, player card tabs); every page now loads the signed-in player's leagues itself (components/LeagueSync), so a page opened directly or on a new phone shows the right league and team (before, only the dashboard did). Not done, on purpose: splitting each page's own logic (e.g. 3,000 lines of transactions) would mean rewriting how the pages hold their data; best done with the design changes. 2027 player photos: Ethan will supply the links. |
| 8 | **New clean Supabase project** with only the tables we need, then copy the data across. | 🔶 | 10 Nov 2026: new project **Draft Rugby Fantasy 2027** (Sydney, ref dbmzgofmjbeeskhwohuv) built and loaded (players, photos, honours); logins, Gmail SMTP, reset email, scheduler secrets and Vercel settings all done; Ethan's account is admin. **Launch (merge to main) held** until Ethan's changes are done; test site = the rebuild-2027 preview. Launch-day steps: `GO-LIVE.md`. |
| 9 | **Before the season:** add the two scheduler secrets (site_url, cron_secret) in the new Supabase project's Vault and CRON_SECRET in Vercel; load 2027 players. | 🔶 | Scheduler secrets, CRON_SECRET and players done 10 Nov 2026. Left: official 2027 player list when it's out (+ photo links from Ethan, draft ranks on the Admin page). |
| 11 | **Idea: live updates.** The league page was meant to update by itself when another team changed, but it never worked (it relied on the fake-able check). Could be built properly on top of the new logins. | ⬜ | Optional improvement. 10 Nov 2026: the old broken code for this was removed (item 15). |
| 10 | **Upgrade Node.js to version 22** on Ethan's PC and on Vercel. Supabase's code now warns that Node 20 support is ending. | ✅ | Done 10 Nov 2026: Node 22.23.4 on Ethan's PC; package.json tells Vercel to use Node 22; everything tested on it. |

## Season rules agreed with Ethan (for items 5 and 12)

- **2027 season:** 17 Super Rugby rounds, but rounds 10 and 11 count as one fantasy week (round 10 has 4 games, round 11 has 1), so 16 fantasy weeks. The fantasy season starts at round 1. Finals use the last weeks of the regular season.
- **Lineup deadline:** 1 hour before the week's first kickoff (enforced by the server). Combined week 10 & 11: before round 10's first game.
- **Finalising:** 13.5 hours after the week's last kickoff: auto-subs, then scores locked. Stats sync runs only from each game's kickoff until 13.5 hours after it, so it is quiet between weekends.
- **Standings:** 4 points for a win, 2 for a draw; then points for, then points difference. Bye: score counts toward points for, no win or loss.
- **Bonus points:** for winning by 140+ or losing by 40 or less (Ethan sets the site-wide margins; commissioner can switch them off before the draft). Not in finals or byes.
- **Finals:** none / 2 / 3 / 4 / 6 teams. 3: 1st seed gets a bye to the final. 6: top two get byes, 3 weeks. Finals tie: most tries that matchup, then higher seed.
- **Consolation (wooden spoon):** mirror of the finals (losers go through, bottom seeds get byes). If it needs fewer weeks than the finals, the bottom teams play extra (2 teams: both weeks, lowest total gets the spoon). If it needs more, the top consolation seeds play fill-in games so the spoon is decided in time. No finals: champion and spoon are the top and bottom of the ladder.
- **Round names:** weeks are named after the real rounds ("Round 9", "Round 10/11", "Round 12"), so it's obvious 10 and 11 are combined.
- **Knocked-out finalists keep playing:** semi-final losers play a 3rd place game; in 6-team finals the elimination-final losers play for 5th over the last two weeks (scores added).
- **Round-robin:** everyone plays everyone once before playing anyone again. Odd-numbered leagues: if byes can't come out even, the last partial rotation is picked week by week from the ladder so extra byes go to the top teams (extra games to the bottom teams). Commissioners can also edit future matchups (like ESPN), to be built with the league settings screens.
- **Leagues can start mid-season:** the first matchup is the first round whose deadline is after the draft; finals stay at the end of the season.
- **Fixture difficulty (1–5):** 2027 starting ratings agreed 6 Nov (worked out from 2026 results, then adjusted by Ethan; stored in the database). Super Round (round 8) games count as neutral. During the season they update from results, but slowly, so a couple of flukey results don't swing them; Ethan can change or pin any rating on the admin page (item 13).
- **League settings** (scoring system, bonus points, finals): the commissioner can change them until the draft, then they lock. The schedule is built after the draft.
- **No lineup saved:** at each deadline the site locks every team's lineup: the one saved for that round, or else their most recent one, updated for adds/drops/trades since (new players fill the gaps by position). Trades during the round don't change the locked lineup.
- **Late stat corrections:** the admin page gets a "regather scores and finalise again" button for a round (shows what would change before confirming).
- **Scoring options:** Standard / Alternate / Custom. Custom can change every stat's points and the minutes points, but not the x2 captain.
- **History:** 2026: Ethan champion, Sam runner-up, Logan and Will semi-finalists (weeks 15 and 16 were the playoffs). 2025 (Sam, Ethan, Josh, Jake): Sam champion, Ethan runner-up, Jake last. Stored by person and linked to the new accounts once people sign up.

## 2027 changes and additions (Ethan's list, 10 Nov 2026)

Agreed answers are recorded here so nothing is lost between sessions. Status: ⬜ to do, 🔶 in progress, ✅ done (tested on the test site).

**Phase 1: quick fixes**
| # | Change | Status | Agreed details |
|---|---|---|---|
| A1 | Fit the screen when added to the iPhone home screen | 🔶 | Everyone is on iPhone; only the home-screen app is wrong. Keep the full-screen look, but nothing under the clock/battery or the bottom swipe bar; page background fills those areas (no black strip). Built 10 Nov: page background and top spacing fixed site-wide (incl. the menu); checked in an iPhone simulation. **Ethan to check on his phone from the home screen.** |
| A2 | Automatic timezone | ✅ | Remove the timezone/region choice; all times show in the phone's own timezone. Done 10 Nov (sign-up no longer asks; also fixed: the old NZ option wasn't a valid timezone). |
| A3 | Position abbreviations | ✅ | PR, HO, LK, LF, HB, FH, CE, OB joined with "/" (e.g. CE/OB/FH) in most places, since three positions won't fit written out. Done 10 Nov (player pools, player card, draft room, trade pages, dashboard). |
| A4 | New status symbols + show them in the player pools | ⬜ | Green / yellow / red, inspired by FPL and the official Super Rugby fantasy. Statuses: Starting, Bench, Injured, Suspended (red badge with an "S"; Ethan enters suspensions by hand, they're rare), Out; nothing when available. Ethan picks from example designs. |
| A5 | Points breakdown shows how many of each stat | ✅ | Rows: stat, count, points (e.g. Tries 2 14.0). Done 10 Nov (e.g. Metres 39 m · 3; Minutes 80 min · 2). |
| A6 | Better trade button symbol | ✅ | Replace the double-arrow symbol. Done 10 Nov (drawn two-arrow swap icon). |
| A7 | 2026 stats until the 2027 season starts | ✅ | Player cards and player pools show 2026 stats until the first 2027 kickoff (copy 2026 stats into the new database). Done 10 Nov: 2026 stats copied to the new database; player cards (with a "2026 season stats" note; the Fixtures tab shows the 2027 draw), transactions and trade pools, and the dashboard's form use 2026 until the first 2027 kickoff. Matchups and lineups always use the current season. |

**Phase 2: rules and reliability**
| # | Change | Status | Agreed details |
|---|---|---|---|
| B1 | Lineups fix themselves after transactions | ⬜ | New player takes the vacated spot if they fit; else the highest bench player who fits moves up and the new player goes to the bench; else fewest moves. A transaction that would leave an empty spot doesn't go through. IR players never move automatically. Locked weeks don't change. Applies to free agency, waivers and trades. |
| B2 | Captain and vice always set | ⬜ | Start of season: 1st and 2nd draft picks. Carry over week to week. If the captain leaves the team (dropped / traded / IR) or ends up on the bench: vice becomes captain, and the new vice is the highest draft pick among the starters. Same for the vice. Neither can be on the bench. |
| B3 | Injury reserve (IR) | ⬜ | One IR spot per team. Teams still draft 20. An IR player doesn't count towards the 20 or position limits, can't be in a lineup, and doesn't score. Eligible: any injury status or "Out"; not Suspended / Starting / Bench / not named. Players can't be added straight into IR. Can be moved to IR any time (a locked week's lineup doesn't change). If the IR player becomes healthy: no adds, claims or trades (proposing or accepting) until they're activated; lineups and declining trades still allowed. Activating: drop a player in the same move, or swap in another injured player. IR players can't be traded. IR moves aren't listed in the Transactions tab. |
| B4 | Add players straight from the dashboard | ⬜ | The + on top available players works on the dashboard: free agency asks who to drop (if full) and confirms; waivers place a claim with a drop. No page change. |
| B5 | Usernames / team names | ✅ | Decided: usernames stay fixed; team names stay on the Team Details page (already works). |

**Phase 3: bigger screens**
| # | Change | Status | Agreed details |
|---|---|---|---|
| C1 | Per game / total / per 80 toggle | ⬜ | Affects points and every stat. Everywhere people look at a player's season stats (player card, player pools incl. draft room, trade screens). Default: per game. Per 80 shows "–" until the player has 20+ minutes in the season. The dashboard's top players keep showing form only. |
| C2 | Filters pop-up | ⬜ | One Filters button opening a pop-up: Players (Available / All / a team), Team, Position, Status, Sort by, Clear. Several options per filter allowed (e.g. 3 teams). Same pop-up in the draft room. Status options: All / Available to play / Starting / Bench / Injured / Suspended. |
| C3 | Player card: Transactions tab | ⬜ | Newest first, this league only: drafted (round and pick), added (free agent, with who was dropped), claimed on waivers, traded (from to). No IR moves. |
| C4 | Player card: AI coach tab | ⬜ | Placeholder tab for now; the coach itself is designed later with Ethan (season outlook, after-game and team-sheet notes, like ESPN player news). |
| C5 | Trade review pop-up | ⬜ | Received offers show "Review" (not accept/decline). Pop-up: players you get and give, one stat at a time (changeable) + the per game / per 80 / total toggle; Accept and Decline inside. |

**Phase 4: big features**
| # | Change | Status | Agreed details |
|---|---|---|---|
| D1 | Push notifications | ⬜ | iPhone home-screen app (iOS 16.4+), with a "turn on notifications" button and instructions. Types: trade offer for you; your trade accepted or declined; any trade accepted in your league; lineup deadline reminder 2 hours before; waivers processed (only if you had claims in that run); draft starting soon. Each person can switch types on/off. |
| D2 | Live match scores | ⬜ | Wherever real match scores are shown, they update live during games (from the official site, like the player stats). |
| D3 | AI assistant coach | ⬜ | Later: Ethan will break down what it should use and we'll design it together. |

Everything new matches the current look (a site-wide formatting refresh comes later).

## Done so far

- ✅ Checked GitHub connection and that no keys are committed (4 Nov 2026)
- ✅ Restored the paused Supabase project and backed up all data locally to `backups/2026-11-04/` (never uploaded) (4 Nov 2026)
- ✅ Installed Docker and the Supabase tool, linked the project, saved the database structure to `super-rugby-draft-web/supabase/schema.sql` (4 Nov 2026)
- ✅ Full site review (4 Nov 2026)
- ✅ Local test database set up in Docker with a copy of the 2026 data, so changes can be tried safely (4 Nov 2026)

## How to run the site on this PC (for testing)

1. Open **Docker Desktop** and wait for "Engine running".
2. In VS Code: **Terminal → New Terminal**, then run these one at a time:
   - `cd super-rugby-draft-web`
   - `npx supabase start` (the test database; already set up)
   - `npm run dev`
3. Open **http://localhost:3000** in your browser.
4. Password-reset emails don't really get sent when testing. They appear at **http://127.0.0.1:54324**.
5. When finished: press **Ctrl+C** in the terminal, run `npx supabase stop`, then quit Docker Desktop.
