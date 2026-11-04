// lib/auth/validate.ts
// Rules for sign-up / sign-in fields. Shared by the sign-in page and the server routes.

export const MIN_PASSWORD_LENGTH = 8;

export const TIMEZONE_VALUES = [
  "Australia/Perth",
  "Australia/Sydney",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "New Zealand/Auckland",
] as const;

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export function validateUsername(input: string): Result<{ clean: string; key: string }> {
  const clean = String(input ?? "").trim().replace(/\s+/g, " ");
  const key = clean.toLowerCase();

  if (!clean) return { ok: false, message: "Please enter a username." };
  if (clean.length < 3) return { ok: false, message: "Username must be at least 3 characters." };
  if (clean.length > 20) return { ok: false, message: "Username must be 20 characters or less." };
  if (!/^[a-zA-Z0-9 _-]+$/.test(clean)) {
    return { ok: false, message: "Username can only use letters, numbers, spaces, _ or -." };
  }
  return { ok: true, value: { clean, key } };
}

export function validateEmail(input: string): Result<string> {
  const email = String(input ?? "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Please enter your email." };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "That doesn't look like an email address." };
  }
  return { ok: true, value: email };
}

export function validateNewPassword(input: string): Result<string> {
  const password = String(input ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > 72) return { ok: false, message: "Password must be 72 characters or less." };
  return { ok: true, value: password };
}
