# Going live with the 2027 site

## Where we're up to (10 Nov 2026)

**Setup is done. Launch is on hold** until Ethan's changes and additions are finished and checked on the test site.

| Done | What |
|---|---|
| ✅ | Node.js 22 on Ethan's PC |
| ✅ | New Supabase project **Draft Rugby Fantasy 2027** (ref `dbmzgofmjbeeskhwohuv`, **Sydney**): tables, security rules, scheduler job built |
| ✅ | Players (2027 pool = 2026 list for now), player photos (450 links), honours list imported |
| ✅ | Logins: Confirm email off; Site URL and Redirect URL `https://sr-draft-fantasy.vercel.app`; Gmail SMTP; password-reset email template |
| ✅ | Scheduler passwords (Vault `site_url`, `cron_secret`); job `results-tick` every 5 minutes |
| ✅ | Vercel: new keys + `CRON_SECRET` (all environments), old `SESSION_SECRET` and `FIXTURES_SHEET_CSV_URL` deleted, function region **Sydney (syd1)**, address **sr-draft-fantasy.vercel.app** (old `…-foa5` address redirects) |
| ✅ | Ethan's account **Stoutman** made site admin (on the test site) |

- **Test site:** https://draft-rugby-fantasy-foa5-git-rebuild-2027-mooloofans-projects.vercel.app (only Ethan can open it while signed in to Vercel; it shows the latest `rebuild-2027` code and uses the **new** database).
- **The live site** (sr-draft-fantasy.vercel.app) still runs the old code on the old database until launch.
- ⚠️ **Until launch, don't redeploy `main` in Vercel** (e.g. the "Redeploy" button). Vercel now has the new database's keys, and the old code wouldn't work with them.

## Launch day (about 15 minutes)

Do this a few weeks before the 2027 draft, so everyone has time to make accounts.

1. **Supabase awake?** Open the new project in the Supabase dashboard. If it says **Paused**, click **Restore** and wait for it to finish (free projects pause after about a week without use; nothing is lost).
2. **Final check on the test site:** sign in, open the dashboard, Admin page and player cards.
3. **Clear test data:** ask Claude to remove any test leagues or test accounts from the new database (keep Stoutman).
4. **Official 2027 player list:** if it's out, ask Claude to import it, then set the draft ranks on the Admin page (photos: Ethan supplies the links).
5. **Merge on GitHub (this is the actual launch):**
   1. Go to **github.com/MoolooFan/draft-rugby-fantasy**, then **Pull requests → New pull request**.
   2. Set **base: `main`** and **compare: `rebuild-2027`**. Click **Create pull request**, then **Create pull request** again.
   3. Click **Merge pull request**, then **Confirm merge**.
   4. In Vercel, open **Deployments** and wait for the top one (branch `main`) to say **Ready**, about 2 minutes.
6. **Check the live site** at https://sr-draft-fantasy.vercel.app:
   - Sign in as Stoutman. The Admin page should be there.
   - **Forgot password:** use it on your own email. The email should arrive from the league Gmail, and its link should let you set a new password.
   - After 10 minutes, ask Claude to check the scheduler is reaching the site (or in Supabase **SQL Editor** run `select status_code, created from net._http_response order by created desc limit 5;`, which should show `200`s).
