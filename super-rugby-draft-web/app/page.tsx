"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { setActiveUser, getActiveUser } from "@/lib/session";

const TIMEZONES = [
  { value: "", label: "Timezone" },
  { value: "Australia/Perth", label: "Australia — Perth" },
  { value: "Australia/Sydney", label: "Australia — Sydney" },
  { value: "Australia/Brisbane", label: "Australia — Brisbane" },
  { value: "Australia/Melbourne", label: "Australia — Melbourne" },
  { value: "New Zealand/Auckland", label: "New Zealand — Auckland" },
];

// --- Local “accounts DB” (temporary until backend) ---
const ACCOUNTS_KEY = "mu_accounts_v1";

type Account = {
  username: string; // display username
  usernameKey: string; // normalized key for uniqueness/login
  firstName?: string;
  lastName?: string;
  timezone?: string;
  createdAtMs: number;
  lastLoginAtMs?: number;
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadAccounts(): Account[] {
  if (typeof window === "undefined") return [];
  return safeJsonParse<Account[]>(localStorage.getItem(ACCOUNTS_KEY), []);
}

function saveAccounts(next: Account[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
}

function normalizeUsernameKey(input: string) {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function validateUsername(input: string) {
  const clean = input.trim().replace(/\s+/g, " ");
  const key = normalizeUsernameKey(input);

  if (!clean) return { ok: false as const, message: "Please enter a username." };
  if (clean.length < 3)
    return { ok: false as const, message: "Username must be at least 3 characters." };
  if (clean.length > 20)
    return { ok: false as const, message: "Username must be 20 characters or less." };
  if (!/^[a-zA-Z0-9 _-]+$/.test(clean)) {
    return {
      ok: false as const,
      message: "Username can only use letters, numbers, spaces, _ or -.",
    };
  }

  return { ok: true as const, clean, key };
}

export default function Page() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // fields
  const [username, setUsername] = useState("");

  // create fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState("");

  // Animation control
  const [isMounted, setIsMounted] = useState(true);

  // If already logged in (session only), go straight to dashboard
  useEffect(() => {
    const user = getActiveUser();
    if (user) router.replace("/dashboard");
  }, [router]);

  // Default timezone when entering create mode
  useEffect(() => {
    if (mode === "create" && !timezone) setTimezone("Australia/Perth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const primaryButtonLabel = useMemo(() => {
    if (isLoading) return "Loading…";
    return "Continue";
  }, [isLoading]);

  function switchMode(next: "signin" | "create") {
    if (isLoading || next === mode) return;
    setErrorMsg(null);
    setIsMounted(false);
    window.setTimeout(() => {
      setMode(next);
      setIsMounted(true);
    }, 160);
  }

  async function handleContinue() {
    setErrorMsg(null);
    setIsLoading(true);

    await new Promise((r) => setTimeout(r, 350));

    const v = validateUsername(username);
    if (!v.ok) {
      setErrorMsg(v.message);
      setIsLoading(false);
      return;
    }

    const accounts = loadAccounts();
    const existing = accounts.find((a) => a.usernameKey === v.key);

    if (mode === "signin") {
      if (!existing) {
        setErrorMsg("Account not found. Please create an account first.");
        setIsLoading(false);
        return;
      }

      // Update last login timestamp
      saveAccounts(
        accounts.map((a) =>
          a.usernameKey === v.key ? { ...a, lastLoginAtMs: Date.now() } : a
        )
      );

      // ✅ Session-only login (no remember)
      setActiveUser({
        username: existing.username,
        firstName: existing.firstName,
        lastName: existing.lastName,
        timezone: existing.timezone,
      });

      router.replace("/dashboard");
      return;
    }

    // mode === "create"
    if (existing) {
      setErrorMsg("That username is already taken. Try a different one.");
      setIsLoading(false);
      return;
    }

    if (!timezone) {
      setErrorMsg("Please select a timezone.");
      setIsLoading(false);
      return;
    }

    const newAccount: Account = {
      username: v.clean,
      usernameKey: v.key,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      timezone,
      createdAtMs: Date.now(),
      lastLoginAtMs: Date.now(),
    };

    saveAccounts([...accounts, newAccount]);

    // ✅ Session-only login (no remember)
    setActiveUser({
      username: newAccount.username,
      firstName: newAccount.firstName,
      lastName: newAccount.lastName,
      timezone: newAccount.timezone,
    });

    router.replace("/dashboard");
  }

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-slate-900 via-teal-900 to-emerald-600 text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-14">
        <h1 className="mb-10 text-2xl font-semibold italic tracking-wide">
          Draft Fantasy 2026
        </h1>

        <div className="rounded-2xl bg-white/25 p-5 backdrop-blur-md shadow-xl">
          <div
            className={[
              "transition-all duration-200 ease-out",
              isMounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
            ].join(" ")}
          >
            {mode === "signin" ? (
              <>
                <h2 className="mb-3 text-lg font-semibold">Sign In</h2>

                <input
                  type="text"
                  placeholder="Username"
                  disabled={isLoading}
                  value={username}
                  className="h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setErrorMsg(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleContinue();
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                />

                {errorMsg && (
                  <p className="mt-1 text-xs font-medium text-red-200">
                    {errorMsg}
                  </p>
                )}

                <button
                  onClick={handleContinue}
                  disabled={isLoading}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-blue-700 text-sm font-semibold disabled:opacity-70"
                >
                  {isLoading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {primaryButtonLabel}
                </button>

                <button
                  onClick={() => switchMode("create")}
                  disabled={isLoading}
                  className="mt-3 h-11 w-full rounded-full border border-white/70 text-sm font-semibold disabled:opacity-70"
                >
                  Create Account
                </button>
              </>
            ) : (
              <>
                <h2 className="mb-3 text-lg font-semibold">Create Account</h2>

                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Username"
                    disabled={isLoading}
                    value={username}
                    className="h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70"
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setErrorMsg(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleContinue();
                    }}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />

                  <input
                    type="text"
                    placeholder="First Name (optional)"
                    disabled={isLoading}
                    value={firstName}
                    className="h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70"
                    onChange={(e) => setFirstName(e.target.value)}
                  />

                  <input
                    type="text"
                    placeholder="Last Name (optional)"
                    disabled={isLoading}
                    value={lastName}
                    className="h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70"
                    onChange={(e) => setLastName(e.target.value)}
                  />

                  <select
                    disabled={isLoading}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                {errorMsg && (
                  <p className="mt-2 text-xs font-medium text-red-200">
                    {errorMsg}
                  </p>
                )}

                <button
                  onClick={handleContinue}
                  disabled={isLoading}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-blue-700 text-sm font-semibold disabled:opacity-70"
                >
                  {isLoading && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  )}
                  {primaryButtonLabel}
                </button>

                <button
                  onClick={() => switchMode("signin")}
                  disabled={isLoading}
                  className="mt-3 h-11 w-full rounded-full border border-white/70 text-sm font-semibold disabled:opacity-70"
                >
                  Back to Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}