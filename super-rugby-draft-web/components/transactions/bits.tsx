// components/transactions/bits.tsx
// Small pieces of the Transactions page that only use what they're given (moved out of
// app/transactions/page.tsx; they look and work the same).
import React from "react";
import { WatchEyeIcon } from "@/components/WatchEyeIcon";

/** The watchlist eye on a player row. */
export function StarButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // prevent spacebar from scrolling the page
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
        }
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
      style={{
        width: 28,
        height: 28,
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.10)",
        background: active ? "rgba(250,204,21,0.25)" : "rgba(0,0,0,0.05)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: "#0f172a",
        fontSize: 16,
        fontWeight: 700,
      }}
    >
      <WatchEyeIcon active={active} />
    </button>
  );
}

/** A claim / transfer's status: Processed, Failed, Declined, Pending... */
export function StatusPill({ status }: { status: string }) {
      const s = String(status ?? "").toUpperCase();

      const isProcessed = s === "PROCESSED" || s === "SUCCESS" || s === "APPROVED";
      const isFailed = s === "FAILED";
      const isDeclined = s === "DECLINED" || s === "REJECTED";

      const text =
        isProcessed ? "Processed" :
        isFailed ? "Failed" :
        isDeclined ? "Declined" :
        s ? s[0] + s.slice(1).toLowerCase() : "—";

      const color =
        isProcessed ? "rgba(34,197,94,0.95)" :
        isFailed ? "rgba(239,68,68,0.95)" :
        isDeclined ? "rgba(239,68,68,0.95)" :
        "rgba(15,23,42,0.70)";

      const bg =
        isProcessed ? "rgba(34,197,94,0.10)" :
        isFailed ? "rgba(239,68,68,0.10)" :
        isDeclined ? "rgba(239,68,68,0.10)" :
        "rgba(15,23,42,0.06)";

      return (
        <div
          style={{
            justifySelf: "end",
            width: 88,
            height: 30,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            color,
            background: bg,
            border: "1px solid rgba(0,0,0,0.06)",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          {text}
        </div>
      );
    }
