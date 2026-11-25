"use client";
// components/draftPrep/StrategyTabs.tsx
// The Draft Strategy panel's four tabs (lib/draft/strategy.ts): Round Plan (a position to aim
// for each round), Targets (how many of each position by the end), Do Not Draft, and My
// Rankings (their own order of the whole pool).
import React, { useMemo, useState } from "react";
import { PLAN_OPTIONS, STRATEGY_POSITIONS, myRanks, sortByMyRank, type DraftStrategy, type PlanPos, type StrategyPos } from "@/lib/draft/strategy";
import { starterDemand } from "@/lib/draft/cpu";
import { rosterSize, type SquadFormat } from "@/lib/league/squad";
import { POS_NAME } from "@/lib/draft/constants";
import { canPlayPosition } from "@/lib/players/positions";
import { innerBox, ink, line, muted, secondaryButton } from "@/lib/ui/theme";
import { Chip, Stepper } from "./PrepPage";
import { IconButton, PlayerLine, type LinePlayer } from "./PlayerLine";

type Update = (change: (s: DraftStrategy) => DraftStrategy) => void;

const hint: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: muted, lineHeight: 1.4 };
const input: React.CSSProperties = { height: 36, width: "100%", borderRadius: 10, border: `1px solid ${line}`, padding: "0 10px", fontSize: 14, color: ink, background: "white", boxSizing: "border-box" };
const smallButton: React.CSSProperties = { ...secondaryButton, height: 32, width: "auto", padding: "0 14px", fontSize: 12 };

