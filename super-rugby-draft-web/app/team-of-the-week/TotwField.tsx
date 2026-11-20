"use client";
// app/team-of-the-week/TotwField.tsx
// The Team of the Week field: the best player in each starting spot, with his jersey, name and
// points (gold outline = Player of the Week). Moved out of page.tsx.
import React from "react";
import { JERSEY_PLACEHOLDER } from "@/lib/teams/images";
import { FIELD_POS, jerseySrcForTeam, SLOT_DEFS, type Lineup, type Player, type SlotId } from "./helpers";

function PlayerTile({ slotId, p, isPOTW, pts, onOpen }: { slotId: SlotId; p: Player | null; isPOTW: boolean; pts: number; onOpen: (p: Player) => void }) {
  const slot = SLOT_DEFS.find((s) => s.id === slotId)!;

  const border = isPOTW ? "2px solid rgba(250,204,21,0.95)" : "1px solid rgba(255,255,255,0.22)";
  const boxShadow = isPOTW
    ? `
      0 10px 22px rgba(0,0,0,0.16),
      0 0 0 3px rgba(250,204,21,0.85),
      0 0 18px rgba(250,204,21,0.55)
    `
    : "0 10px 22px rgba(0,0,0,0.16)";

  const jerseyUrl = p ? jerseySrcForTeam(p.teamCode) : "";

  return (
    <button
      onClick={() => {
        if (p) onOpen(p);
      }}
      disabled={!p}
      style={{
        width: 70,
        height: 70,
        borderRadius: 14,
        border,
        background: p ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
        boxShadow,
        padding: 0,
        position: "relative",
        overflow: "visible",
        color: "white",
        cursor: p ? "pointer" : "default",
      }}
    >
      {p ? (
        <>
          {/* Jersey */}
          <div
            style={{
              position: "absolute",
              top: 3,
              left: "50%",
              transform: "translateX(-50%)",
              width: 65,
              height: 44,
              overflow: "hidden",
              zIndex: 1,
              display: "grid",
              placeItems: "center",
            }}
          >
            <img
              src={jerseyUrl}
              alt=""
              draggable={false}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = JERSEY_PLACEHOLDER;
              }}
              style={{
                width: "100%",
                height: 65,
                objectFit: "contain",
                filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.25))",
              }}
            />
          </div>

          {/* Pill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 999,
              overflow: "hidden",
              zIndex: 2,
              boxShadow: "0 10px 18px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.95)",
                color: "#0f2a4a",
                textAlign: "center",
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: "8px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.lastName}
            </div>

            <div
              style={{
                background: "#133454",
                color: "white",
                textAlign: "center",
                padding: "0px 0px",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: "12px",
                borderTop: "1px solid rgba(15,23,42,0.10)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {pts}
            </div>
          </div>
        </>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 6px",
            fontSize: 10,
            fontWeight: 700,
            opacity: 0.75,
            lineHeight: "12px",
            textAlign: "center",
          }}
        >
          {slot.label === "Loose" ? (
            <>
              <span>Loose</span>
              <span>Forward</span>
            </>
          ) : slot.label === "Outside" ? (
            <>
              <span>Outside</span>
              <span>Back</span>
            </>
          ) : (
            <span>{slot.label}</span>
          )}
        </div>
      )}
    </button>
  );
}

export function TotwField({
  lineup,
  potwIds,
  weekPointsByPlayerId,
  onOpen,
}: {
  lineup: Lineup;
  /** this round's Player of the Week (gold outline) */
  potwIds: Set<string>;
  weekPointsByPlayerId: Map<string, number>;
  onOpen: (p: Player) => void;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        height: 520,
        backgroundImage: `url("/images/field.webp")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
      }}
    >
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(2,6,23,0.10)" }} />

      {(SLOT_DEFS.map((s) => s.id) as SlotId[]).map((id) => {
        const pos = FIELD_POS[id];
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              transform: "translate(-50%, -50%)",
            }}
          >
            {PlayerTile({
                slotId: id,
                p: lineup[id],
                isPOTW: !!lineup[id]?.id && potwIds.has(String(lineup[id]!.id)),
                pts: lineup[id]?.id ? (weekPointsByPlayerId.get(lineup[id]!.id.toLowerCase()) ?? 0) : 0,
                onOpen,
              })}
          </div>
        );
      })}
    </div>
  );
}
