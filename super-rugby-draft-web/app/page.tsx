"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateNewPassword,
  validateUsername,
} from "@/lib/auth/validate";

const TIMEZONES = [
  { value: "", label: "Timezone" },
  { value: "Australia/Perth", label: "Australia — Perth" },
  { value: "Australia/Sydney", label: "Australia — Sydney" },
  { value: "Australia/Brisbane", label: "Australia — Brisbane" },
  { value: "Australia/Melbourne", label: "Australia — Melbourne" },
  { value: "New Zealand/Auckland", label: "New Zealand — Auckland" },
];

type Mode = "signin" | "create" | "forgot";

const INPUT_CLASS =
  "h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70";

/** Clear app data cached in this browser so a new sign-in starts clean. */
function clearCachedAppState() {
  try {
    localStorage.removeItem("sr-leagues-v3");
    localStorage.removeItem("sr-draft-store-v3");
    localStorage.removeItem("mu_accounts_v1"); // old device-only account list (pre-2027)
  } catch {}
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  return { ok: r.ok && Boolean(j?.ok), data: j };
}

export default function Page() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
useEffect(() => {
  const saved = localStorage.getItem("sr_remember_me") === "1";
  setRememberMe(saved);
}, []);

useEffect(() => {
  localStorage.setItem("sr_remember_me", rememberMe ? "1" : "0");
}, [rememberMe]);

  // fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // create fields
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [timezone, setTimezone] = useState("");

  // Animation control
  const [isMounted, setIsMounted] = useState(true);

