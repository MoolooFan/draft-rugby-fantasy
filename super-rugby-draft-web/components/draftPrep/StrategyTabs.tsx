"use client";
// components/draftPrep/StrategyTabs.tsx
// The Draft Strategy panel's three tabs (lib/draft/strategy.ts; Ethan, 25 Nov 2026):
//   Overall Rankings     their own order of the whole player pool
//   Targets              Early / Mid / Late Rounds groups, players ranked within each
//   Positional Rankings  a group per position, players ranked within each
// Groups start empty: "Add Players" lists everyone who can go in (with an Add button each).
// Every list has the search + Filters and a stat column (components/draftPrep/strategyView.tsx);
// ranked lists reorder by dragging (press and hold), ▲ ▼, or tapping the number (26 Nov 2026).
import React, { useMemo, useState } from "react";
import { STRATEGY_POSITIONS, TARGET_GROUPS, myRanks, sortByMyRank, targetGroups, targetShort, type DraftStrategy, type StrategyPos, type TargetGroup } from "@/lib/draft/strategy";
import { POS_NAME } from "@/lib/draft/constants";
import { canPlayPosition } from "@/lib/players/positions";
import { innerBox, ink, line, muted, primaryButton, secondaryButton, teal } from "@/lib/ui/theme";
import { Chip } from "./PrepPage";
import { IconButton, PlayerLine, type LinePlayer } from "./PlayerLine";
import { DragList, ListHeading, StrategyFilterBar, type PlayerView } from "./strategyView";

type Update = (change: (s: DraftStrategy) => DraftStrategy) => void;
type TabProps = { strategy: DraftStrategy; update: Update; players: LinePlayer[]; view: PlayerView; onOpen: (p: LinePlayer) => void };

const hint: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: muted, lineHeight: 1.4 };
const smallButton: React.CSSProperties = { ...secondaryButton, height: 32, width: "auto", padding: "0 14px", fontSize: 12 };
const column: React.CSSProperties = { display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 1fr)" };
const PAGE = 50;

/** Move an id to a spot (0-based) in a list. */
function moved(ids: string[], id: string, to: number): string[] {
  const out = ids.filter((x) => x !== id);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id);
  return out;
}

/** A rank number: tap it to type a new rank. */
function RankNumber({ p, rank, onMove }: { p: LinePlayer; rank: number; onMove: (to: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  if (text != null) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Math.round(Number(text));
          if (n >= 1) onMove(n - 1);
          setText(null);
        }}
      >
        <input
          autoFocus
          inputMode="numeric"
          aria-label={`New rank for ${p.firstName} ${p.lastName}`}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
          onBlur={() => setText(null)}
          style={{ width: 34, height: 26, borderRadius: 6, border: `1px solid ${line}`, textAlign: "center", fontSize: 13, fontWeight: 700 }}
        />
      </form>
    );
  }
  return (
    <button
      aria-label={`Rank ${rank}: move ${p.firstName} ${p.lastName}`}
      onClick={() => setText(String(rank))}
      style={{ width: 30, background: "transparent", border: "none", padding: 0, fontSize: 15, fontWeight: 700, color: ink, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }}
    >
      {rank}
    </button>
  );
}

