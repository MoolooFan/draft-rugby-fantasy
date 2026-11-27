"use client";
// app/mock-draft/page.tsx
// Mock Draft (Ethan, 21 Nov 2026): practise against computer teams, with or without a league,
// before or after a league's draft. Settings -> the draft -> results (lib/draft/mock.ts). The
// computer teams pick with lib/draft/cpu.ts; your auto-picks use your draft strategy. Nothing
// is saved to any league; the last 5 finished mock drafts are kept on this device.
import { useIsClient } from "@/lib/hooks/useIsClient";
import { useNow } from "@/lib/hooks/useNow";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore, loadMyLeagues } from "@/lib/league/store";
import { usePlayerPool } from "@/lib/players/pool";
import { useStatSeasonRows } from "@/lib/players/useStatSeason";
import { seasonTotals } from "@/lib/players/seasonTotals";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { isStandardSquad } from "@/lib/league/squad";
import { draftValues, type PlayerForm } from "@/lib/draft/cpu";
import { isEmptyStrategy, myRanks } from "@/lib/draft/strategy";
import { useDraftStrategy } from "@/lib/draft/useStrategy";
import {
  autoChoice,
  fittingAvailable,
  HISTORY_SIZE,
  isFinished,
  loadHistory,
  loadLive,
  mockFormat,
  onTheClock,
  saveLive,
  saveToHistory,
  SPEED_MS,
  startMock,
  withPick,
  type MockDraft,
  type MockSettings,
} from "@/lib/draft/mock";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { PrepPage } from "@/components/draftPrep/PrepPage";
import type { LinePlayer } from "@/components/draftPrep/PlayerLine";
import { MockSetup } from "@/components/mockDraft/MockSetup";
import { MockRoom } from "@/components/mockDraft/MockRoom";
import { MockResults } from "@/components/mockDraft/MockResults";
import { card, muted } from "@/lib/ui/theme";

type P = LinePlayer & { id: string };
type View = "setup" | "draft" | "results";

const SETTINGS_KEY = "sr-mock-settings-v1";
const DEFAULT_SETTINGS: MockSettings = { teams: 10, slot: 0, squad: "standard", timer: 60, speed: "normal" };
const INJURED = /out|injur|suspend/i;