// If already signed in via server cookies, go straight to dashboard
useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      const res = await fetch("/api/session/me", { cache: "no-store" });
      if (!cancelled && res.ok) {
        router.replace("/dashboard");
      }
    } catch {
      // ignore - user will just stay on login screen
    }
  })();

  return () => {
    cancelled = true;
  };
}, [router]);

  // Arrived from an email link that had expired or was already used
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("link") === "expired") {
      setErrorMsg("That email link has expired or was already used. Please try again.");
    }
  }, []);

  // Default timezone when entering create mode
  useEffect(() => {
    if (mode === "create" && !timezone) setTimezone("Australia/Perth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const primaryButtonLabel = useMemo(() => {
    if (isLoading) return "Loading…";
    if (mode === "forgot") return "Send Reset Link";
    return "Continue";
  }, [isLoading, mode]);

  function switchMode(next: Mode) {
    if (isLoading || next === mode) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setPassword("");
    setIsMounted(false);
    window.setTimeout(() => {
      setMode(next);
      setIsMounted(true);
    }, 160);
  }

  function stop(message: string) {
    setErrorMsg(message);
    setIsLoading(false);
  }

  async function handleContinue() {
    if (isLoading) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsLoading(true);

    const e = validateEmail(email);
    if (!e.ok) return stop(e.message);

    if (mode === "forgot") {
      const r = await postJson("/api/auth/forgot-password", { email: e.value });
      if (!r.ok) return stop(r.data?.error ?? "Couldn't send the reset email. Please try again.");
      setIsLoading(false);
      setInfoMsg("If there's an account with that email, a reset link is on its way. Check your inbox.");
      return;
    }

    if (mode === "signin") {
      if (!password) return stop("Please enter your password.");

      const r = await postJson("/api/auth/login", { email: e.value, password, rememberMe });
      if (!r.ok) return stop(r.data?.error ?? "Failed to sign in.");

      clearCachedAppState();
      // Full page load so the whole app picks up the new sign-in.
      window.location.assign("/dashboard");
      return;
    }

    // mode === "create"
    const u = validateUsername(username);
    if (!u.ok) return stop(u.message);

    const p = validateNewPassword(password);
    if (!p.ok) return stop(p.message);

    if (!timezone) return stop("Please select a timezone.");

    const r = await postJson("/api/auth/signup", {
      username: u.value.clean,
      email: e.value,
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      timezone,
      rememberMe,
    });
    if (!r.ok) return stop(r.data?.error ?? "Failed to create account.");

    if (r.data?.needsEmailConfirmation) {
      setIsLoading(false);
      setPassword("");
      setMode("signin");
      setInfoMsg("Account created! Check your email for a confirmation link, then sign in.");
      return;
    }

    clearCachedAppState();
    window.location.assign("/dashboard");
  }

  const onEnter = (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter") handleContinue();
  };

  const messages = (
    <>
      {errorMsg && (
        <p className="mt-2 text-xs font-medium text-red-200">
          {errorMsg}
        </p>
      )}
      {infoMsg && (
        <p className="mt-2 text-xs font-medium text-white/90">
          {infoMsg}
        </p>
      )}
    </>
  );

  const primaryButton = (
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
  );

  const emailInput = (
    <input
      type="email"
      placeholder="Email"
      disabled={isLoading}
      value={email}
      className={INPUT_CLASS}
      onChange={(ev) => {
        setEmail(ev.target.value);
        setErrorMsg(null);
      }}
      onKeyDown={onEnter}
      autoComplete="email"
      autoCapitalize="none"
      autoCorrect="off"
    />
  );

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
            {mode === "signin" && (
              <>
                <h2 className="mb-3 text-lg font-semibold">Sign In</h2>

                <div className="space-y-3">
                  {emailInput}

                  <input
                    type="password"
                    placeholder="Password"
                    disabled={isLoading}
                    value={password}
                    className={INPUT_CLASS}
                    onChange={(ev) => {
                      setPassword(ev.target.value);
                      setErrorMsg(null);
                    }}
                    onKeyDown={onEnter}
                    autoComplete="current-password"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-white/90">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      disabled={isLoading}
                      onChange={(ev) => setRememberMe(ev.target.checked)}
                      className="h-4 w-4 rounded border-white/50 bg-white/20"
                    />
                    Remember me
                  </label>

                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    disabled={isLoading}
                    className="text-sm font-semibold text-white/90 disabled:opacity-70"
                  >
                    Forgot password?
                  </button>
                </div>

                {messages}
                {primaryButton}

                <button
                  onClick={() => switchMode("create")}
                  disabled={isLoading}
                  className="mt-3 h-11 w-full rounded-full border border-white/70 text-sm font-semibold disabled:opacity-70"
                >
                  Create Account
                </button>
              </>
            )}

            {mode === "create" && (
              <>
                <h2 className="mb-3 text-lg font-semibold">Create Account</h2>

                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Username"
                    disabled={isLoading}
                    value={username}
                    className={INPUT_CLASS}
                    onChange={(ev) => {
                      setUsername(ev.target.value);
                      setErrorMsg(null);
                    }}
                    onKeyDown={onEnter}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />

                  {emailInput}

                  <input
                    type="password"
                    placeholder={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
                    disabled={isLoading}
                    value={password}
                    className={INPUT_CLASS}
                    onChange={(ev) => {
                      setPassword(ev.target.value);
                      setErrorMsg(null);
                    }}
                    onKeyDown={onEnter}
                    autoComplete="new-password"
                  />

                  <input
                    type="text"
                    placeholder="First Name (optional)"
                    disabled={isLoading}
                    value={firstName}
                    className={INPUT_CLASS}
                    onChange={(ev) => setFirstName(ev.target.value)}
                  />

                  <input
                    type="text"
                    placeholder="Last Name (optional)"
                    disabled={isLoading}
                    value={lastName}
                    className={INPUT_CLASS}
                    onChange={(ev) => setLastName(ev.target.value)}
                  />

                  <select
                    disabled={isLoading}
                    value={timezone}
                    onChange={(ev) => setTimezone(ev.target.value)}
                    className={INPUT_CLASS}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                {messages}
                {primaryButton}

                <button
                  onClick={() => switchMode("signin")}
                  disabled={isLoading}
                  className="mt-3 h-11 w-full rounded-full border border-white/70 text-sm font-semibold disabled:opacity-70"
                >
                  Back to Sign In
                </button>
              </>
            )}

            {mode === "forgot" && (
              <>
                <h2 className="mb-3 text-lg font-semibold">Reset Password</h2>

                <p className="mb-3 text-sm text-white/90">
                  Enter your account email and we&apos;ll send you a link to choose a new password.
                </p>

                {emailInput}

                {messages}
                {primaryButton}

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
