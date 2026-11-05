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
| 4b | **Expired trade offers are never auto-declined.** The transactions page calls `/api/trades/decline-expired`, which was never built. Expired trades already can't be accepted, so nothing breaks, but they're never marked as declined. | ⬜ | Half-built feature found while testing. |
| 4c | **Minor: two pages draw slightly differently on the server than in the browser** (matchup page; dashboard has a button inside a button). React redraws them; no crash. | ⬜ | Existed before; tidy up with item 7. |
| 5 | **Save weekly results.** Scores are recalculated every time, so old results can change and there is no season history. | 🔶 | Ethan's rule (5 Nov 2026): player scores are final within 10 hours of a round's last game, so a round is finalised automatically *just over* 10 hours after its last game: auto-subs processed, then scores locked in. Findings (5 Nov): 2026 results were typed into a Google Sheet (now backed up); "Lock scores" was a manual button whose lock only lived in one browser; the server trusted player points sent by the browser when doing auto-subs, and overwrote the picked lineups; the server didn't stop lineup changes after the deadline; the scoring rules were copied into 5 pages (4 agree, the league page's copy is wrong). **Agreed (5 Nov):** no more Google Sheet, everything stored in the database; one shared copy of the scoring rules; the server enforces the lineup deadline; a round finalises automatically **13.5 hours after its last game's kickoff** (about 2h game + 1h for extra time/delays + 10h + a small buffer); the site builds the round-robin itself; commissioner picks finals of none / 2 / 3 / 4 teams (3 teams: 1st seed gets a bye to the final), plus a consolation playoff for the rest (mirror image: e.g. 7 teams, 5v6 then the loser plays 7th); import the 2026 results as history. Stats sync only runs from a round's first kickoff to its finalise time, using Supabase's scheduler (GitHub's ran up to an hour late). **Progress:** ✅ one shared copy of the scoring rules (5 Nov; checked against all 3,511 2026 player scores); ✅ server refuses lineup changes after the deadline (5 Nov); ✅ 2027 draw loaded and season settings (6 Nov); ✅ schedule maker incl. finals, wooden spoon, 3rd place, fair byes (6 Nov); ✅ database tables + 2026 history and honours imported to the test database (6 Nov); ✅ week scoring engine (auto-subs by minutes, captain rule; 6 Nov). ✅ ladder with bonus points, carried-forward lineups (6 Nov); ✅ automatic results engine + /api/cron/tick + Supabase scheduler, schedule built when the last draft pick is made, settings lock when the draft starts, 6-team finals option (6 Nov; whole 2026 season replayed through it on the test database). Next: switch the pages over from the Google Sheet and localStorage to the database, and remove the manual Lock scores button. |
| 12 | **League scoring options.** Commissioner picks the scoring system when creating a league: Standard, an alternate set of point values, or Custom (set every stat's value). Same stats, different points. | ⬜ | Ethan's idea (5 Nov 2026). Item 5's shared scoring rules are being built so this slots straight in. |
| 13 | **Admin page for Ethan.** Small edits without going into Supabase: fixture difficulty ratings, add/edit players, kickoff-time changes, and similar edits as they come up. | ⬜ | Agreed 6 Nov 2026. Database flag (users.is_site_admin) already added. Players and fixtures move from Google Sheets/files into the database for this. |

## Getting ready for 2027

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | **One season settings file.** "2026" is typed into about 30 files, plus Google Sheet links. | ⬜ | |
| 7 | **Tidy up.** Duplicate code, 2 unused database tables, 4 empty junk files, split the biggest pages (up to 4,400 lines). | ⬜ | Includes pop-ups/panels built inside their pages (join/create league pop-ups, team-selection pitch and bench) that get rebuilt on every refresh. |
| 8 | **New clean Supabase project** with only the tables we need, then copy the data across. | ⬜ | After 1, 2, 5 and 7. |
| 9 | **Before the season:** add the two scheduler secrets (site_url, cron_secret) in the new Supabase project's Vault and CRON_SECRET in Vercel; load 2027 players. | ⬜ | The GitHub stats-sync workflow is retired: Supabase's scheduler now calls /api/cron/tick every 5 minutes (stats sync during games + locking + finalising). 2027 fixtures already loaded (6 Nov). |
| 11 | **Idea: live updates.** The league page was meant to update by itself when another team changed, but it never worked (it relied on the fake-able check). Could be built properly on top of the new logins. | ⬜ | Optional improvement. |
| 10 | **Upgrade Node.js to version 22** on Ethan's PC and on Vercel. Supabase's code now warns that Node 20 support is ending. | ⬜ | Quick; do before the season. |

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
