# 2027 Rebuild Plan

Work happens on the `rebuild-2027` branch. The live site keeps running from `main` until we merge.
Rule for now: **no changes to the site's look or formatting** unless agreed first.

Status key: ⬜ not started · 🔶 in progress · ✅ done

## Security (fix first)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Proper logins with passwords.** Today anyone can sign in as anyone just by typing their username. | 🔶 | Built 4 Nov 2026 with Supabase's login system (email + password, working "Remember me", forgot-password emails). 34/34 automated tests pass on the local test database. **Still to do:** Ethan tries it in his browser; when the new Supabase project is made (item 8): turn off "Confirm email" (or add an email provider), set the Site URL, and load the reset-email template. Old username-only accounts can't sign in; everyone makes a fresh account. |
| 2 | **Lock down the database.** 3 tables have "temp public write" rules, 6 have no protection, and the database's "who are you" check trusts whatever the browser says. | ⬜ | Site does everything through its own server, so this should be invisible to players. |
| 3 | **Remove unused and risky server routes** (about 12), including the sign-in-as-anyone route, an unprotected "overwrite player stats" route, the debug page, and a broken team-rename route. | ⬜ | |

## Bugs

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4 | **Crash risks** in the player card pop-up, league settings pop-up and transactions page. | ⬜ | Fix without changing how they look. |
| 5 | **Save weekly results.** Scores are recalculated every time, so old results can change and there is no season history. | ⬜ | |

## Getting ready for 2027

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | **One season settings file.** "2026" is typed into about 30 files, plus Google Sheet links. | ⬜ | |
| 7 | **Tidy up.** Duplicate code, 2 unused database tables, 4 empty junk files, split the biggest pages (up to 4,400 lines). | ⬜ | |
| 8 | **New clean Supabase project** with only the tables we need, then copy the data across. | ⬜ | After 1, 2, 5 and 7. |
| 9 | **Before the season:** re-enable the GitHub stats-sync workflow (GitHub turned it off after 60 quiet days) and update fixtures/players for 2027. | ⬜ | |
| 10 | **Upgrade Node.js to version 22** on Ethan's PC and on Vercel. Supabase's code now warns that Node 20 support is ending. | ⬜ | Quick; do before the season. |

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