export default function MockDraftPage() {
  useRequireSession();
  const router = useRouter();
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  useEffect(() => {
    void loadMyLeagues();
  }, []);

  // the league it's for: ?leagueId= (from the draft room), else the active league. Read once the
  // page is in the browser (so the server and browser draw the same first; React 19 rules)
  const isClient = useIsClient();
  const queryLeague = isClient ? new URLSearchParams(window.location.search).get("leagueId") : null;
  const league = leagues.find((l) => l.id === (queryLeague ?? activeLeagueId)) ?? null;
  const leagueFormat = league?.squadFormat && !isStandardSquad(league.squadFormat) ? league.squadFormat : null;
  const { strategy, loaded: strategyLoaded } = useDraftStrategy(league?.id ?? null);

  // settings (remembered on this device)
  const [settings, setSettingsState] = useState<MockSettings>(DEFAULT_SETTINGS);
  // set once they've changed the settings (or saved ones were found on this device)
  const [settingsTouched, setSettingsTouched] = useState(false);
  // a league's size and squad, until they change the settings themselves (set while drawing)
  const sizeKey = league && !settingsTouched ? `${league.id}:${league.teams?.length ?? 0}:${leagueFormat ? 1 : 0}` : null;
  const [sizedFor, setSizedFor] = useState<string | null>(null);
  if (sizeKey && sizeKey !== sizedFor) {
    setSizedFor(sizeKey);
    const n = league?.teams?.length ?? 0;
    setSettingsState((s) => ({ ...s, teams: n >= 2 ? n : s.teams, squad: leagueFormat ? "league" : "standard" }));
  }
  const setSettings = (s: MockSettings) => {
    setSettingsTouched(true);
    setSettingsState(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, leagueId: undefined, leagueName: undefined }));
    } catch {
      /* fine */
    }
  };
  const effectiveSettings: MockSettings = { ...settings, squad: settings.squad === "league" && !leagueFormat ? "standard" : settings.squad, leagueId: league?.id ?? null, leagueName: league?.name ?? null };

  // players and their worth to the computer teams
  const pool = usePlayerPool();
  const players: P[] = useMemo(
    () => pool.map((p) => ({ ...p, teamCode: normalizeTeamCode(p.teamCode), draftRank: p.draftRank ?? 9999 })).sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999)),
    [pool]
  );
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const { rows: statRows } = useStatSeasonRows();
  const form = useMemo(() => {
    const m = new Map<string, PlayerForm>();
    for (const p of players) {
      const t = seasonTotals(statRows, p);
      if (t.games) m.set(p.id, { ppg: t.points / t.games, games: t.games });
    }
    return m;
  }, [players, statRows]);

  const [mock, setMock] = useState<MockDraft | null>(null);
  const [view, setView] = useState<View>("setup");
  const [history, setHistory] = useState<MockDraft[]>([]);
  const [live, setLive] = useState<MockDraft | null>(null);
  const [open, setOpen] = useState<P | null>(null);
  const [finishing, setFinishing] = useState(false);
  // what's saved on this device (settings, past mocks, one in progress): read once the page is in
  // the browser, while drawing (not in an effect; React 19 rules)
  const [storageRead, setStorageRead] = useState(false);
  if (isClient && !storageRead) {
    setStorageRead(true);
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        setSettingsState({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        setSettingsTouched(true);
      }
    } catch {
      /* no storage: defaults */
    }
    setHistory(loadHistory());
    setLive(loadLive());
  }

  const values = useMemo(() => {
    const format = mock?.format ?? mockFormat(effectiveSettings, leagueFormat);
    const v = draftValues(players, format, mock?.order.length ?? effectiveSettings.teams, form);
    for (const p of players) if (INJURED.test(String(p.status ?? ""))) v.value.set(p.id, (v.value.get(p.id) ?? 0) * 0.6);
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, form, mock?.id, effectiveSettings.teams, effectiveSettings.squad, leagueFormat]);
  const ranks = useMemo(() => myRanks(players, strategy), [players, strategy]);
  const strat = isEmptyStrategy(strategy) ? null : strategy;

  // a finished mock: off the "in progress" list, into the history, and the results showing (set
  // while drawing, once per mock)
  const finishedId = mock && isFinished(mock) ? mock.id : null;
  const [finishedSeen, setFinishedSeen] = useState<string | null>(null);
  if (mock && finishedId && finishedId !== finishedSeen) {
    setFinishedSeen(finishedId);
    setLive(null);
    // (one opened from the history is already there)
    setHistory((h) => (h.some((x) => x.id === mock.id) ? h : [mock, ...h].slice(0, HISTORY_SIZE)));
    setView("results");
  }
  // ...and on this device: keep the one in progress; a finished one goes in the saved history
  useEffect(() => {
    if (!mock) return;
    if (isFinished(mock)) {
      saveLive(null);
      if (!loadHistory().some((x) => x.id === mock.id)) saveToHistory(mock);
    } else if (view === "draft") {
      saveLive(mock);
    }
  }, [mock, view]);

  const makePick = (id: string) => setMock((m) => (m && !isFinished(m) && !m.picks.includes(id) ? withPick(m, id, byId, values) : m));
  const autoPick = () =>
    setMock((m) => {
      if (!m || isFinished(m)) return m;
      const c = autoChoice(m, players, byId, values, strat);
      return c ? withPick(m, c.id, byId, values) : m;
    });

  // the computer teams pick, one at a time
  const clock = mock && view === "draft" ? onTheClock(mock) : -1;
  useEffect(() => {
    if (!mock || view !== "draft" || clock < 0 || clock === mock.you || finishing) return;
    const t = window.setTimeout(autoPick, SPEED_MS[mock.settings.speed] ?? 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mock?.picks.length, view, clock, finishing]);

  // your clock: starts when it's your pick (noted while drawing), auto-picks when it runs out
  const now = useNow(250);
  const yourTurn = !!mock && view === "draft" && clock === mock.you;
  const turnKey = yourTurn && mock ? `${mock.id}:${mock.picks.length}` : null;
  const [turnStart, setTurnStart] = useState<{ key: string | null; at: number }>({ key: null, at: 0 });
  if (turnStart.key !== turnKey) setTurnStart({ key: turnKey, at: now });
  const deadline = turnKey && turnStart.key === turnKey && mock?.settings.timer ? turnStart.at + mock.settings.timer * 1000 : null;
  const autoPickedFor = useRef<string | null>(null);
  useEffect(() => {
    if (deadline != null && now >= deadline && yourTurn && autoPickedFor.current !== turnKey) {
      autoPickedFor.current = turnKey; // once per turn
      autoPick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, deadline, yourTurn, turnKey]);

  const start = () => {
    const s = effectiveSettings;
    const m = startMock(s, mockFormat(s, leagueFormat));
    setMock(m);
    setView("draft");
    window.scrollTo(0, 0);
  };
  const simToEnd = () => {
    if (!mock) return;
    setFinishing(true);
    window.setTimeout(() => {
      let m = mock;
      while (!isFinished(m)) {
        const c = autoChoice(m, players, byId, values, strat);
        if (!c) break;
        m = withPick(m, c.id, byId, values);
      }
      setMock(m);
      setFinishing(false);
      window.scrollTo(0, 0);
    }, 30);
  };

  const canDraftOpen = !!open && yourTurn && !!mock && fittingAvailable(mock, [open], mock.you, byId).length > 0;

  return (
    <PrepPage
      title="Mock Draft"
      subtitle={league ? `Practise for ${league.name} against computer teams.` : "Practise your draft against computer teams."}
      activeItem="Mock Draft"
    >
      {!players.length || !strategyLoaded ? (
        <div style={{ ...card, fontSize: 13, color: muted }}>Loading players…</div>
      ) : finishing ? (
        <div style={{ ...card, fontSize: 13, color: muted }}>Finishing the draft…</div>
      ) : view === "draft" && mock ? (
        <MockRoom
          mock={mock}
          players={players}
          byId={byId}
          strategy={strat}
          ranks={ranks}
          secondsLeft={deadline != null ? Math.ceil((deadline - now) / 1000) : null}
          onPick={makePick}
          onOpen={setOpen}
          onAutoPick={autoPick}
          onSimToEnd={simToEnd}
          onQuit={() => {
            saveLive(null);
            setLive(null);
            setMock(null);
            setView("setup");
          }}
        />
      ) : view === "results" && mock ? (
        <MockResults mock={mock} byId={byId} onOpen={setOpen} onAgain={start} onSettings={() => { setMock(null); setView("setup"); }} />
      ) : (
        <MockSetup
          settings={effectiveSettings}
          setSettings={setSettings}
          leagueFormat={leagueFormat}
          hasStrategy={!!strat}
          live={live}
          history={history}
          onStart={start}
          onResume={() => {
            if (!live) return;
            setMock(live);
            setView("draft");
          }}
          onDiscardLive={() => {
            saveLive(null);
            setLive(null);
          }}
          onOpenHistory={(m) => {
            setMock(m);
            setView("results");
          }}
          // Draft Strategy lives in the draft room (since 25 Nov 2026): open it there for this league
          onEditStrategy={
            league && league.draftStatus !== "complete"
              ? () => {
                  setActiveLeague(league.id);
                  router.push("/draft-room#strategy");
                }
              : undefined
          }
        />
      )}

      {open ? (
        <PlayerCardModal
          onClose={() => setOpen(null)}
          player={{ ...open, posName: open.posAbbrev, secondaryPosAbbrev: open.secondaryPosAbbrev ?? undefined }}
          teamLabel=""
          initialTab="Stats"
          hideActions={!canDraftOpen}
          actions={canDraftOpen ? [{ label: "Draft", onClick: () => { makePick(open.id); setOpen(null); }, variant: "primary" }] : []}
        />
      ) : null}
    </PrepPage>
  );
}
