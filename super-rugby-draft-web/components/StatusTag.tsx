// components/StatusTag.tsx
// The small coloured status tag (XV / SUB / INJ / SUS / OUT) shown next to a player's name.
// Nothing is shown when the player has no status (available). Details (e.g. "Knee - 2 weeks")
// are on the player card.
import type { CSSProperties } from "react";
import { currentStatusKind, STATUS_TAG, statusKind, type StatusKind } from "@/lib/status/kind";

type WithStatus = { status?: string | null; weeklyStatus?: Record<string, string> | null };

export function StatusTag({
  player,
  kind,
  text,
  style,
}: {
  /** a player with status / weeklyStatus: their status this week is used */
  player?: WithStatus | null;
  /** or a kind / status text directly */
  kind?: StatusKind | null;
  text?: string | null;
  style?: CSSProperties;
}) {
  const k = kind ?? (text !== undefined ? statusKind(text) : currentStatusKind(player));
  if (!k) return null;
  const t = STATUS_TAG[k];
  return (
    <span
      title={t.name}
      aria-label={t.name}
      style={{
        display: "inline-block",
        flex: "none",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        lineHeight: 1.2,
        padding: "1px 4px",
        borderRadius: 4,
        background: t.bg,
        color: t.fg,
        verticalAlign: "middle",
        ...style,
      }}
    >
      {t.tag}
    </span>
  );
}
