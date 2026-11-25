"use client";
// components/draftPrep/DraftGrades.tsx
// The draft grades (lib/draft/grades.ts) under "Draft Complete" in the draft room: your team's
// grade and bullet points first, then everyone's. The coach rewrites the bullet points a few
// minutes after the draft (if it's switched on), so this checks back for a little while.
import React, { useEffect, useState } from "react";
import { useCoachName } from "@/lib/coach/name";
import { card, ink, muted, teal } from "@/lib/ui/theme";

type Grade = { teamId: string; teamName: string; grade: string; rank: number; bullets: string[]; byCoach: boolean };

const gradeColour = (g: string) => (g.startsWith("A") ? "#0d9488" : g.startsWith("B") ? "#2563eb" : g.startsWith("C") ? "#b45309" : "#b91c1c");

function Badge({ grade, size = 40 }: { grade: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: gradeColour(grade), color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>
      {grade}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4, fontSize: 12, lineHeight: 1.4 }}>
      {items.map((b, i) => <li key={i}>{b}</li>)}
    </ul>
  );
}

export function DraftGrades({ leagueId, yourTeamId }: { leagueId: string; yourTeamId: string }) {
  const coachName = useCoachName();
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();
    const load = async () => {
      try {
        const r = await fetch(`/api/draft/grades?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!cancelled && j?.ok) setGrades(j.grades ?? []);
        // the coach's bullet points arrive within a few minutes: check again for up to 15 minutes
        const waiting = !j?.ok || !(j.grades ?? []).length || (j.grades as Grade[]).some((g) => !g.byCoach);
        if (!cancelled && waiting && Date.now() - started < 15 * 60_000) timer = window.setTimeout(load, 60_000);
      } catch {
        if (!cancelled) timer = window.setTimeout(load, 60_000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [leagueId]);

  if (!grades?.length) return null;
  const mine = grades.find((g) => g.teamId === yourTeamId);
  const others = grades.filter((g) => g.teamId !== yourTeamId);

  return (
    <div style={{ ...card, marginTop: 10, color: ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Draft Grades</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: muted }}>{grades.some((g) => g.byCoach) ? `By ${coachName}` : "Fixed at the end of the draft"}</div>
      </div>

      {mine ? (
        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          <Badge grade={mine.grade} size={48} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {mine.teamName} <span style={{ fontSize: 11, fontWeight: 600, color: muted }}>· {ordinal(mine.rank)} of {grades.length}</span>
            </div>
            <Bullets items={mine.bullets} />
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setShowAll((x) => !x)}
        style={{ marginTop: 10, border: "none", background: "transparent", padding: 0, color: teal, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
      >
        {showAll ? "Hide the other teams" : `See every team's grade (${others.length})`}
      </button>

      {showAll ? (
        <div style={{ marginTop: 6, display: "grid" }}>
          {others.map((g) => (
            <div key={g.teamId} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid rgba(15,23,42,0.08)" }}>
              <Badge grade={g.grade} size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {g.teamName} <span style={{ fontSize: 11, fontWeight: 600, color: muted }}>· {ordinal(g.rank)}</span>
                </div>
                <Bullets items={g.bullets} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
