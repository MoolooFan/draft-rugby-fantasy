"use client";
// components/draftRoom/TeamsTab.tsx
// The Draft Room's Teams tab: pick a team and see its squad so far, grouped by position (Props,
// Hookers, ...) with empty spots, then the wildcards / bench, and the pick each player went at.
import React from "react";
import type { Player } from "@/lib/draft/types";
import { assignToSlots, isStandardSquad, SLOT_KINDS, squadSlots, type SquadFormat } from "@/lib/league/squad";
import { rosterSlots } from "@/lib/draft/constants";
import { PlusMinusIcon } from "@/components/PlusMinusIcon";
import { inputWrap, listBox, PlayerInfo } from "./ui";

type Group = { key: string; label: string; emptyLabel: string; entries: Array<Player | null> };

/**
 * A team's players in their groups. Players sit with their position even when they fill a
 * wildcard / bench spot (a 2nd hooker goes straight under the 1st, with one fewer empty
 * wildcard), in the order they were drafted (Ethan, 25 Nov 2026).
 */
export function rosterGroups(players: Player[], squad: SquadFormat, pickNumberOf: (id: string) => number | null | undefined): Group[] {
  const byPick = (a: Player, b: Player) => (pickNumberOf(a.id) ?? 9999) - (pickNumberOf(b.id) ?? 9999);
  const all = [...players].sort(byPick);
  const placed = assignToSlots(all, squad);
  const { starters, bench } = squadSlots(squad);
  const standard = isStandardSquad(squad);
  const benchPlayers = bench.map((id) => placed.get(id) ?? null).filter((p): p is Player => !!p);
  const groups: Group[] = [];
  for (const k of SLOT_KINDS) {
    const ids = starters.filter((x) => x.kind === k.kind).map((x) => x.id);
    if (!ids.length) continue;
    const filled = ids.map((id) => placed.get(id) ?? null).filter((p): p is Player => !!p);
    // wildcard / bench players whose main position goes in this group
    for (let i = benchPlayers.length - 1; i >= 0; i--) {
      if (k.positions.includes(String(benchPlayers[i].posAbbrev ?? "").toUpperCase())) filled.push(...benchPlayers.splice(i, 1));
    }
    filled.sort(byPick);
    const empty = ids.filter((id) => !placed.get(id)).length;
    const std = standard ? rosterSlots.find((r) => r.posAbbrev === k.kind) : undefined;
    groups.push({ key: k.kind, label: std?.label ?? k.label, emptyLabel: std ? std.label.slice(0, -1) : k.label, entries: [...filled, ...Array<null>(empty).fill(null)] });
  }
  if (bench.length) {
    benchPlayers.sort(byPick);
    const emptyBench = bench.filter((id) => !placed.get(id)).length;
    const entries = [...benchPlayers, ...Array<null>(emptyBench).fill(null)];
    if (entries.length) groups.push({ key: "bench", label: standard ? "Wildcards" : "Bench", emptyLabel: standard ? "Wildcard" : "Bench", entries });
  }
  return groups;
}

export function TeamsTab({
  teams,
  selectedTeamId,
  onSelectTeam,
  players,
  loading,
  squad,
  pickNumberOf,
  onOpen,
}: {
  teams: Array<{ id: string; name: string }>;
  selectedTeamId: string;
  onSelectTeam: (id: string) => void;
  /** the selected team's players */
  players: Player[];
  /** nothing to show yet */
  loading: boolean;
  squad: SquadFormat;
  pickNumberOf: (id: string) => number | null | undefined;
  onOpen: (p: Player) => void;
}) {
  if (loading) {
    return (
      <div style={{ ...listBox, marginTop: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Loading rosters…</div>
      </div>
    );
  }
  const groups = rosterGroups(players, squad, pickNumberOf);

  return (
    <>
      <div style={{ marginTop: 10 }}>
        <div style={inputWrap}>
          <select
            value={selectedTeamId}
            onChange={(e) => onSelectTeam(e.target.value)}
            style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: "#0f172a" }}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ ...listBox, marginTop: 10 }}>
        <div style={{ padding: "8px 10px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px" }}>
            <div />
            <div style={{ textAlign: "right" }}>Pick</div>
          </div>
        </div>

        {groups.map((slot) => (
          <div key={slot.key} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, opacity: 0.75 }}>{slot.label}</div>
            {slot.entries.map((entry, i) => (
              <div
                key={`${slot.key}-${i}`}
                style={{ display: "grid", gridTemplateColumns: "1fr 70px", alignItems: "center", padding: "10px 10px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}
              >
                {entry ? (
                  <div onClick={() => onOpen(entry)} style={{ cursor: "pointer" }}>
                    <PlayerInfo player={entry} />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.55 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        border: "1px solid rgba(0,0,0,0.10)",
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(15,23,42,0.55)",
                      }}
                    >
                      <PlusMinusIcon kind="plus" size={16} strokeWidth={2} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{slot.emptyLabel}</div>
                  </div>
                )}
                <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, opacity: 0.8 }}>{entry ? (pickNumberOf(entry.id) ?? "") : ""}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
