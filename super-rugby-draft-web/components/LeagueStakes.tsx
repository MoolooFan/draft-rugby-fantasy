"use client";
// components/LeagueStakes.tsx
// League rewards / punishments (lib/league/stakes.ts):
//  - LeagueStakesSection: in League Settings. The commissioner writes / changes them (own Save
//    button); everyone sees them and who has agreed.
//  - LeagueStakesPrompt: on every page (app/layout.tsx). A league mate who hasn't agreed to the
//    current wording gets a pop-up with only "I agree", until they do.
import React, { useCallback, useEffect, useState } from "react";
import { useLeagueStore } from "@/lib/league/store";
import { hasStakes, needsAgreement, STAKES_MAX, type LeagueStakes } from "@/lib/league/stakes";

async function fetchStakes(leagueId: string): Promise<LeagueStakes | null> {
  try {
    const j = await fetch(`/api/leagues/stakes?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" }).then((r) => r.json());
    return j?.ok ? (j.stakes as LeagueStakes) : null;
  } catch {
    return null;
  }
}

const textBox: React.CSSProperties = {
  width: "100%",
  minHeight: 70,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  padding: 8,
  fontSize: 13,
  fontWeight: 500,
  color: "#0f172a",
  background: "#ffffff",
  resize: "vertical",
  boxSizing: "border-box",
};

function StakesText({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "pre-wrap", lineHeight: 1.4, marginTop: 2 }}>{text}</div>
    </div>
  );
}

export function LeagueStakesSection({ leagueId }: { leagueId: string }) {
  const [stakes, setStakes] = useState<LeagueStakes | null>(null);
  const [rewards, setRewards] = useState<string | null>(null);
  const [punishments, setPunishments] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    void fetchStakes(leagueId).then((s) => live && setStakes(s));
    return () => {
      live = false;
    };
  }, [leagueId]);

  if (!stakes) return <div style={{ fontSize: 12, opacity: 0.7 }}>Loading…</div>;

  const dirty = rewards != null || punishments != null;
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch("/api/leagues/stakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leagueId, rewards: rewards ?? stakes!.rewards ?? "", punishments: punishments ?? stakes!.punishments ?? "" }),
      }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error);
      setStakes(j.stakes);
      setRewards(null);
      setPunishments(null);
      setMsg({ kind: "ok", text: hasStakes(j.stakes) ? "Saved. Everyone else will be asked to agree." : "Removed." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error && e.message ? e.message : "Couldn't save. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const agreed = stakes.teams.filter((t) => t.agreed).length;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {stakes.isCommissioner ? (
        <>
          <textarea
            aria-label="Rewards"
            placeholder="Rewards, e.g. the champion takes the $20 pot"
            maxLength={STAKES_MAX}
            value={rewards ?? stakes.rewards ?? ""}
            onChange={(e) => setRewards(e.target.value)}
            style={textBox}
          />
          <textarea
            aria-label="Punishments"
            placeholder="Punishments, e.g. last place wears a Blues jersey to the pub"
            maxLength={STAKES_MAX}
            value={punishments ?? stakes.punishments ?? ""}
            onChange={(e) => setPunishments(e.target.value)}
            style={textBox}
          />
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            style={{ height: 34, borderRadius: 999, border: "none", background: "#22C55E", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: busy || !dirty ? 0.6 : 1 }}
          >
            {busy ? "Saving…" : "Save rewards & punishments"}
          </button>
          {msg ? <div style={{ fontSize: 12, fontWeight: 600, color: msg.kind === "ok" ? "#16a34a" : "#dc2626" }}>{msg.text}</div> : null}
        </>
      ) : hasStakes(stakes) ? (
        <div style={{ display: "grid", gap: 8 }}>
          <StakesText title="Rewards" text={stakes.rewards} />
          <StakesText title="Punishments" text={stakes.punishments} />
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.75 }}>None set by the commissioner.</div>
      )}

      {hasStakes(stakes) ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
            Agreed: {agreed} of {stakes.teams.length}
          </div>
          <div style={{ display: "grid", gap: 2, marginTop: 4 }}>
            {stakes.teams.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                  {t.ownerName ? <span style={{ opacity: 0.65 }}> · {t.ownerName}</span> : null}
                </span>
                <span style={{ fontWeight: 700, color: t.agreed ? "#16a34a" : "#f59e0b", flexShrink: 0 }}>{t.agreed ? "Agreed" : "Waiting"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LeagueStakesPrompt() {
  const leagueId = useLeagueStore((s) => s.activeLeagueId);
  const [stakes, setStakes] = useState<LeagueStakes | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!leagueId) return; // (nothing shows without a league: see below)
    const s = await fetchStakes(leagueId);
    setStakes(s && s.myTeamId ? s : null);
  }, [leagueId]);

  // now, when the app comes back into view, and every 5 minutes (fetched here, its result set when
  // it arrives)
  useEffect(() => {
    if (!leagueId) return;
    let live = true;
    const run = () => {
      fetchStakes(leagueId).then((s) => {
        if (live) setStakes(s && s.myTeamId ? s : null);
      });
    };
    run();
    window.addEventListener("focus", run);
    const timer = window.setInterval(run, 5 * 60_000);
    return () => {
      live = false;
      window.removeEventListener("focus", run);
      window.clearInterval(timer);
    };
  }, [leagueId]);

  if (!leagueId || !stakes || stakes.myTeamId == null || !needsAgreement(stakes)) return null;

  async function agree() {
    if (!stakes || !leagueId) return;
    setBusy(true);
    setError(null);
    try {
      const j = await fetch("/api/leagues/stakes/agree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leagueId, version: stakes.version }),
      }).then((r) => r.json());
      if (!j?.ok) {
        setError(j?.error ?? "Couldn't save. Please try again.");
        if (j?.changed) await refresh();
        return;
      }
      setStakes({ ...stakes, myAgreedVersion: stakes.version });
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const changed = stakes.myAgreedVersion > 0;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050, background: "rgba(15,23,42,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        role="dialog"
        aria-label="League rewards and punishments"
        style={{ width: "100%", maxWidth: 400, maxHeight: "88svh", overflowY: "auto", borderRadius: 18, background: "#ffffff", color: "#0f172a", padding: 16, display: "grid", gap: 12, boxShadow: "0 20px 50px rgba(15,23,42,0.35)" }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{changed ? "League stakes have changed" : "League stakes"}</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#64748b", marginTop: 2 }}>
            {changed ? "Your commissioner has updated the rewards and punishments." : "Your commissioner has set rewards and punishments for this league."} Please read them and agree.
          </div>
        </div>
        <div style={{ display: "grid", gap: 10, background: "#f6f8fa", border: "1px solid #e5e9ef", borderRadius: 12, padding: 12 }}>
          <StakesText title="Rewards" text={stakes.rewards} />
          <StakesText title="Punishments" text={stakes.punishments} />
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>Everyone in the league can see who has agreed (League Settings).</div>
        {error ? <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>{error}</div> : null}
        <button
          type="button"
          onClick={agree}
          disabled={busy}
          style={{ height: 42, borderRadius: 999, border: "none", background: "#16a34a", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Saving…" : "I agree"}
        </button>
      </div>
    </div>
  );
}