// ---------------------------------------------------------------------------
export function RoundPlanTab({ strategy, update, format }: { strategy: DraftStrategy; update: Update; format: SquadFormat }) {
  const rounds = rosterSize(format);
  const planned = strategy.rounds.slice(0, rounds).filter(Boolean).length;
  const setRound = (i: number, v: PlanPos) =>
    update((s) => {
      const next = [...s.rounds];
      while (next.length <= i) next.push("");
      next[i] = v;
      return { ...s, rounds: next };
    });
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={hint}>
        Pick the position you want to aim for in each round. In the draft room, players who suit this round&apos;s plan are marked, and if
        your pick clock runs out, auto-pick takes the best of them (after your draft watchlist).
      </div>
      <div style={{ ...innerBox, padding: 0 }}>
        {Array.from({ length: rounds }, (_, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: i < rounds - 1 ? `1px solid ${line}` : "none" }}>
            <span style={{ width: 64, fontSize: 13, fontWeight: 700 }}>Round {i + 1}</span>
            <select
              aria-label={`Round ${i + 1} plan`}
              value={strategy.rounds[i] ?? ""}
              onChange={(e) => setRound(i, e.target.value as PlanPos)}
              style={{ ...input, height: 32, flex: 1, fontWeight: strategy.rounds[i] ? 700 : 500 }}
            >
              {PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={hint}>{planned ? `${planned} of ${rounds} rounds planned` : "No rounds planned: best available every round"}</span>
        {planned ? <button style={smallButton} onClick={() => update((s) => ({ ...s, rounds: [] }))}>Clear Plan</button> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function TargetsTab({ strategy, update, format }: { strategy: DraftStrategy; update: Update; format: SquadFormat }) {
  const demand = starterDemand(format);
  const size = rosterSize(format);
  const total = STRATEGY_POSITIONS.reduce((a, p) => a + (strategy.targets[p] ?? 0), 0);
  const set = (p: StrategyPos, n: number) => update((s) => ({ ...s, targets: { ...s.targets, [p]: n } }));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={hint}>
        How many of each position you want by the end of the draft (counting each player&apos;s main position). The draft room shows how
        you&apos;re tracking, and auto-pick moves on from a position once you have enough.
      </div>
      <div style={{ ...innerBox, padding: 0 }}>
        {STRATEGY_POSITIONS.map((p, i) => {
          const starts = demand[p];
          const startsText = Number.isInteger(starts) ? String(starts) : `about ${Math.round(starts * 10) / 10}`;
          return (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: i < STRATEGY_POSITIONS.length - 1 ? `1px solid ${line}` : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{POS_NAME[p]}s</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: muted }}>Starting spots: {startsText}</div>
              </div>
              <Stepper value={strategy.targets[p] ?? 0} min={0} max={15} onChange={(n) => set(p, n)} label={`${POS_NAME[p]}s`} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ ...hint, color: total > size ? "#dc2626" : muted }}>
          {total ? `${total} of ${size} roster spots planned${total > size ? " (more than your roster holds)" : ""}` : "No targets set (0 = no limit)"}
        </span>
        {total ? <button style={smallButton} onClick={() => update((s) => ({ ...s, targets: {} }))}>Clear Targets</button> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function searchPlayers<T extends LinePlayer>(players: T[], q: string): T[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return players;
  return players.filter((p) => {
    const hay = `${p.firstName} ${p.lastName} ${p.teamCode}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function AvoidTab({ strategy, update, players, onOpen }: { strategy: DraftStrategy; update: Update; players: LinePlayer[]; onOpen: (p: LinePlayer) => void }) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const avoid = new Set(strategy.avoid);
  const matches = q.trim() ? searchPlayers(players.filter((p) => !avoid.has(p.id)), q).slice(0, 8) : [];
  const toggle = (id: string) => update((s) => ({ ...s, avoid: s.avoid.includes(id) ? s.avoid.filter((x) => x !== id) : [...s.avoid, id] }));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={hint}>Players you never want. They&apos;re faded in the draft room, and auto-pick won&apos;t take them (even from your watchlist).</div>
      <input style={input} placeholder="Search a player to add" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a player to add" />
      {matches.length ? (
        <div style={{ ...innerBox, padding: 0 }}>
          {matches.map((p) => (
            <PlayerLine key={p.id} p={p} onOpen={() => onOpen(p)} right={<button style={smallButton} onClick={() => { toggle(p.id); setQ(""); }}>Add</button>} />
          ))}
        </div>
      ) : null}
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Do not draft ({strategy.avoid.length})</div>
      {strategy.avoid.length ? (
        <div style={{ ...innerBox, padding: 0 }}>
          {strategy.avoid.map((id) => {
            const p = byId.get(id);
            if (!p) return null;
            return <PlayerLine key={id} p={p} onOpen={() => onOpen(p)} right={<IconButton label={`Remove ${p.firstName} ${p.lastName}`} onClick={() => toggle(id)}>✕</IconButton>} />;
          })}
        </div>
      ) : (
        <div style={hint}>Nobody yet.</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const PAGE = 50;

export function RankingsTab({ strategy, update, players, onOpen }: { strategy: DraftStrategy; update: Update; players: LinePlayer[]; onOpen: (p: LinePlayer) => void }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<StrategyPos | "">("");
  const [shown, setShown] = useState(PAGE);
  const [moveTo, setMoveTo] = useState<{ id: string; text: string } | null>(null);
  const ranks = useMemo(() => myRanks(players, strategy), [players, strategy]);
  const order = useMemo(() => sortByMyRank(players, strategy, ranks), [players, strategy, ranks]);
  const visible = useMemo(() => searchPlayers(order, q).filter((p) => !pos || canPlayPosition(p, pos)), [order, q, pos]);
  const avoid = new Set(strategy.avoid);
  const custom = strategy.ranking.length > 0;

  /** Move a player to a spot in the whole order (0-based) and save the whole order. */
  const moveToIndex = (id: string, to: number) => {
    const ids = order.map((p) => p.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    update((s) => ({ ...s, ranking: ids }));
  };
  // ▲ / ▼ swap with the next player in the list as shown (so with a position picked, locks swap with locks)
  const step = (i: number, d: -1 | 1) => {
    const other = visible[i + d];
    if (!other) return;
    const target = (ranks.get(other.id) ?? 1) - 1;
    moveToIndex(visible[i].id, target);
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={hint}>
        Your own order of the player pool. Mock drafts and auto-pick use it instead of the site&apos;s Draft Rank, and the draft room can
        sort by it. Use ▲ ▼ or tap a number to move a player to a new rank.
      </div>
      <input style={input} placeholder="Search players" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} aria-label="Search players" />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        <Chip active={!pos} onClick={() => setPos("")}>All</Chip>
        {STRATEGY_POSITIONS.map((p) => (
          <Chip key={p} active={pos === p} onClick={() => { setPos(p); setShown(PAGE); }}>{p}</Chip>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={hint}>{custom ? "Using your rankings" : "Same as the site's Draft Rank (move anyone to start your own)"}</span>
        {custom ? <button style={smallButton} onClick={() => update((s) => ({ ...s, ranking: [] }))}>Reset to Draft Rank</button> : null}
      </div>
      <div style={{ ...innerBox, padding: 0 }}>
        {visible.slice(0, shown).map((p, i) => {
          const mine = ranks.get(p.id) ?? 0;
          const editing = moveTo?.id === p.id;
          return (
            <PlayerLine
              key={p.id}
              p={p}
              number={
                editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const n = Math.round(Number(moveTo!.text));
                      if (n >= 1) moveToIndex(p.id, n - 1);
                      setMoveTo(null);
                    }}
                  >
                    <input
                      autoFocus
                      inputMode="numeric"
                      aria-label={`New rank for ${p.firstName} ${p.lastName}`}
                      value={moveTo!.text}
                      onChange={(e) => setMoveTo({ id: p.id, text: e.target.value.replace(/\D/g, "") })}
                      onBlur={() => setMoveTo(null)}
                      style={{ width: 34, height: 26, borderRadius: 6, border: `1px solid ${line}`, textAlign: "center", fontSize: 13, fontWeight: 700 }}
                    />
                  </form>
                ) : (
                  <button
                    aria-label={`Rank ${mine}: move ${p.firstName} ${p.lastName}`}
                    onClick={() => setMoveTo({ id: p.id, text: String(mine) })}
                    style={{ width: 30, background: "transparent", border: "none", padding: 0, fontSize: 15, fontWeight: 700, color: ink, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
                  >
                    {mine}
                  </button>
                )
              }
              tag={avoid.has(p.id) ? "Do not draft" : custom && p.draftRank && p.draftRank !== mine ? `Draft Rank ${p.draftRank}` : undefined}
              tagTone={avoid.has(p.id) ? "red" : "grey"}
              dim={avoid.has(p.id)}
              onOpen={() => onOpen(p)}
              right={
                <>
                  <IconButton label={`Move ${p.firstName} ${p.lastName} up`} disabled={i === 0} onClick={() => step(i, -1)}>▲</IconButton>
                  <IconButton label={`Move ${p.firstName} ${p.lastName} down`} disabled={i === visible.length - 1} onClick={() => step(i, 1)}>▼</IconButton>
                </>
              }
            />
          );
        })}
        {!visible.length ? <div style={{ ...hint, padding: 10 }}>No players match.</div> : null}
      </div>
      {visible.length > shown ? (
        <button style={secondaryButton} onClick={() => setShown((n) => n + PAGE)}>Show More ({visible.length - shown} left)</button>
      ) : null}
    </div>
  );
}
