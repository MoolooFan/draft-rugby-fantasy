"use client";
// app/draft-strategy/page.tsx
// Draft Strategy (Ethan, 21 Nov 2026; like ESPN's): plan your draft before it starts. Four tabs:
// Round Plan, Targets, Do Not Draft and My Rankings (lib/draft/strategy.ts). You have a default
// strategy (used for mock drafts and any league without its own); each league can have its own.
// The draft watchlist (in the draft room) is separate and still comes first for auto-pick.
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore, loadMyLeagues } from "@/lib/league/store";
import { usePlayerPool } from "@/lib/players/pool";
import { useDraftStrategy } from "@/lib/draft/useStrategy";
import { isEmptyStrategy } from "@/lib/draft/strategy";
import { STANDARD_SQUAD } from "@/lib/league/squad";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { Chip, PrepPage, PrepTabs } from "@/components/draftPrep/PrepPage";
import { AvoidTab, RankingsTab, RoundPlanTab, TargetsTab } from "@/components/draftPrep/StrategyTabs";
import type { LinePlayer } from "@/components/draftPrep/PlayerLine";
import { card, muted, primaryButton, secondaryButton, teal } from "@/lib/ui/theme";

const TABS = ["Round Plan", "Targets", "Do Not Draft", "My Rankings"] as const;
type Tab = (typeof TABS)[number];

export default function DraftStrategyPage() {
  useRequireSession();
  const router = useRouter();
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  useEffect(() => {
    void loadMyLeagues();
  }, []);

  // leagues still to draft can have their own strategy
  const draftLeagues = useMemo(() => leagues.filter((l) => l.draftStatus !== "complete"), [leagues]);
  const [scope, setScope] = useState<string | null | undefined>(undefined); // undefined = not chosen yet
  const scopeId = scope === undefined ? (draftLeagues.some((l) => l.id === activeLeagueId) ? activeLeagueId : null) : scope;
  const league = draftLeagues.find((l) => l.id === scopeId) ?? null;
  const format = league?.squadFormat ?? STANDARD_SQUAD;

  const { strategy, update, source, loaded, saving, error, revertToDefault } = useDraftStrategy(league?.id ?? null);
  const [tab, setTab] = useState<Tab>("Round Plan");
  const [open, setOpen] = useState<LinePlayer | null>(null);

  const pool = usePlayerPool();
  const players: LinePlayer[] = useMemo(
    () =>
      pool
        .map((p) => ({ ...p, teamCode: normalizeTeamCode(p.teamCode), draftRank: p.draftRank ?? 9999 }))
        .sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999)),
    [pool]
  );

  const sourceText = !league
    ? "Your default: used for mock drafts and any league without its own strategy."
    : source === "league"
    ? `${league.name} has its own strategy.`
    : `${league.name} is using your default strategy. Change anything to give it its own.`;

  return (
    <PrepPage
      title="Draft Strategy"
      subtitle="Plan your draft: positions by round, targets, players to avoid and your own rankings."
      activeItem="Draft Strategy"
      headerExtra={
        draftLeagues.length ? (
          <div style={{ marginTop: 10, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            <Chip active={!league} onClick={() => setScope(null)}>My default</Chip>
            {draftLeagues.map((l) => (
              <Chip key={l.id} active={league?.id === l.id} onClick={() => setScope(l.id)}>{l.name}</Chip>
            ))}
          </div>
        ) : null
      }
    >
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: muted, lineHeight: 1.4 }}>{sourceText}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: error ? "#dc2626" : teal, whiteSpace: "nowrap" }} aria-live="polite">
            {error ? "Not saved" : saving ? "Saving…" : loaded && !isEmptyStrategy(strategy) ? "Saved" : ""}
          </div>
        </div>
        {league && source === "league" ? (
          <button style={{ ...secondaryButton, height: 32, fontSize: 12 }} onClick={() => void revertToDefault()}>Use My Default Instead</button>
        ) : null}
        <PrepTabs tabs={TABS} active={tab} onChange={setTab} />
        {!loaded ? (
          <div style={{ fontSize: 13, color: muted, padding: 10 }}>Loading…</div>
        ) : tab === "Round Plan" ? (
          <RoundPlanTab strategy={strategy} update={update} format={format} />
        ) : tab === "Targets" ? (
          <TargetsTab strategy={strategy} update={update} format={format} />
        ) : tab === "Do Not Draft" ? (
          <AvoidTab strategy={strategy} update={update} players={players} onOpen={setOpen} />
        ) : (
          <RankingsTab strategy={strategy} update={update} players={players} onOpen={setOpen} />
        )}
      </div>

      <div style={{ ...card, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Try it out</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>Practise against computer teams. Nothing you pick there counts anywhere.</div>
        <button style={primaryButton} onClick={() => router.push(league ? `/mock-draft?leagueId=${encodeURIComponent(league.id)}` : "/mock-draft")}>Start a Mock Draft</button>
        {league ? <button style={secondaryButton} onClick={() => router.push("/draft-room")}>Go to the Draft Room</button> : null}
      </div>

      {open ? (
        <PlayerCardModal
          onClose={() => setOpen(null)}
          player={{ ...open, posName: open.posAbbrev, secondaryPosAbbrev: open.secondaryPosAbbrev ?? undefined }}
          teamLabel=""
          initialTab="Stats"
          actions={[
            strategy.avoid.includes(open.id)
              ? { label: "Remove from Do Not Draft", onClick: () => update((s) => ({ ...s, avoid: s.avoid.filter((x) => x !== open.id) })), variant: "secondary" }
              : { label: "Add to Do Not Draft", onClick: () => update((s) => ({ ...s, avoid: [...s.avoid, open.id] })), variant: "secondary" },
          ]}
        />
      ) : null}
    </PrepPage>
  );
}
