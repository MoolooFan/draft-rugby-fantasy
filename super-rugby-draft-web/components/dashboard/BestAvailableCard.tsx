"use client";
// components/dashboard/BestAvailableCard.tsx
// The Dashboard's Best Available Players: the top 10 unowned players by form (last 3 rounds),
// each with the watchlist eye and the add button (to Transactions). Moved out of
// app/dashboard/page.tsx.
import React from "react";
import { useRouter } from "next/navigation";
import { PlusMinusIcon } from "@/components/PlusMinusIcon";
import { WatchEyeIcon } from "@/components/WatchEyeIcon";
import { JerseyTile } from "./JerseyTile";
import { cardStyle, fullTeamNameFromCode, singularPosLabel, type Player } from "./helpers";

export function BestAvailableCard({
  players,
  onOpenPlayer,
  isWatched,
  onToggleWatch,
  onAdd,
  addBtnBg,
}: {
  players: Player[];
  onOpenPlayer: (p: Player) => void;
  isWatched: (playerId: string) => boolean;
  onToggleWatch: (playerId: string) => void;
  onAdd: (playerId: string) => void;
  /** yellow during waivers, green otherwise */
  addBtnBg: string;
}) {
  const router = useRouter();
  return (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Best Available Players
          </div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
              color: "#0f172a",
            }}
          >
            <div style={{ padding: 5, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 73px", gap: 10 }}>
                <div />
                <div style={{ textAlign: "right", paddingRight: -0 }}>Form</div>
                <div />
              </div>
            </div>

            <div style={{ display: "grid" }}>
              {players.map((p, idx) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  // (a clickable block, not a <button>: it holds the star and add buttons)
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLDivElement).click();
                  }}
onClick={() => onOpenPlayer(p)}                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 64px 66px",
                      gap: 10,
                      alignItems: "center",
                      padding: "5px 10px",
                      borderTop: idx === 0 ? "1px solid rgba(0,0,0,0.08)" : undefined,
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <JerseyTile size={34} teamCode={p.teamCode} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {p.firstName[0]}. {p.lastName}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
  {fullTeamNameFromCode(p.teamCode)} — {p.positions ?? singularPosLabel(p.posName)}
</div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 600, fontSize: 12 }}>
                      {p.form.toFixed(1)}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
{/* Watchlist */}
<button
  onClick={(e) => {
    e.stopPropagation();
    onToggleWatch(p.id);
  }}
  aria-label={isWatched(p.id) ? "Remove from watchlist" : "Add to watchlist"}
  style={{
    width: 28,
    height: 28,
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.22)",
    background: isWatched(p.id) ? "#F6E7A6" : "rgba(15,23,42,0.10)",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  }}
>
  <WatchEyeIcon active={isWatched(p.id)} />
</button>

  {/* Add -> Transactions prefill */}
  <button
    onClick={(e) => {
      e.stopPropagation();
      onAdd(p.id);
    }}
    aria-label="Add player"
    style={{
      width: 28,
      height: 28,
      borderRadius: 10,
      border: "none",
      background: addBtnBg,
      color: "white",
      fontWeight: 700,
      fontSize: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
    }}
  >
    <PlusMinusIcon kind="plus" size={16} />
  </button>
</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => router.push("/transactions")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#0f172a",
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                  opacity: 0.75,
                }}
              >
                View All Players
              </button>
            </div>
          </div>
        </div>
  );
}
