"use client";
// components/mockDraft/MockRoom.tsx
// The mock draft while it's on: who's picking (and your clock), your plan for this round, and
// three tabs: Players (draft from here), My Team, Board (every pick so far).
import React, { useMemo, useState } from "react";
import { Chip, PrepTabs } from "@/components/draftPrep/PrepPage";
import { IconButton, PlayerLine, type LinePlayer } from "@/components/draftPrep/PlayerLine";
import { currentRound, fittingAvailable, mockRosters, onTheClock, pickLabel, picksUntilYou, teamAt, totalPicks, type MockDraft } from "@/lib/draft/mock";
import { planForRound, planLabel, planMatches, STRATEGY_POSITIONS, targetProgress, type DraftStrategy, type StrategyPos } from "@/lib/draft/strategy";
import { assignToSlots, kindShort, rosterSize, slotKind } from "@/lib/league/squad";
import { roundForPick } from "@/lib/draft/rules";
import { canPlayPosition, positionsLabel } from "@/lib/players/positions";
import { card, innerBox, ink, line, muted, num, primaryButton, secondaryButton, teal } from "@/lib/ui/theme";

type P = LinePlayer & { id: string };
const sub: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: muted };
const TABS = ["Players", "My Team", "Board"] as const;
type Tab = (typeof TABS)[number];

/** The round of your next pick (or the current round if you have none left). */
function yourNextRound(m: MockDraft): number {
  const wait = picksUntilYou(m);
  return wait < 0 ? currentRound(m) : roundForPick(m.order.length, m.picks.length + 1 + wait);
}