7. **Tell the group:** new site, same address, everyone **creates a new account** (old usernames don't carry over). Then create the 2027 league and send them the join code.

**If something goes badly wrong:** Vercel → **Deployments** → find the previous **Production** deployment (older date) → **⋯ → Instant Rollback**. That puts the old site back as it was, on the old database. (Note: if you ever roll back, change nothing in Vercel's environment variables. The old deployment keeps the settings it was built with.)

**After launch (no rush):**
- In Vercel, check the leftover project **draft-rugby-fantasy** (without "foa5"). If no-one uses its address, delete it: **Settings → General → Delete Project**. It fails to build on every push.
- On GitHub, the old stats robot's secrets can go: repo **Settings → Secrets and variables → Actions**, then delete them.
- Delete the old Supabase project (**Draft Rugby Fantasy**, Mumbai) once you're sure you don't need it. The 2026 data is also saved in `backups/`.

---

# The original setup guide (steps already done, kept for reference)

This guide moves the site over to a **new, empty Supabase project** and puts the rebuilt code live.
Everyone makes a new account on the new site. The 2026 honours list (champion, runner-up and so on) comes across.

**Time needed:** about an hour. Do it when nobody needs the site, because it's down for a few minutes near the end.

**You can stop between steps.** Nothing changes on the live site until step 9. Up to then, the old site keeps running on the old project.

**I can do the terminal steps for you.** These are the steps with a `npx …` command. Ask me in Claude Code, and I'll run them and show you the result.

---

## Before you start

- **Node.js 22.** In the VS Code terminal, type `node -v` and press Enter. If it doesn't start with `v22`:
  1. Go to **nodejs.org/en/download**.
  2. Pick **v22 (LTS)** and **Windows Installer (.msi)**.
  3. Run it and click Next through it.
  4. Close VS Code and open it again, then check `node -v` once more.
- **Open the terminal in the right folder.** In VS Code, open a terminal (**Terminal → New Terminal**), then type:
  ```
  cd super-rugby-draft-web
  ```
  Every command below runs from there.

---

## 1. Create the new Supabase project

1. Go to **supabase.com/dashboard** and click **New project**.
2. **Name:** e.g. `Draft Rugby Fantasy 2027`.
3. **Database password:** click **Generate a password**, then copy it and save it somewhere safe, like a password manager. You need it in step 3.
4. **Region:** **Asia-Pacific (Sydney)** (`ap-southeast-2`), which is closest to the players. Double-check this: the region can't be changed after the project is made, and a faraway database slows down every click.
5. Click **Create new project** and wait a couple of minutes while it sets up.
6. Look at the address bar. It shows `supabase.com/dashboard/project/`**`abcdefghijklmnop`**. That last part is the **project ref**. Copy it; you need it later.

> The free plan allows 2 active projects. If Supabase says you've hit the limit, pause one you don't use: open that project, go to **Project Settings → General**, then **Pause project**. Leave the old Draft Fantasy project running until the end of step 9.

## 2. Copy the new project's keys into `.env.local`

`.env.local` (in `super-rugby-draft-web`) holds the keys the scripts use. It points at the **old** project right now.

1. In VS Code's file list, right-click `.env.local` → **Copy**, then right-click the folder → **Paste**. Rename the copy to `.env.old-project`. This keeps the old keys in case you ever need them.
2. In the Supabase dashboard (new project), open **Project Settings → API Keys**:
   - **Publishable key** (starts `sb_publishable_`): copy it.
   - **Secret key** (starts `sb_secret_`): click the eye icon / **Reveal**, then copy it. Never share this one.
3. Make a **cron password**. This lets the scheduler talk to the site. In the terminal:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   It prints a long random string. Copy it.
4. Open `.env.local` and make it say exactly this, with your values in place of the `<…>` parts:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<secret key>
   CRON_SECRET=<cron password>
   ```
   Delete the old `SESSION_SECRET` and `FIXTURES_SHEET_CSV_URL` lines; the new site doesn't use them. Save the file.

## 3. Build the database (tables, security rules, scheduler)

This folder is still linked to the **old** project. Link it to the new one first.

```
npx supabase login
```
A browser window opens. Click **Authorize**.

```
npx supabase link --project-ref <project ref>
```
Paste the database password from step 1 when it asks. Nothing shows while you paste; that's normal. Press Enter.

**Check it's the new project before going on:**
```
npx supabase projects list
```
The new project should have a **●** next to it in the `LINKED` column. If the old one does, stop and run the `link` command again.

```
npx supabase db push --remote
```
(Without `--remote`, the Supabase tool updates the test database on this PC instead.) It lists 11 changes and asks `Do you want to push these migrations?` Type `Y` and press Enter. It ends with `Finished supabase db push.`

## 4. Login settings (Supabase dashboard, new project)

1. **Authentication → Sign In / Providers → Email:** turn **Confirm email** OFF, then click **Save**.
   (The site signs people straight in when they create an account.)
2. **Authentication → URL Configuration:**
   - **Site URL:** the site's address, e.g. `https://your-site.vercel.app`, with no `/` at the end. Click **Save**.
   - **Redirect URLs → Add URL:** the same address followed by `/**`, e.g. `https://your-site.vercel.app/**`.
3. **Authentication → Emails → Templates → Reset Password:**
   - **Subject:** `Reset your Draft Fantasy password`
   - **Body:** delete what's there. Open `super-rugby-draft-web/supabase/templates/recovery.html` in VS Code, copy everything, and paste it in. Click **Save**.
4. **Emails to your mates (recommended):** Supabase's built-in email only sends to your own Supabase account's addresses, and only a few an hour. That means password-reset emails won't reach the other players.
   - If the **old** project has **Authentication → Emails → SMTP Settings** filled in, copy the same settings into the new project.
   - If not, ask me and I'll walk you through a free email service (e.g. Resend). It's about 10 minutes.

## 5. Scheduler passwords (Supabase dashboard, new project)

The scheduler calls the site every 5 minutes: stats, team lists, finalising rounds, draft auto-picks. It needs the site's address and the cron password.

1. Click **SQL Editor** in the left bar, then **New query**.
2. Paste this, putting in your site address (no `/` at the end) and the cron password from step 2:
   ```sql
   select vault.create_secret('https://your-site.vercel.app', 'site_url');
   select vault.create_secret('<cron password>', 'cron_secret');
   ```
3. Click **Run**.
4. Check it worked: replace the text with `select name from vault.secrets;` and click **Run**. You should see two rows, `site_url` and `cron_secret`.

## 6. Put the players and honours in

In the terminal:
```
npx tsx scripts/import-players.ts --live
```
It stops and says `This will change the LIVE project <ref>.supabase.co. To go ahead, run it again with --confirm=<ref>.supabase.co`. This check is there so it can't be run on the wrong project by accident. Check the address is the **new** project's ref, then run what it says:
```
npx tsx scripts/import-players.ts --live --confirm=<ref>.supabase.co
```
It should say `2027: 453 players (45 hidden: Moana Pasifika)`.

```
npx tsx scripts/import-history.ts --live --confirm=<ref>.supabase.co
```
It should say `No 2026 league in this database: imported the honours only (8 rows).`

## 7. Vercel settings

1. Go to **vercel.com**, open the project, then **Settings → Environment Variables**.
2. Edit these three. Click each one's **⋯ → Edit**, paste the new value, and tick **Production** and **Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL` → `https://<project ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` → the secret key
3. **Add New:** `CRON_SECRET` → the cron password (the same one you put in step 5).
4. Delete `SESSION_SECRET` and `FIXTURES_SHEET_CSV_URL` if they're there, plus any old Google Sheets ones. Click each one's **⋯ → Delete**.

5. **Put Vercel's servers in Sydney too** (next to the database): **Settings → Functions** (on some screens **Settings → General**) → **Function Region** → choose **Sydney, Australia (syd1)** → **Save**.

The old site keeps working while you do this: Vercel only uses new settings when the next version goes live (step 8). The site now tells Vercel to use Node 22 on its own, so there's nothing to change for that.

## 8. Put the new site live

1. Go to **github.com/MoolooFan/draft-rugby-fantasy**, then **Pull requests → New pull request**.
2. Set **base: `main`** and **compare: `rebuild-2027`**. Click **Create pull request**, then **Create pull request** again.
3. Click **Merge pull request**, then **Confirm merge**.
4. Vercel builds it automatically, which takes about 2 minutes. You can watch it in Vercel under **Deployments**; it's done when the top one says **Ready**.

(Or ask me to merge it for you.)

## 9. Make yourself the admin

1. Open the site and click **Create Account**. Sign up with your email.
2. In the terminal:
   ```
   npx tsx scripts/make-admin.ts <your email> --live --confirm=<ref>.supabase.co
   ```
   It should say `<your username> is now a site admin.`
3. Refresh the site. The **Admin** page is now there.

## 10. Quick checks

- [ ] Log out and log in again.
- [ ] **Forgot password:** the email arrives (needs step 4.4), and the link lets you set a new password.
- [ ] **Admin → Players** shows the 2027 list. **Admin → Difficulty** shows your ratings.
- [ ] Create a test league. Check you can pick scoring, finals and bonus points.
- [ ] **The scheduler is running.** After 10 minutes, in Supabase **SQL Editor**, run:
  ```sql
  select status_code, created from net._http_response order by created desc limit 5;
  ```
  You should see `200`s.
  - `401` means the cron password in step 5 doesn't match Vercel's `CRON_SECRET`.
  - Nothing at all means `site_url` is missing.

Tell me how it went and I'll help with anything that's off. I can also delete the test league afterwards.

---

## If something goes badly wrong

Vercel → **Deployments**: find the previous version that was live (marked **Production**, older date), click **⋯ → Instant Rollback**. That puts the old site back exactly as it was, on the old project, while we sort it out.

## Afterwards

- Keep the old project for a few weeks, then delete it. The 2026 data is also saved in the `backups` folder. (Free projects pause themselves after a week without use. A paused project can be switched back on for 90 days.)
- On GitHub, the old stats robot's secrets can go: repo **Settings → Secrets and variables → Actions**, then delete any that are there.
- When the official 2027 player list comes out, I'll import it. You then set the draft ranks on the Admin page.
