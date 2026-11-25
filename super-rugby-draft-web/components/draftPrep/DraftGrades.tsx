"use client";
// components/draftPrep/DraftGrades.tsx
// The draft grades (lib/draft/grades.ts) in the draft room: shown at the bottom of the Teams
// tab, under whichever team is being looked at (Ethan, 25 Nov 2026). The coach rewrites the
// bullet points a few minutes after the draft (if it's switched on), so this checks back for a
// little while.
import React, { useEffect, useState } from "react";
import { useCoachName } from "@/lib/coach/name";
import { muted } from "@/lib/ui/theme";

export type DraftGrade = { teamId: string; teamName: string; grade: string; rank: number; bullets: string[]; byCoach: boolean };

const gradeColour = (g: string) => (g.startsWith("A") ? "#0d9488" : g.startsWith("B") ? "#2563eb" : g.startsWith("C") ? "#b45309" : "#b91c1c");

/** The league's draft grades once the draft is over (empty until then). */
export function useDraftGrades(leagueId: string | null, draftOver: boolean): DraftGrade[] {
  const [grades, setGrades] = useState<DraftGrade[]>([]);
  useEffect(() => {
    if (!leagueId || !draftOver) return;
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();
    const load = async () => {
      try {
        const r = await fetch(`/api/draft/grades?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!cancelled && j?.ok) setGrades(j.grades ?? []);
        // the coach's bullet points arrive within a few minutes: check again for up to 15 minutes
        const waiting = !j?.ok || !(j.grades ?? []).length || (j.grades as DraftGrade[]).some((g) => !g.byCoach);
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
  }, [leagueId, draftOver]);
  return grades;
}

/** One team's grade and bullet points (the bottom of the Teams tab). */
export function TeamDraftGrade({ grade }: { grade: DraftGrade }) {
  const coachName = useCoachName();
  return (
    <div style={{ marginTop: 10, borderRadius: 12, background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", color: "#0f172a", padding: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: gradeColour(grade.grade), color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, flexShrink: 0 }}>
          {grade.grade}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Draft Grade</div>
          {grade.byCoach ? <div style={{ fontSize: 10, fontWeight: 600, color: muted }}>By {coachName}</div> : null}
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4, fontSize: 12, lineHeight: 1.4 }}>
            {grade.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
