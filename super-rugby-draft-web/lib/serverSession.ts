import "server-only";
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE = "sr_user";
const SIG = "sr_sig";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET env var");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function getServerUsername(): Promise<string | null> {
  const jar = await cookies();

  const user = jar.get(COOKIE)?.value ?? "";
  const sig = jar.get(SIG)?.value ?? "";
  if (!user || !sig) return null;

  const usernameNorm = user.trim().toLowerCase();
  const expected = sign(usernameNorm);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return usernameNorm;
}