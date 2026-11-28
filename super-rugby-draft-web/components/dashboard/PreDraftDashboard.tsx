"use client";
// components/dashboard/PreDraftDashboard.tsx
// The Dashboard before a league's draft is finished (Ethan, 26 Nov 2026): the league name and
// round ("Pre-season"), the draft's date and time with Enter Draft Room, and Draft Preparation
// (Draft Strategy, Mock Draft). A league that starts after the season has begun also gets this
// round's games and Player of the Week (from app/dashboard/page.tsx).
// The draft order lottery (Ethan, 28 Nov 2026): when it runs with Watch the lottery (opens it in
// the Draft Room), or once it's run, who picks first with Watch the replay.
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftStrategy } from "@/lib/draft/useStrategy";
import { isEmptyStrategy } from "@/lib/draft/strategy";
import { num } from "@/lib/ui/theme";
import { LOTTERY_LIVE_MS, useLottery } from "@/lib/draft/lottery/useLottery";
import { lastRun, lotteryWhen, waitingRun } from "@/lib/draft/lottery/view";
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
  // the draft order lottery (only before the draft)
  const { data: lottery } = useLottery(live ? null : leagueId);
  const waiting = waitingRun(lottery);
  const ran = lastRun(lottery);
  const lotteryNow = !!ran?.ranAt && now - ran.ranAt < LOTTERY_LIVE_MS;
  const linkButton: React.CSSProperties = { border: "none", background: "transparent", padding: 0, font: "inherit", fontWeight: 700, color: "#0d9488", textDecoration: "underline", cursor: "pointer" };
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
        {!live && (waiting || ran) ? (
          <div style={{ marginTop: 12, borderTop: "1px solid #e5e9ef", paddingTop: 12, textAlign: "center" }}>
            <div style={label}>Draft Order Lottery{(waiting ?? ran)!.runNumber > 1 ? " (rerun)" : ""}</div>
            {waiting ? (
              <>
                <div style={{ ...num, marginTop: 4, fontSize: 16, fontWeight: 700 }}>{lotteryWhen(waiting.scheduledAt, timeZone)}</div>
                <button style={{ ...linkButton, marginTop: 4, fontSize: 13 }} onClick={() => router.push("/draft-room#lottery")}>
                  Watch the lottery
                </button>
              </>
            ) : ran ? (
              <>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>
                  {lotteryNow ? "On now" : `${lottery?.teams.find((t) => t.id === ran.resultTeamIds?.[0])?.name ?? "A team"} picks first`}
                </div>
                <button style={{ ...linkButton, marginTop: 4, fontSize: 13 }} onClick={() => router.push("/draft-room#lottery")}>
                  {lotteryNow ? "Watch the lottery" : "Watch the replay"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
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