// ---------------------------------------------------------------------------
export function OverallRankingsTab({ strategy, update, players, view, onOpen }: TabProps) {
  const [shown, setShown] = useState(PAGE);
  const ranks = useMemo(() => myRanks(players, strategy), [players, strategy]);
  const order = useMemo(() => sortByMyRank(players, strategy, ranks), [players, strategy, ranks]);
  const visible = useMemo(() => order.filter(view.matches), [order, view]);
  const groups = useMemo(() => targetGroups(strategy), [strategy]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const custom = strategy.ranking.length > 0;

  const moveToIndex = (id: string, to: number) => update((s) => ({ ...s, ranking: moved(order.map((p) => p.id), id, to) }));
  // ▲ / ▼ swap with the next player in the list as shown (so with a position picked, locks swap with locks)
  const step = (i: number, d: -1 | 1) => {
    const other = visible[i + d];
    if (other) moveToIndex(visible[i].id, (ranks.get(other.id) ?? 1) - 1);
  };
  const page = visible.slice(0, shown);

  return (
    <div style={column}>
      <StrategyFilterBar view={view} />
      {custom ? (
        <button style={{ ...smallButton, justifySelf: "end" }} onClick={() => update((s) => ({ ...s, ranking: [] }))}>Reset to Draft Rank</button>
      ) : null}
      <div style={{ ...innerBox, padding: 0 }}>
        <ListHeading view={view} rightWidth={60} />
        <DragList ids={page.map((p) => p.id)} onMove={(id, overId) => moveToIndex(id, (ranks.get(overId) ?? 1) - 1)}>
          {(id) => {
            const p = byId.get(id)!;
            const i = page.indexOf(p);
            const g = groups.get(p.id);
            return (
              <PlayerLine
                p={p}
                number={<RankNumber p={p} rank={ranks.get(p.id) ?? 0} onMove={(to) => moveToIndex(p.id, to)} />}
                tag={g ? `${targetShort(g)} target` : undefined}
                stat={view.statText(p)}
                onOpen={() => onOpen(p)}
                right={
                  <>
                    <IconButton label={`Move ${p.firstName} ${p.lastName} up`} disabled={i === 0} onClick={() => step(i, -1)}>▲</IconButton>
                    <IconButton label={`Move ${p.firstName} ${p.lastName} down`} disabled={i === visible.length - 1} onClick={() => step(i, 1)}>▼</IconButton>
                  </>
                }
              />
            );
          }}
        </DragList>
        {!visible.length ? <div style={{ ...hint, padding: 10 }}>No players match.</div> : null}
      </div>
      {visible.length > shown ? (
        <button style={secondaryButton} onClick={() => setShown((n) => n + PAGE)}>Show More ({visible.length - shown} left)</button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
/**
 * One ranked group (a target group or a position): its players in order (drag, ▲ ▼, tap the
 * number, ✕ to take out), and "Add Players", which lists everyone who can go in with an Add
 * button (sorted by the chosen stat).
 */
function RankedGroup({
  title,
  ids,
  setIds,
  byId,
  eligible,
  view,
  tagFor,
  emptyText,
  onOpen,
}: {
  title: string;
  ids: string[];
  setIds: (ids: string[]) => void;
  byId: Map<string, LinePlayer>;
  /** everyone who can be added */
  eligible: LinePlayer[];
  view: PlayerView;
  /** a tag in the Add list (e.g. "Mid target": adding him moves him here) */
  tagFor?: (p: LinePlayer) => string | undefined;
  emptyText: string;
  onOpen: (p: LinePlayer) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const inGroup = new Set(ids);
  const all = ids.map((id) => byId.get(id)).filter((p): p is LinePlayer => !!p);
  const list = all.filter(view.matches);
  const matches = useMemo(() => view.byStat(eligible.filter(view.matches)), [eligible, view]);

  if (adding) {
    return (
      <div style={column}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Add to {title}</div>
          <button style={{ ...primaryButton, height: 32, width: "auto", padding: "0 16px", fontSize: 12 }} onClick={() => { setAdding(false); setShown(PAGE); }}>
            Done ({ids.length})
          </button>
        </div>
        <StrategyFilterBar view={view} />
        <div style={{ ...innerBox, padding: 0 }}>
          <ListHeading view={view} rightWidth={72} />
          {matches.slice(0, shown).map((p) => {
            const added = inGroup.has(p.id);
            return (
              <PlayerLine
                key={p.id}
                p={p}
                tag={added ? undefined : tagFor?.(p)}
                tagTone="grey"
                highlight={added}
                stat={view.statText(p)}
                onOpen={() => onOpen(p)}
                right={
                  added ? (
                    <button
                      aria-label={`Take ${p.firstName} ${p.lastName} out of ${title}`}
                      style={{ ...smallButton, width: 72, padding: 0, color: teal, borderColor: teal }}
                      onClick={() => setIds(ids.filter((x) => x !== p.id))}
                    >
                      Added ✓
                    </button>
                  ) : (
                    <button
                      aria-label={`Add ${p.firstName} ${p.lastName} to ${title}`}
                      style={{ ...primaryButton, height: 32, width: 72, padding: 0, fontSize: 12 }}
                      onClick={() => setIds([...ids, p.id])}
                    >
                      Add
                    </button>
                  )
                }
              />
            );
          })}
          {!matches.length ? <div style={{ ...hint, padding: 10 }}>No players match.</div> : null}
        </div>
        {matches.length > shown ? (
          <button style={secondaryButton} onClick={() => setShown((n) => n + PAGE)}>Show More ({matches.length - shown} left)</button>
        ) : null}
      </div>
    );
  }

  return (
    <div style={column}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>
          {title} ({all.length})
        </div>
        <button style={{ ...primaryButton, height: 32, width: "auto", padding: "0 14px", fontSize: 12 }} onClick={() => setAdding(true)}>
          + Add Players
        </button>
      </div>
      {all.length ? (
        <>
          <StrategyFilterBar view={view} />
          <div style={{ ...innerBox, padding: 0 }}>
            <ListHeading view={view} rightWidth={92} />
            <DragList ids={list.map((p) => p.id)} onMove={(id, overId) => setIds(moved(ids, id, ids.indexOf(overId)))}>
              {(id) => {
                const p = byId.get(id)!;
                const i = list.indexOf(p);
                const rank = ids.indexOf(id);
                return (
                  <PlayerLine
                    p={p}
                    number={<RankNumber p={p} rank={rank + 1} onMove={(to) => setIds(moved(ids, p.id, to))} />}
                    stat={view.statText(p)}
                    onOpen={() => onOpen(p)}
                    right={
                      <>
                        <IconButton label={`Move ${p.firstName} ${p.lastName} up`} disabled={i === 0} onClick={() => setIds(moved(ids, p.id, ids.indexOf(list[i - 1].id)))}>▲</IconButton>
                        <IconButton label={`Move ${p.firstName} ${p.lastName} down`} disabled={i === list.length - 1} onClick={() => setIds(moved(ids, p.id, ids.indexOf(list[i + 1].id)))}>▼</IconButton>
                        <IconButton label={`Take ${p.firstName} ${p.lastName} out of ${title}`} onClick={() => setIds(ids.filter((x) => x !== p.id))}>✕</IconButton>
                      </>
                    }
                  />
                );
              }}
            </DragList>
            {!list.length ? <div style={{ ...hint, padding: 10 }}>No players match.</div> : null}
          </div>
        </>
      ) : (
        <div style={{ ...innerBox, ...hint, padding: 12 }}>{emptyText}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function TargetsTab({ strategy, update, players, view, onOpen }: TabProps) {
  const [group, setGroup] = useState<TargetGroup>("early");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const groups = useMemo(() => targetGroups(strategy), [strategy]);
  const label = TARGET_GROUPS.find((g) => g.key === group)!.label;
  // a player is in one group at most: adding him here takes him out of the others
  const setIds = (ids: string[]) =>
    update((s) => {
      const here = new Set(ids);
      const targets = { ...s.targets };
      for (const { key } of TARGET_GROUPS) targets[key] = key === group ? ids : targets[key].filter((id) => !here.has(id));
      return { ...s, targets };
    });
  return (
    <div style={column}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {TARGET_GROUPS.map((g) => (
          <Chip key={g.key} active={group === g.key} onClick={() => setGroup(g.key)}>
            {g.label} ({strategy.targets[g.key].length})
          </Chip>
        ))}
      </div>
      <RankedGroup
        key={group}
        title={label}
        ids={strategy.targets[group]}
        setIds={setIds}
        byId={byId}
        eligible={players}
        view={view}
        tagFor={(p) => {
          const g = groups.get(p.id);
          return g && g !== group ? `${targetShort(g)} target` : undefined;
        }}
        emptyText={`No ${label.toLowerCase()} targets yet. Tap "Add Players" to choose some.`}
        onOpen={onOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PositionalRankingsTab({ strategy, update, players, view, onOpen }: TabProps) {
  const [pos, setPos] = useState<StrategyPos>("PR");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const eligible = useMemo(() => players.filter((p) => canPlayPosition(p, pos)), [players, pos]);
  const name = POS_NAME[pos] ?? pos;
  const plural = name === "Flyhalf" ? "Flyhalves" : `${name}s`;
  return (
    <div style={column}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {STRATEGY_POSITIONS.map((p) => (
          <Chip key={p} active={pos === p} onClick={() => setPos(p)}>
            {p} ({strategy.positions[p]?.length ?? 0})
          </Chip>
        ))}
      </div>
      <RankedGroup
        key={pos}
        title={plural}
        ids={strategy.positions[pos] ?? []}
        setIds={(ids) => update((s) => ({ ...s, positions: { ...s.positions, [pos]: ids } }))}
        byId={byId}
        eligible={eligible}
        view={view}
        emptyText={`No ${plural.toLowerCase()} ranked yet. Tap "Add Players" to choose some.`}
        onOpen={onOpen}
      />
    </div>
  );
}
