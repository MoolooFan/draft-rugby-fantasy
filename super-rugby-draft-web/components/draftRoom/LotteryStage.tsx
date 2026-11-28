"use client";
// components/draftRoom/LotteryStage.tsx
// The draft lottery, full screen (Ethan, 28 Nov 2026; his mock is prototypes/draft-lottery.html).
// Live: timed from when the server ran it, so everyone watching sees the same moment, and anyone
// arriving mid-race joins it where it is. Replay: from the start, on this phone only.
// Before it runs: the runners wait on the line with a countdown to the lottery time.
import { useEffect, useMemo, useRef, useState } from "react";
import { Press_Start_2P } from "next/font/google";
import { COUNTDOWN_S, laneColour, simulate } from "@/lib/draft/lottery/sim";
import { lotteryDrawer, type DrawPhase } from "@/lib/draft/lottery/draw";
import type { LotteryRun } from "@/lib/draft/lottery/useLottery";
import { card, ink, line, muted, teal } from "@/lib/ui/theme";

const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"], display: "swap" });
const ACCENT = "#ff5a36";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000)),
    d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    x = String(s % 60).padStart(2, "0");
  if (d) return `${d}d ${h}h ${m}m`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};

export function LotteryStage({
  run,
  teams,
  offsetMs,
  isLatest,
  replay,
  yourTeamId,
  onClose,
}: {
  run: LotteryRun;
  /** the league's teams, in the order they joined (names, and the lanes before it runs) */
  teams: Array<{ id: string; name: string }>;
  offsetMs: number;
  /** the latest run (its order is the draft order) */
  isLatest: boolean;
  /** start from the beginning on this phone, rather than live */
  replay: boolean;
  yourTeamId: string;
  onClose: () => void;
}) {
  const lanes = useMemo(() => run.teamIds ?? teams.map((t) => t.id), [run.teamIds, teams]);
  const colours = useMemo(() => lanes.map((_, i) => laneColour(i)), [lanes]);
  const nameOf = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const sim = useMemo(() => simulate(lanes.length, run.seed ?? 0, true), [lanes.length, run.seed]);
  const revealed = run.seed != null && !!run.ranAt;
  // the order the server saved (the race gives the same; this is the one that counts)
  const order = useMemo(() => (revealed ? (run.resultTeamIds ?? sim.order.map((i) => lanes[i])) : []), [revealed, run.resultTeamIds, sim, lanes]);

  const reduceMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  // replays (and "skip") are timed from this phone's clock: performance.now() when they started
  const [replayFrom, setReplayFrom] = useState<number | null>(() => (replay ? performance.now() - (reduceMotion ? 1e9 : 0) : null));

  const [view, setView] = useState<{ k: number; phase: DrawPhase; chip: string }>({ k: 0, phase: "idle", chip: "" });

  const stageRef = useRef<HTMLDivElement>(null);
  const pxRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  // each runner's team, written under them on the line before the start (Ethan, 28 Nov 2026)
  const labels = useMemo(() => lanes.map((id) => nameOf.get(id) ?? "Team"), [lanes, nameOf]);
  const yourLane = lanes.indexOf(yourTeamId);
  const live = useRef({ sim, run, offsetMs, replayFrom, colours, revealed, isLatest, reduceMotion, labels, yourLane });
  useEffect(() => {
    live.current = { sim, run, offsetMs, replayFrom, colours, revealed, isLatest, reduceMotion, labels, yourLane };
  });

  useEffect(() => {
    const px = pxRef.current,
      ov = ovRef.current,
      stage = stageRef.current;
    if (!px || !ov || !stage) return;
    // the site's Barlow font for the team names (its real name is set by next/font on the page)
    const barlow = getComputedStyle(document.body).getPropertyValue("--font-barlow").trim() || getComputedStyle(document.body).fontFamily;
    const draw = lotteryDrawer(px, ov, pixel.style.fontFamily, `${barlow}, Arial, sans-serif`);
    const ro = new ResizeObserver(() => {
      const d = window.devicePixelRatio || 1;
      ov.width = Math.round(ov.clientWidth * d);
      ov.height = Math.round(ov.clientHeight * d);
    });
    ro.observe(stage);
    let raf = 0;
    let shown = { k: -1, phase: "" as string, chip: "" };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const { sim, run, offsetMs, replayFrom, colours, revealed, isLatest, reduceMotion, labels, yourLane } = live.current;
      const serverNow = Date.now() + offsetMs;
      let T: number;
      let phase: DrawPhase;
      if (!revealed) {
        // waiting for the server to run it (it does at the lottery time)
        T = serverNow < run.scheduledAt ? -COUNTDOWN_S - 1 : Math.min(-0.001, (serverNow - run.scheduledAt) / 1000 - COUNTDOWN_S);
        phase = serverNow < run.scheduledAt ? "idle" : "count";
      } else {
        T = replayFrom != null ? (now - replayFrom) / 1000 - COUNTDOWN_S : (serverNow - (run.ranAt as number)) / 1000 - COUNTDOWN_S;
        if (reduceMotion && replayFrom == null) T = 1e6; // straight to the result
        phase = T < 0 ? "count" : T < sim.end + 1.2 ? "race" : "done";
      }
      draw(now, T, phase, sim, colours, labels, yourLane);
      const k = revealed && T > 0 ? sim.rs.reduce((a, r) => a + (r.fin <= T ? 1 : 0), 0) : 0;
      const n = sim.rs.length;
      const chip =
        phase === "idle"
          ? `Lottery in ${fmt(run.scheduledAt - serverNow)}`
          : phase === "count"
            ? "Get set"
            : phase === "race"
              ? `${replayFrom != null ? "Replay" : "LIVE"} ${k}/${n} scored`
              : isLatest
                ? "Order locked"
                : `Run ${run.runNumber} result`;
      if (k !== shown.k || phase !== shown.phase || chip !== shown.chip) {
        shown = { k, phase, chip };
        setView({ k, phase, chip });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const laneOf = (teamId: string) => lanes.indexOf(teamId);
  const btn: React.CSSProperties = { minHeight: 40, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.6)", background: "transparent", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Draft lottery"
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))", overflowY: "auto", color: "white" }}
    >
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "calc(14px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className={pixel.className} style={{ fontSize: 16, lineHeight: 1.4 }}>
            Draft lottery
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: run.runNumber > 1 ? ACCENT : "rgba(255,255,255,0.16)" }}>
            Run {run.runNumber}
            {run.runNumber > 1 ? " · rerun" : ""}
          </span>
          <button onClick={onClose} style={{ ...btn, marginLeft: "auto", minHeight: 36 }}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 14, alignItems: "flex-start" }}>
          <div style={{ flex: "0 1 auto", width: "min(100%, calc(min(72svh, 680px) * 0.5625))", margin: "0 auto" }}>
            <div
              ref={stageRef}
              style={{ position: "relative", aspectRatio: "9 / 16", width: "100%", borderRadius: 10, overflow: "hidden", background: "#46993f", boxShadow: "0 0 0 4px #17361f, 0 14px 30px -12px rgba(0,0,0,.45)" }}
            >
              <canvas
                ref={pxRef}
                width={216}
                height={384}
                aria-label="Pixel rugby pitch with one runner per team running top to bottom"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", imageRendering: "pixelated" }}
              />
              <canvas ref={ovRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
              <div
                className={pixel.className}
                style={{ position: "absolute", left: 8, top: 8, background: view.phase === "race" ? ACCENT : "rgba(8,20,12,.85)", color: "#fff", fontSize: 9, lineHeight: 1, padding: "7px 9px", borderRadius: 6, whiteSpace: "nowrap" }}
              >
                {view.chip || "Loading"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, justifyContent: "center" }}>
              {revealed && view.phase === "done" ? (
                <button style={{ ...btn, background: ACCENT, borderColor: ACCENT }} onClick={() => setReplayFrom(performance.now())}>
                  Watch replay
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ ...card, flex: "1 1 300px", minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Draft order</div>
            {!revealed ? (
              <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                {`Runs ${new Date(run.scheduledAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Stay on this page to watch it live.`}
              </div>
            ) : null}
            <ol style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
              {(revealed ? order : lanes).map((teamId, p) => {
                const on = revealed && p < view.k;
                const lane = laneOf(teamId);
                const you = teamId === yourTeamId;
                return (
                  <li
                    key={revealed ? `${p}` : teamId}
                    style={{ display: "grid", gridTemplateColumns: "34px 14px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: p ? `1px solid ${line}` : "none", color: on ? ink : muted }}
                  >
                    <span className={pixel.className} style={{ fontSize: 11, textAlign: "right", color: on && p === 0 ? "#c99700" : undefined }}>
                      {p + 1}
                    </span>
                    <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${on ? colours[lane] : line}`, background: on ? colours[lane] : "transparent" }} />
                    <span style={{ fontSize: 14, fontWeight: on ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {on ? (nameOf.get(teamId) ?? "Team") : "Waiting"}
                      {on && you ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: teal }}>You</span> : null}
                    </span>
                    <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{on && lane >= 0 ? `${sim.rs[lane].fin.toFixed(2)}s` : ""}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