export function MockRoom({
  mock,
  players,
  byId,
  strategy,
  ranks,
  secondsLeft,
  onPick,
  onOpen,
  onAutoPick,
  onSimToEnd,
  onQuit,
}: {
  mock: MockDraft;
  players: P[];
  byId: Map<string, P>;
  strategy: DraftStrategy | null;
  /** your ranks (your rankings, or Draft Rank) */
  ranks: Map<string, number>;
  /** your clock, or null for no clock / not your pick */
  secondsLeft: number | null;
  onPick: (id: string) => void;
  onOpen: (p: P) => void;
  onAutoPick: () => void;
  onSimToEnd: () => void;
  onQuit: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Players");
  const [confirmQuit, setConfirmQuit] = useState(false);
  const clock = onTheClock(mock);
  const yourTurn = clock === mock.you;
  const n = mock.picks.length + 1;
  const wait = picksUntilYou(mock);
  const round = yourNextRound(mock);
  const plan = planForRound(strategy, round);
  const last = mock.picks.length ? { n: mock.picks.length, p: byId.get(mock.picks[mock.picks.length - 1]) } : null;

  return (
    <>
      <div style={{ ...card, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Round {currentRound(mock)} of {rosterSize(mock.format)}
          </div>
          <div style={{ ...sub, fontSize: 12 }}>Pick {pickLabel(mock, n)} · {n} of {totalPicks(mock)}</div>
        </div>
        <div
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            background: yourTurn ? "linear-gradient(to right, rgb(13,148,136), rgb(16,185,129))" : "#eef2f6",
            color: yourTurn ? "white" : ink,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
          aria-live="polite"
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{yourTurn ? "You're on the clock" : `${mock.teamNames[clock]} is picking…`}</div>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>
              {yourTurn ? "Pick from the Players tab" : wait > 0 ? `Your next pick in ${wait} pick${wait === 1 ? "" : "s"}` : "You have no picks left"}
            </div>
          </div>
          {yourTurn && secondsLeft != null ? (
            <div style={{ ...num, fontSize: 26, fontWeight: 700, color: secondsLeft <= 10 ? "#fde68a" : "white" }}>0:{String(Math.max(0, secondsLeft)).padStart(2, "0")}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Your plan, round {round}:</span>
          <span style={{ padding: "2px 8px", borderRadius: 999, background: plan ? "rgba(13,148,136,0.12)" : "#eef2f6", color: plan ? teal : muted, fontSize: 12, fontWeight: 700 }}>{planLabel(plan)}</span>
        </div>
        {last?.p ? (
          <div style={sub}>
            Last pick: {pickLabel(mock, last.n)} {mock.teamNames[teamAt(mock, last.n)]}: <b style={{ color: ink }}>{last.p.firstName} {last.p.lastName}</b> ({positionsLabel(last.p)})
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={{ ...secondaryButton, height: 32, fontSize: 12, opacity: yourTurn ? 1 : 0.45 }} disabled={!yourTurn} onClick={onAutoPick}>Auto-Pick for Me</button>
          <button style={{ ...secondaryButton, height: 32, fontSize: 12 }} onClick={onSimToEnd}>Finish It for Me</button>
        </div>
        {confirmQuit ? (
          <div style={{ ...innerBox, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Quit this mock draft? It won&apos;t be kept.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button style={{ ...primaryButton, height: 32, fontSize: 12, background: "#ef4444" }} onClick={onQuit}>Quit</button>
              <button style={{ ...secondaryButton, height: 32, fontSize: 12 }} onClick={() => setConfirmQuit(false)}>Keep Going</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmQuit(true)} style={{ background: "transparent", border: "none", color: muted, fontSize: 12, fontWeight: 600, cursor: "pointer", justifySelf: "center" }}>
            Quit mock draft
          </button>
        )}
      </div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <PrepTabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === "Players" ? (
          <PlayersTab mock={mock} players={players} byId={byId} strategy={strategy} ranks={ranks} plan={plan} yourTurn={yourTurn} onPick={onPick} onOpen={onOpen} />
        ) : tab === "My Team" ? (
          <TeamView mock={mock} team={mock.you} byId={byId} strategy={strategy} onOpen={onOpen} />
        ) : (
          <BoardView mock={mock} byId={byId} onOpen={onOpen} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
const PAGE = 60;

function PlayersTab({
  mock,
  players,
  byId,
  strategy,
  ranks,
  plan,
  yourTurn,
  onPick,
  onOpen,
}: {
  mock: MockDraft;
  players: P[];
  byId: Map<string, P>;
  strategy: DraftStrategy | null;
  ranks: Map<string, number>;
  plan: ReturnType<typeof planForRound>;
  yourTurn: boolean;
  onPick: (id: string) => void;
  onOpen: (p: P) => void;
}) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<StrategyPos | "">("");
  const [byMine, setByMine] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const custom = (strategy?.ranking.length ?? 0) > 0;
  const avoid = useMemo(() => new Set(strategy?.avoid ?? []), [strategy]);
  const fits = useMemo(() => new Set(fittingAvailable(mock, players, mock.you, byId).map((p) => p.id)), [mock, players, byId]);
  const list = useMemo(() => {
    const taken = new Set(mock.picks);
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = players.filter(
      (p) => !taken.has(p.id) && (!pos || canPlayPosition(p, pos)) && words.every((w) => `${p.firstName} ${p.lastName} ${p.teamCode}`.toLowerCase().includes(w))
    );
    const key = (p: P) => (byMine && custom ? ranks.get(p.id) ?? 9999 : p.draftRank ?? 9999);
    return out.sort((a, b) => key(a) - key(b));
  }, [players, mock.picks, q, pos, byMine, custom, ranks]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        placeholder="Search players"
        aria-label="Search players"
        value={q}
        onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
        style={{ height: 36, borderRadius: 10, border: `1px solid ${line}`, padding: "0 10px", fontSize: 14, color: ink, boxSizing: "border-box", width: "100%" }}
      />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        <Chip active={!pos} onClick={() => setPos("")}>All</Chip>
        {STRATEGY_POSITIONS.map((p) => (
          <Chip key={p} active={pos === p} onClick={() => { setPos(p); setShown(PAGE); }}>{p}</Chip>
        ))}
      </div>
      {custom ? (
        <div style={{ display: "flex", gap: 6 }}>
          <Chip active={byMine} onClick={() => setByMine(true)}>My Rankings</Chip>
          <Chip active={!byMine} onClick={() => setByMine(false)}>Draft Rank</Chip>
        </div>
      ) : null}
      <div style={{ ...innerBox, padding: 0 }}>
        {list.slice(0, shown).map((p) => {
          const ok = fits.has(p.id);
          const isPlan = !!plan && planMatches(p, plan);
          return (
            <PlayerLine
              key={p.id}
              p={p}
              number={byMine && custom ? ranks.get(p.id) : p.draftRank}
              numberLabel={byMine && custom ? "Your rank" : "Draft Rank"}
              highlight={isPlan && !avoid.has(p.id)}
              dim={avoid.has(p.id)}
              tag={avoid.has(p.id) ? "Do not draft" : isPlan ? "Plan" : !ok ? "No room" : undefined}
              tagTone={avoid.has(p.id) ? "red" : isPlan ? "teal" : "grey"}
              onOpen={() => onOpen(p)}
              right={
                <button
                  onClick={() => onPick(p.id)}
                  disabled={!yourTurn || !ok}
                  style={{ ...primaryButton, height: 30, width: 64, fontSize: 12, opacity: yourTurn && ok ? 1 : 0.3 }}
                >
                  Draft
                </button>
              }
            />
          );
        })}
        {!list.length ? <div style={{ ...sub, padding: 10 }}>No players match.</div> : null}
      </div>
      {list.length > shown ? <button style={secondaryButton} onClick={() => setShown((x) => x + PAGE)}>Show More ({list.length - shown} left)</button> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function TeamView({ mock, team, byId, strategy, onOpen }: { mock: MockDraft; team: number; byId: Map<string, P>; strategy: DraftStrategy | null; onOpen: (p: P) => void }) {
  const ids = mockRosters(mock)[team];
  const roster = ids.map((id) => byId.get(id)).filter((p): p is P => !!p);
  const slots = assignToSlots(roster, mock.format);
  const pickOf = new Map<string, number>();
  mock.picks.forEach((id, i) => pickOf.set(id, i + 1));
  const progress = team === mock.you ? targetProgress(roster, strategy).filter((t) => t.want > 0) : [];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {progress.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {progress.map((t) => (
            <span key={t.pos} style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: t.have >= t.want ? "rgba(13,148,136,0.12)" : "#eef2f6", color: t.have >= t.want ? teal : ink }}>
              {t.pos} {t.have}/{t.want}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ ...innerBox, padding: 0 }}>
        {[...slots.entries()].map(([slotId, p]) => {
          const k = slotKind(slotId);
          const label = k ? kindShort(k) : "Bench";
          return p ? (
            <PlayerLine key={slotId} p={p} number={<span style={{ fontSize: 11, fontWeight: 700, color: muted }}>{label}</span>} tag={`Pick ${pickLabel(mock, pickOf.get(p.id) ?? 0)}`} tagTone="grey" onOpen={() => onOpen(p)} />
          ) : (
            <div key={slotId} style={{ display: "flex", gap: 8, padding: "10px 8px", borderBottom: `1px solid ${line}`, fontSize: 12, color: muted }}>
              <span style={{ width: 30, textAlign: "center", fontSize: 10 }}>{label}</span>
              <span>Empty</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function BoardView({ mock, byId, onOpen }: { mock: MockDraft; byId: Map<string, P>; onOpen: (p: P) => void }) {
  const teams = mock.order.length;
  const rounds = Math.ceil((mock.picks.length + 1) / teams);
  const [openRound, setOpenRound] = useState<number | null>(null);
  const showing = openRound ?? Math.min(rounds, roundForPick(teams, Math.min(mock.picks.length + 1, totalPicks(mock))));
  const first = (showing - 1) * teams + 1;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton label="Previous round" disabled={showing <= 1} onClick={() => setOpenRound(showing - 1)}>‹</IconButton>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Round {showing}</div>
        <IconButton label="Next round" disabled={showing >= rosterSize(mock.format) || first + teams > mock.picks.length + 1} onClick={() => setOpenRound(showing + 1)}>›</IconButton>
      </div>
      <div style={{ ...innerBox, padding: 0 }}>
        {Array.from({ length: teams }, (_, i) => {
          const n = first + i;
          if (n > totalPicks(mock)) return null;
          const team = teamAt(mock, n);
          const id = mock.picks[n - 1];
          const p = id ? byId.get(id) : undefined;
          const mine = team === mock.you;
          return (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderBottom: `1px solid ${line}`, background: mine ? "rgba(13,148,136,0.08)" : "transparent" }}>
              <span style={{ ...num, width: 36, fontSize: 13, fontWeight: 700 }}>{pickLabel(mock, n)}</span>
              <span style={{ width: 98, fontSize: 11, fontWeight: mine ? 800 : 600, color: mine ? teal : muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mock.teamNames[team]}</span>
              {p ? (
                <button onClick={() => onOpen(p)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", color: ink, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.firstName} {p.lastName} <span style={{ color: muted, fontWeight: 500 }}>{positionsLabel(p)}</span>
                </button>
              ) : (
                <span style={{ flex: 1, fontSize: 12, color: n === mock.picks.length + 1 ? teal : muted, fontWeight: 600 }}>{n === mock.picks.length + 1 ? "On the clock" : "—"}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
