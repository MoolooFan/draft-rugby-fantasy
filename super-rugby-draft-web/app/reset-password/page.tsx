"use client";

// Players land here from the "reset your password" email (via /auth/confirm,
// which has already signed them in with the one-time link).
import { useState } from "react";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/auth/validate";

const INPUT_CLASS =
  "h-11 w-full rounded-md bg-white px-3 text-sm text-slate-900 outline-none disabled:opacity-70";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSave() {
    if (isLoading) return;
    setErrorMsg(null);

    const p = validateNewPassword(password);
    if (!p.ok) return setErrorMsg(p.message);
    if (password !== confirm) return setErrorMsg("The two passwords don't match.");

    setIsLoading(true);
    const r = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.ok) {
      setIsLoading(false);
      setErrorMsg(j?.error ?? "Couldn't update your password. Please try again.");
      return;
    }

    window.location.assign("/dashboard");
  }

  const onEnter = (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter") handleSave();
  };

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-slate-900 via-teal-900 to-emerald-600 text-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-14">
        <h1 className="mb-10 text-2xl font-semibold italic tracking-wide">
          Draft Fantasy 2026
        </h1>

        <div className="rounded-2xl bg-white/25 p-5 backdrop-blur-md shadow-xl">
          <h2 className="mb-3 text-lg font-semibold">Choose a New Password</h2>

          <div className="space-y-3">
            <input
              type="password"
              placeholder={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
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
              type="password"
              placeholder="Type it again"
              disabled={isLoading}
              value={confirm}
              className={INPUT_CLASS}
              onChange={(ev) => {
                setConfirm(ev.target.value);
                setErrorMsg(null);
              }}
              onKeyDown={onEnter}
              autoComplete="new-password"
            />
          </div>

          {errorMsg && (
            <p className="mt-2 text-xs font-medium text-red-200">
              {errorMsg}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={isLoading}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-slate-900 to-blue-700 text-sm font-semibold disabled:opacity-70"
          >
            {isLoading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {isLoading ? "Loading…" : "Save New Password"}
          </button>
        </div>
      </div>
    </main>
  );
}
