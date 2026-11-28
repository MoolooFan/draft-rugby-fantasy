"use client";
// lib/draft/lottery/useLottery.ts
// The league's draft lottery for the Draft Room (app/api/draft/lottery). Checks every minute,
// every 10 seconds in the 10 minutes before a run, and every second around its time, so phones
// pick up the result (and the race) the moment the server runs it.
import { useCallback, useState } from "react";
import { usePoll } from "@/lib/hooks/usePoll";

export type LotteryRun = {
  id: string;
  runNumber: number;
  scheduledAt: number;
  /** when the race started (null: still waiting) */
  ranAt: number | null;
  seed: number | null;
  /** the runners, lane by lane */
  teamIds: string[] | null;
  /** the order it set, first pick first */
  resultTeamIds: string[] | null;
};

export type LotteryData = {
  isCommissioner: boolean;
  phase: string;
  order: string[];
  orderSource: string | null;
  teams: Array<{ id: string; name: string }>;
  runs: LotteryRun[];
  /** server time minus this phone's time (so everyone's race lines up) */
  offsetMs: number;
};

/** How long a run counts as "on now" after it starts (countdown + the race + a few seconds). */
export const LOTTERY_LIVE_MS = 45_000;

export function useLottery(leagueId: string | null) {
  const [data, setData] = useState<LotteryData | null>(null);
  const [dataFor, setDataFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leagueId) return;
    const sent = Date.now();
    const res = await fetch(`/api/draft/lottery?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return;
    const got = Date.now();
    // the server's time when it answered, against ours halfway through the request
    const offsetMs = Number(j.serverNow) - (sent + got) / 2;
    setData({ isCommissioner: !!j.isCommissioner, phase: j.phase, order: j.order ?? [], orderSource: j.orderSource ?? null, teams: j.teams ?? [], runs: j.runs ?? [], offsetMs });
    setDataFor(leagueId);
  }, [leagueId]);

  usePoll(
    leagueId ? load : null,
    () => {
      const waiting = data?.runs.find((r) => !r.ranAt);
      if (!waiting || (data && data.phase !== "preDraft" && data.phase !== "scheduled")) return 60_000;
      const until = waiting.scheduledAt - (Date.now() + (data?.offsetMs ?? 0));
      if (until < 20_000) return 1_000;
      if (until < 10 * 60_000) return 10_000;
      return 60_000;
    },
    leagueId
  );

  /** Commissioner: set / move the lottery time, or cancel it. Returns an error message, if any. */
  const act = useCallback(
    async (action: "schedule" | "cancel", at?: number): Promise<string | null> => {
      if (!leagueId) return "No league";
      const res = await fetch("/api/draft/lottery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leagueId, action, at }) });
      const j = await res.json().catch(() => null);
      await load();
      return res.ok && j?.ok ? null : (j?.error ?? "Couldn't save that, try again");
    },
    [leagueId, load]
  );

  return { data: dataFor === leagueId ? data : null, reload: load, act };
}
