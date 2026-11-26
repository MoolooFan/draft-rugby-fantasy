"use client";
// components/dashboard/PreDraftDashboard.tsx
// The Dashboard before a league's draft is finished (Ethan, 26 Nov 2026): the league name and
// round ("Pre-season"), the draft's date and time with Enter Draft Room, and Draft Preparation
// (Draft Strategy, Mock Draft). A league that starts after the season has begun also gets this
// round's games and Player of the Week (from app/dashboard/page.tsx).
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftStrategy } from "@/lib/draft/useStrategy";
import { isEmptyStrategy } from "@/lib/draft/strategy";
import { num } from "@/lib/ui/theme";
import { cardStyle, primaryButton, secondaryButton } from "./helpers";

/** "Starts in 3 days" / "Starts in 4 h 20 min" / "Starts in 12 min". */
function countdown(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `Starts in ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `Starts in ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `Starts in ${Math.floor(h / 24)} days`;
}

export function PreDraftDashboard({
  leagueId,
  leagueName,
  roundText,
  draftAt,
  draftLive,
  timeZone,
  after,
}: {
  leagueId: string;
  leagueName: string;
  /** "Pre-season", or the round when the season has already started */
  roundText: string;
  draftAt: number | null;
  draftLive: boolean;
  /** your time zone (Account); the device's when not set */
  timeZone?: string;
  /** more cards (this round's games, Player of the Week) when the season has started */
  after?: React.ReactNode;
}) {
  const router = useRouter();
  const { strategy, loaded } = useDraftStrategy(leagueId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const live = draftLive || (!!draftAt && now >= draftAt);
  const when = draftAt
    ? new Intl.DateTimeFormat("en-NZ", { timeZone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(draftAt)
    : null;
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, opacity: 0.75 };

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 24 }}>{leagueName}</div>
        <div style={{ textAlign: "center", marginTop: 4, fontSize: 18, fontWeight: 600 }}>{roundText}</div>

        <div style={{ marginTop: 12, borderTop: "1px solid #e5e9ef", paddingTop: 12, textAlign: "center" }}>
          <div style={label}>Draft</div>
          {live ? (
            <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: "#0d9488" }}>The draft is on now</div>
          ) : when ? (
            <>
              <div style={{ ...num, marginTop: 4, fontSize: 18, fontWeight: 700 }}>{when}</div>
              <div style={{ marginTop: 2, fontSize: 12, fontWeight: 600, opacity: 0.75 }}>{countdown(draftAt! - now)}</div>
            </>
          ) : (
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>Date and time not set yet</div>
          )}
        </div>
        <button style={{ ...primaryButton, marginTop: 12 }} onClick={() => router.push("/draft-room")}>
          Enter Draft Room
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Draft Preparation</div>
        <div style={{ display: "grid", gap: 8 }}>
          <button style={secondaryButton} onClick={() => router.push("/draft-room#strategy")}>
            {loaded && !isEmptyStrategy(strategy) ? "Edit Draft Strategy" : "Set Up Draft Strategy"}
          </button>
          {live ? null : (
            <button style={secondaryButton} onClick={() => router.push(`/mock-draft?leagueId=${encodeURIComponent(leagueId)}`)}>
              Mock Draft
            </button>
          )}
        </div>
      </div>

      {after}
    </div>
  );
}
