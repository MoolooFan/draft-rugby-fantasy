// scripts/make-admin.ts
// Makes an account a site admin (gets the Admin page). Run once for Ethan's account after
// he signs up on the new site:
//   npx tsx scripts/make-admin.ts you@example.com            (local test database)
//   npx tsx scripts/make-admin.ts you@example.com --live     (the real project; it says how to confirm)
// Add --remove to take admin away. (On Node 20, first set NODE_OPTIONS=--experimental-websocket.)
import { scriptDb } from "./lib/db";

const { db } = scriptDb(); // local test database, or --live --confirm=<project> for the real one

async function main() {
  const email = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
  const remove = process.argv.includes("--remove");
  if (!email.includes("@")) throw new Error("Usage: npx tsx scripts/make-admin.ts you@example.com [--remove]");

  // find the login with that email
  let authId: string | null = null;
  for (let page = 1; !authId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    authId = data.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!authId) throw new Error(`No account with the email ${email}`);

  const { data, error } = await db.from("users").update({ is_site_admin: !remove }).eq("auth_user_id", authId).select("username");
  if (error) throw error;
  if (!data?.length) throw new Error("That login has no profile yet");
  console.log(`${data[0].username} is ${remove ? "no longer" : "now"} a site admin.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
