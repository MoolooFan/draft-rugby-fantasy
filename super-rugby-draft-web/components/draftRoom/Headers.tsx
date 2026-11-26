"use client";
// components/draftRoom/Headers.tsx
// The Draft Room's top card: before the draft (countdown, first pick), during it (pick clock,
// latest pick, your next pick) and after it (Draft Complete with the last pick).
import React from "react";
import { formatMMSS, headerCard, latestPickPill, MenuButton, pad2, useNowTick } from "./ui";

function TimeBlock({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: "30px" }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function PreDraftHeader({
  draftAt,
  firstPickName,
  onShowOrder,
  onMenu,
}: {
  /** when the draft starts (null: not set yet) */
  draftAt: number | null;
  firstPickName: string;
  /** opens the Draft Order pop-up (none when there's no order yet) */
  onShowOrder?: () => void;
  onMenu: () => void;
}) {
  const now = useNowTick(250);
  const secs = draftAt ? Math.max(0, Math.floor((draftAt - now) / 1000)) : 0;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  return (
    <div style={headerCard}>
      <MenuButton onClick={onMenu} />
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>Draft Starts In</div>
      <div style={{ marginTop: 10 }}>
        {!draftAt ? (
          <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.95 }}>Draft time not set yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <TimeBlock value={pad2(d)} label="Days" />
            <TimeBlock value={pad2(h)} label="Hours" />
            <TimeBlock value={pad2(m)} label="Minutes" />
            <TimeBlock value={pad2(s)} label="Seconds" />
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, opacity: 0.95 }}>
        First Pick:{" "}
        {onShowOrder ? (
          <button
            onClick={onShowOrder}
            style={{ border: "none", background: "transparent", padding: 0, font: "inherit", fontWeight: 600, color: "#0d9488", textDecoration: "underline", cursor: "pointer" }}
          >
            {firstPickName}
          </button>
        ) : (
          <span style={{ fontWeight: 600 }}>{firstPickName || "TBC"}</span>
        )}
      </div>
    </div>
  );
}

/** After the draft (Ethan, 25 Nov 2026: it used to go back to "Draft Starts In"). */
export function CompleteHeader({ latestPickText, onMenu }: { latestPickText: string; onMenu: () => void }) {
  return (
    <div style={headerCard}>
      <MenuButton onClick={onMenu} />
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>Draft Complete</div>
      {/* the last pick, as it shows during the draft (Ethan, 25 Nov 2026) */}
      <div style={latestPickPill}>{latestPickText}</div>
    </div>
  );
}

export function LiveHeader({
  deadlineMs,
  draftComplete,
  currentPick,
  totalPicks,
  latestPickText,
  youOnClock,
  nextPickInTurns,
  onTheClockName,
  onMenu,
}: {
  /** when the pick clock runs out (from the server) */
  deadlineMs: number | null;
  draftComplete: boolean;
  currentPick: number;
  totalPicks: number;
  latestPickText: string;
  youOnClock: boolean;
  /** picks until yours (0: none left) */
  nextPickInTurns: number;
  onTheClockName: string;
  onMenu: () => void;
}) {
  const now = useNowTick(250);
  const secondsLeft = Math.max(0, Math.floor(((deadlineMs ?? 0) - now) / 1000));
  // (it used to be white on the white card, so it only showed once it turned red; Ethan, 25 Nov 2026)
  const timeColor = !draftComplete && secondsLeft <= 20 ? "#EF4444" : "inherit";

  return (
    <div style={headerCard}>
      <MenuButton onClick={onMenu} />
      <div style={{ marginTop: 2, display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, opacity: 0.95 }}>🕒</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: timeColor }}>{draftComplete ? "Draft Complete" : formatMMSS(secondsLeft)}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 18, fontWeight: 700 }}>
          Pick {currentPick} of {totalPicks}
        </div>
      </div>

      <div style={latestPickPill}>{latestPickText}</div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ display: "grid", gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.95 }}>Your Next Pick in:</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: youOnClock ? "#0d9488" : undefined }}>
            {draftComplete ? "—" : youOnClock ? "On the clock" : nextPickInTurns ? `${nextPickInTurns} ${nextPickInTurns === 1 ? "turn" : "turns"}` : "No picks left"}
          </div>
        </div>
        <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.95 }}>On the Clock:</div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{draftComplete ? "—" : onTheClockName}</div>
        </div>
      </div>
    </div>
  );
}
