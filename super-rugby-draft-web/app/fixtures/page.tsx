"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveUser } from "@/lib/session";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";

import type { Fixture } from "@/lib/fixtures/types";

import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";

type TabKey = "Fixtures" | "Results" | "FDR";

type AnyFixture = Fixture & {
  id: string;
  week: number;
  kickoffAt: any; // number ms or ISO string
  status?: string; // "scheduled" | "live" | "final"

  homeTeamCode?: string;
  awayTeamCode?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  venue?: string;

  // Optional per-team difficulty ratings (1-5), can differ per side
  fdrHome?: 1 | 2 | 3 | 4 | 5;
  fdrAway?: 1 | 2 | 3 | 4 | 5;
};

function toMs(x: any): number {
  if (x == null) return 0;

  // Some APIs wrap values like { value: "..." }
  if (typeof x === "object") {
    // Firestore-ish timestamp: { seconds, nanoseconds }
    if (typeof x.seconds === "number") {
      const ms = x.seconds * 1000 + Math.floor((x.nanoseconds ?? 0) / 1e6);
      return Number.isFinite(ms) ? ms : 0;
    }
    if (typeof x.value !== "undefined") return toMs(x.value);
  }

  // Numbers
  if (typeof x === "number") {
    // Google Sheets serial day number (days since 1899-12-30)
    if (x > 20000 && x < 80000) {
      const ms = Math.round((x - 25569) * 86400 * 1000);
      return Number.isFinite(ms) ? ms : 0;
    }
    // seconds epoch
    if (x > 1e9 && x < 1e12) return x * 1000;
    // ms epoch
    if (x > 1e12) return x;
    return 0;
  }

  // Strings
  if (typeof x === "string") {
    const s0 = x.trim();
    if (!s0) return 0;

    // Try native parse first
    const native = Date.parse(s0);
    if (Number.isFinite(native)) return native;

    const s = s0.replace(/,/g, ""); // tolerate "14/02/2026, 7:05 PM"

    // DD/MM/YYYY HH:mm(:ss)? (24h)
    const dmy24 = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (dmy24) {
      const dd = Number(dmy24[1]);
      const mm = Number(dmy24[2]) - 1;
      const yyyy = Number(dmy24[3]);
      const hh = Number(dmy24[4] ?? 0);
      const min = Number(dmy24[5] ?? 0);
      const ss = Number(dmy24[6] ?? 0);
      const ms = new Date(yyyy, mm, dd, hh, min, ss, 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    // DD/MM/YYYY h:mm(:ss)? AM/PM
    const dmyAmPm = s.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))$/
    );
    if (dmyAmPm) {
      const dd = Number(dmyAmPm[1]);
      const mm = Number(dmyAmPm[2]) - 1;
      const yyyy = Number(dmyAmPm[3]);
      let hh = Number(dmyAmPm[4] ?? 0);
      const min = Number(dmyAmPm[5] ?? 0);
      const ss = Number(dmyAmPm[6] ?? 0);
      const ap = String(dmyAmPm[7]).toUpperCase();
      if (ap === "PM" && hh < 12) hh += 12;
      if (ap === "AM" && hh === 12) hh = 0;
      const ms = new Date(yyyy, mm, dd, hh, min, ss, 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    // YYYY-MM-DD HH:mm(:ss)?
    const ymd = s.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (ymd) {
      const yyyy = Number(ymd[1]);
      const mm = Number(ymd[2]) - 1;
      const dd = Number(ymd[3]);
      const hh = Number(ymd[4] ?? 0);
      const min = Number(ymd[5] ?? 0);
      const ss = Number(ymd[6] ?? 0);
      const ms = new Date(yyyy, mm, dd, hh, min, ss, 0).getTime();
      return Number.isFinite(ms) ? ms : 0;
    }

    return 0;
  }

  return 0;
}



function pad2(n: number) {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s;
}

function formatKickoffCompact(kickoffMs: number, timeZone?: string) {
  const d = new Date(kickoffMs);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function fdrBg(rating: number) {
  // Simple FPL-ish palette (tweak later if you want exact shades)
  if (rating <= 1) return "#375523"; // green
  if (rating === 2) return "#01FC7A"; // lime
  if (rating === 3) return "#E7E7E7"; // gray
  if (rating === 4) return "#FF1751"; // orange
  return "#80072D"; // red
}

function fdrText(rating: number) {
  return rating === 1 || rating === 4 || rating === 5
    ? "white"
    : "#0f172a";
}


function isFixtureComplete(f: AnyFixture) {
  const s = String(f.status ?? "").toLowerCase().trim();

  // ✅ your real enum is: scheduled | live | final
  if (s === "final") return true;

  // Backwards compatibility if any old data uses "complete"
  if (s === "complete" || s === "completed") return true;

  // Fallback: if both scores exist, treat it as complete
  if (f.homeScore != null && f.awayScore != null) return true;

  return false;
}


function toScore(x: any): number | null {
  if (x == null) return null;

  const s = String(x).trim();
  if (!s) return null;

  const lower = s.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "tbc") return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeFixture(raw: any): AnyFixture {
  const status = String(
    raw.status ??
      raw.Status ??
      raw["Status"] ??
      raw.matchStatus ??
      raw.gameStatus ??
      raw.fixtureStatus ??
      raw["Fixture Status"] ??
      ""
  ).trim();

  const homeScore = toScore(
    raw.homeScore ??
      raw.HomeScore ??
      raw["Home Score"] ??
      raw.home_score ??
      raw.homePoints ??
      raw["Home Points"] ??
      raw.home_team_score
  );

  const awayScore = toScore(
    raw.awayScore ??
      raw.AwayScore ??
      raw["Away Score"] ??
      raw.away_score ??
      raw.awayPoints ??
      raw["Away Points"] ??
      raw.away_team_score
  );

  // ✅ Step 4 goes HERE (inside normalizeFixture)
  const homeRaw =
    raw.homeTeamCode ??
    raw.homeTeam ??
    raw["Home Team"] ??
    raw.home;

  const awayRaw =
    raw.awayTeamCode ??
    raw.awayTeam ??
    raw["Away Team"] ??
    raw.away;

  const homeTeamCode = normalizeTeamCode(String(homeRaw ?? ""));
  const awayTeamCode = normalizeTeamCode(String(awayRaw ?? ""));

  return {
    ...raw,
    status,
    homeScore,
    awayScore,
    homeTeamCode: homeTeamCode ?? raw.homeTeamCode,
    awayTeamCode: awayTeamCode ?? raw.awayTeamCode,
    homeTeam: String(homeRaw ?? raw.homeTeam ?? ""),
    awayTeam: String(awayRaw ?? raw.awayTeam ?? ""),
  };
}


// -----------------------
// Team logos (public/images/logos)
// -----------------------
const TEAM_LOGOS: Record<string, string> = {
  BLU: "/images/logos/BLU.webp",
  BRU: "/images/logos/BRU.png",
  CHI: "/images/logos/CHI.png",
  CRU: "/images/logos/CRU.png",
  DRU: "/images/logos/DRU.png",
  FOR: "/images/logos/FOR.png",
  HIG: "/images/logos/HIG.png",
  HUR: "/images/logos/HUR.png",
  MOA: "/images/logos/MOA.png", // or point this to MOP.png if that's your filename
  RED: "/images/logos/RED.png",
  WAR: "/images/logos/WAR.png",
};

const TEAM_LOGO_PLACEHOLDER = "/images/logo-placeholder.png";

function teamLogoSrc(teamCodeOrName: string | null | undefined) {
  const raw = (teamCodeOrName ?? "").trim();

  // Normalize (your function should return e.g. BLU/CRU/MOA etc)
  let code = normalizeTeamCode(raw);

  // Safety fallback if normalizer ever returns something unexpected
  if (!code || code.length !== 3) {
    code = raw.toUpperCase().slice(0, 3);
  }

  return TEAM_LOGOS[code] ?? TEAM_LOGO_PLACEHOLDER;
}

export default function FixturesPage() {
  const router = useRouter();

  // Route protection
  useEffect(() => {
    const user = getActiveUser();
    if (!user) router.replace("/");
  }, [router]);

  // Menu + leagues (for AppMenu)
  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useLeagueStore((s) => s.activeLeague());
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  // User timezone (set during create account)
  // Assumption: getActiveUser() returns something like { timezone?: "Australia/Sydney" }
  const userTz = useMemo(() => {
    const u: any = getActiveUser();
    return u?.timezone || u?.timeZone || u?.tz || undefined;
  }, []);

  const [fixtures, setFixtures] = useState<AnyFixture[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  let cancelled = false;

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/sheets/fixtures", { cache: "no-store" });
      const json = await res.json();
      console.log("fixtures sample kickoffAt:", json?.fixtures?.[0]?.kickoffAt);
console.log("fixtures sample keys:", Object.keys(json?.fixtures?.[0] ?? {}));

      if (!json?.ok) throw new Error(json?.error || "Failed to load fixtures");
      if (!cancelled) setFixtures((json.fixtures ?? []).map(normalizeFixture));

    } catch (e) {
      if (!cancelled) setFixtures([]);
      console.error(e);
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, []);


  const normalized = useMemo(() => {
  return fixtures
    .map((f) => {
      const a = (f as any).kickoffAt;
      const b = (f as any).kickoffMs;
      const c = (f as any).kickoff;     // extra fallback (if your API uses this)
      const d = (f as any).date;        // extra fallback
      const e = (f as any).time;        // extra fallback

      let kickoffMs = toMs(a);
      if (!kickoffMs) kickoffMs = toMs(b);
      if (!kickoffMs) kickoffMs = toMs(c);
      if (!kickoffMs && d && e) kickoffMs = toMs(`${d} ${e}`);

      return { ...f, kickoffMs };
    })
    .sort((a: any, b: any) => a.kickoffMs - b.kickoffMs);
}, [fixtures]);


const allWeeks = useMemo(() => {
  const set = new Set<number>();
  for (const f of normalized) {
    const w = Number((f as any).week);
    if (Number.isFinite(w) && w > 0) set.add(w);
  }
  return Array.from(set).sort((a, b) => a - b);
}, [normalized]);



  // Determine which weeks are complete (all fixtures complete)
  const weekMeta = useMemo(() => {
    const map = new Map<number, { complete: boolean; fixtures: AnyFixture[] }>();
    for (const w of allWeeks) map.set(w, { complete: true, fixtures: [] });

    for (const f of normalized) {
      const w = Number((f as any).week);
if (!Number.isFinite(w) || w <= 0) continue;

      if (!map.has(w)) map.set(w, { complete: true, fixtures: [] });
      map.get(w)!.fixtures.push(f);
    }

    for (const [w, v] of map.entries()) {
      // A week is "complete" only if it has at least 1 fixture AND all are complete
      if (v.fixtures.length === 0) {
        v.complete = false;
      } else {
        v.complete = v.fixtures.every(isFixtureComplete);
      }
      map.set(w, v);
    }

    return map;
  }, [normalized, allWeeks]);

  const upcomingWeeks = useMemo(() => {
    return allWeeks.filter((w) => !weekMeta.get(w)?.complete);
  }, [allWeeks, weekMeta]);

  const completedWeeks = useMemo(() => {
  return allWeeks
    .filter((w) => !!weekMeta.get(w)?.complete)
    .slice()
    .sort((a, b) => b - a); // newest first
}, [allWeeks, weekMeta]);


  const [tab, setTab] = useState<TabKey>("Fixtures");

  // -----------------------
  // Styles (match your app)
  // -----------------------
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const tabBarStyle: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    height: 30,
    border: "none",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  });

  const listBox: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    color: "#0f172a",
  };

  function Hamburger() {
    return (
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "white",
          fontSize: 30,
          fontWeight: 900,
          lineHeight: "30px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }

  function TeamBadge({ code, size = 28 }: { code: string; size?: number }) {
  return (
    <img
      src={teamLogoSrc(code)}
      alt=""
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
      }}
      title={code}
    />
  );
}


  function Tabs() {
    const tabs: TabKey[] = ["Fixtures", "Results", "FDR"];
    return (
      <div style={tabBarStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(t === tab)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function WeekLabel({ week }: { week: number }) {
    return (
      <div
        style={{
          padding: "2px 10px",
          fontSize: 11,
          fontWeight: 500,
          opacity: 0.55,
          textAlign: "center",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        Week {week}
      </div>
    );
  }

  function FixtureRow({ f, mode }: { f: AnyFixture; mode: "fixtures" | "results" }) {
    const home = f.homeTeamCode ?? f.homeTeam ?? "HOME";
    const away = f.awayTeamCode ?? f.awayTeam ?? "AWAY";

    const hasScore = f.homeScore != null && f.awayScore != null;

const mid =
  mode === "results"
    ? hasScore
      ? `${f.homeScore} - ${f.awayScore}`
      : "—"
    : hasScore
    ? `${f.homeScore} - ${f.awayScore}`
    : "-  v  -";


    const kickoffMs = (f as any).kickoffMs as number;
const sub = mode === "fixtures" ? (kickoffMs ? formatKickoffCompact(kickoffMs, userTz) : "TBC") : "";


    return (
      <div
        style={{
          padding: "5px 10px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          display: "grid",
          gridTemplateColumns: "1fr 88px 1fr",
          alignItems: "center",
          gap: 10,
        }}
      >
        {/* left */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TeamBadge code={home} size={32} />

          <div style={{ fontSize: 12, fontWeight: 700 }}>{home}</div>
        </div>

        {/* middle */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>{mid}</div>
          {sub ? (
  <div style={{ marginTop: 2, fontSize: 7, fontWeight: 700, opacity: 0.55 }}>
    {sub}
  </div>
) : null}

        </div>

        {/* right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{away}</div>
          <TeamBadge code={away} size={32} />

        </div>
      </div>
    );
  }

  function WeekList({ which }: { which: "upcoming" | "completed" }) {
    const weeks = which === "upcoming" ? upcomingWeeks : completedWeeks;

    if (!weeks.length) {
      return (
        <div style={{ ...listBox, padding: 14, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
          {which === "upcoming" ? "No upcoming weeks." : "No completed weeks yet."}
        </div>
      );
    }

    return (
      <div style={listBox}>
        {weeks.map((w) => {
          const rows = weekMeta.get(w)?.fixtures ?? [];
          const mode = which === "upcoming" ? ("fixtures" as const) : ("results" as const);

          return (
            <div key={w}>
              <WeekLabel week={w} />
              {rows.map((f) => (
                <FixtureRow key={f.id} f={f} mode={mode} />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  function FdrTable() {
    // Show only upcoming weeks (columns)
    const weeks = upcomingWeeks;

    // Team list from all fixtures (stable ordering)
    const teamSet = new Set<string>();
    for (const f of normalized) {
      teamSet.add((f.homeTeamCode ?? f.homeTeam) as string);
      teamSet.add((f.awayTeamCode ?? f.awayTeam) as string);
    }
    const teams = Array.from(teamSet).filter(Boolean).sort();

    const cellFor = (teamCode: string, week: number) => {
      // if team is HOME
      const f = normalized.find(
        (x) => Number((x as any).week) === week && (x.homeTeamCode ?? x.homeTeam) === teamCode
      );
      if (f) {
        const opp = (f.awayTeamCode ?? f.awayTeam) as string;
        const rating = Number((f as any).fdrHome ?? 3);
        return { opp, ha: "H" as const, rating };
      }

      // if team is AWAY
      const g = normalized.find(
        (x) => Number((x as any).week) === week && (x.awayTeamCode ?? x.awayTeam) === teamCode
      );
      if (g) {
        const opp = (g.homeTeamCode ?? g.homeTeam) as string;
        const rating = Number((g as any).fdrAway ?? 3);
        return { opp, ha: "A" as const, rating };
      }

      return null;
    };

    if (!weeks.length) {
      return (
        <div style={{ ...listBox, padding: 14, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
          No upcoming weeks to display in FDR.
        </div>
      );
    }

    return (
      <div style={{ ...listBox, padding: 10 }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div
            style={{
              minWidth: 640,
              display: "grid",
              gridTemplateColumns: `160px repeat(${weeks.length}, 50px)`,
              gap: 8,
              alignItems: "center",
            }}
          >
            {/* header row */}
            <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }} />
            {weeks.map((w) => (
              <div
                key={w}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  opacity: 0.7,
                  textAlign: "center",
                }}
              >
                Wk {w}
              </div>
            ))}

            {/* rows */}
            {teams.map((t) => (
              <React.Fragment key={t}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <TeamBadge code={t} size={28} />

                  <div style={{ fontSize: 12, fontWeight: 700 }}>{t}</div>
                </div>

                {weeks.map((w) => {
                  const cell = cellFor(t, w);

                  if (!cell) {
                    return (
                      <div
                        key={`${t}-${w}`}
                        style={{
                          height: 30,
                          borderRadius: 8,
                          background: "rgba(15,23,42,0.06)",
                          border: "1px solid rgba(0,0,0,0.06)",
                        }}
                        aria-hidden="true"
                      />
                    );
                  }

                  const label = `${String(cell.opp).slice(0, 3).toUpperCase()}(${cell.ha})`;

                  return (
                    <div
                      key={`${t}-${w}`}
                      style={{
                        height: 30,
                        borderRadius: 8,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        background: fdrBg(cell.rating),
                        color: fdrText(cell.rating),
                        boxShadow: "0 6px 12px rgba(0,0,0,0.10)",
                      }}
                      title={`${t} vs ${cell.opp} (${cell.ha}) • FDR ${cell.rating}`}
                    >
                      {label}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Background */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background:
            "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Hamburger />
          </div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>Fixtures</div>
        </div>

        <Tabs />

        {tab === "Fixtures" && <WeekList which="upcoming" />}
        {tab === "Results" && <WeekList which="completed" />}
        {tab === "FDR" && <FdrTable />}
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeague?.id ?? null}
        setActiveLeague={setActiveLeague}
        activeItem="Fixtures"
      />
    </main>
  );
}
