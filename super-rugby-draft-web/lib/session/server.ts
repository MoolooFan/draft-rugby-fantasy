// lib/session/server.ts
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "sr_user";
const SIG = "sr_sig";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function getServerUsername(): Promise<string | null> {
  const jar = await cookies();

  const username = jar.get(COOKIE)?.value ?? "";
  const sig = jar.get(SIG)?.value ?? "";

  if (!username || !sig) return null;
  if (sign(username) !== sig) return null;

  return username;
}