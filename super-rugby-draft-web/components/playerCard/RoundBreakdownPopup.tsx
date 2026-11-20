"use client";
// components/playerCard/RoundBreakdownPopup.tsx
// The pop-up from the Results tab: one round's points, stat by stat. Moved out of
// components/PlayerCardModal.tsx.
import React from "react";
import { PointsBreakdownModal } from "@/components/PointsBreakdownModal";
import { formatStatCount } from "@/lib/scoring";
import { roundLabel } from "@/lib/season";
import { BREAKDOWN_LABELS, BREAKDOWN_ORDER, getBreakdownPointsFromCount, type PlayerRound } from "./cardData";
import type { FixtureRow } from "./helpers";
import type { PlayerCardPlayer } from "../PlayerCardModal";

export function RoundBreakdownPopup({
  open,
  onClose,
  selectedRound,
  fixtures,
  p,
  statSeason,
}: {
  open: boolean;
  onClose: () => void;
  selectedRound: PlayerRound | null;
  fixtures: FixtureRow[];
  p: PlayerCardPlayer;
  statSeason: number;
}) {
  if (!open || !selectedRound) return null;

  return (
    <PointsBreakdownModal
  open={open}
  onClose={onClose}

  playerId={p.id}
  playerName={`${p.firstName} ${p.lastName}`}
  teamCode={p.teamCode}

  weekLabel={selectedRound ? roundLabel(selectedRound.week, statSeason) : ""}
  fixtureLabel={
    selectedRound
      ? (() => {
          const fx = fixtures.find(f => f.week === selectedRound.week);
          if (!fx) return "";
          const ha = fx.homeAway ? ` (${fx.homeAway})` : "";
          return fx.opponent ? `v ${fx.opponent}${ha}` : "BYE";
        })()
      : ""
  }

  totalPoints={selectedRound?.points ?? 0}

rows={
  selectedRound
    ? BREAKDOWN_ORDER.reduce<{ label: string; right: string; count?: string }[]>((acc, key) => {
        const count = Number((selectedRound.breakdown as any)?.[key]) || 0;
        if (!count) return acc;

        const pts = getBreakdownPointsFromCount(key, count, p);
        if (!pts) return acc;

        acc.push({
          label: BREAKDOWN_LABELS[key] ?? key,
          count: formatStatCount(key, count),
          right: String(pts),
        });

        return acc;
      }, [])
    : []
}

/>

  );
}
