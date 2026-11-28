"use client";
// components/draftRoom/LotteryCard.tsx
// The draft lottery's card in the Draft Room, before the draft (Ethan, 28 Nov 2026): when it
// runs, every run so far (reruns are shown as such), and whether the order has been changed by
// hand since. The commissioner sets, moves or cancels the time here, and can set a rerun.
import { useState } from "react";
import type { LotteryData, LotteryRun } from "@/lib/draft/lottery/useLottery";
import { card, cardTitle, ink, innerBox, line, muted, teal } from "@/lib/ui/theme";

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const until = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    x = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}:${String(x).padStart(2, "0")}`;
};
/** A time as the date-and-time box wants it (this phone's time zone). */
const boxValue = (ms: number) => {
  const d = new Date(ms),
    p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** What to say about the order compared with the last lottery (null: it's the lottery's order). */
export function lotteryOrderNote(data: LotteryData | null): string | null {
  const last = lastRun(data);
  if (!data || !last?.resultTeamIds) return null;
  if (data.order.join("|") === last.resultTeamIds.join("|")) return null;
  return data.orderSource === "commissioner" ? "The commissioner changed the order by hand after the lottery." : "The order has changed since the lottery (a team joined or left).";
}

/** The latest run that has run. */
export function lastRun(data: LotteryData | null): LotteryRun | null {
  const ran = (data?.runs ?? []).filter((r) => r.ranAt);
  return ran.length ? ran[ran.length - 1] : null;
}

export function LotteryCard({
  data,
  nowMs,
  draftAt,
  onWatch,
  act,
}: {
  data: LotteryData;
  /** the server's time now */
  nowMs: number;
  draftAt: number | null;
  onWatch: (run: LotteryRun, replay: boolean) => void;
  act: (action: "schedule" | "cancel", at?: number) => Promise<string | null>;
}) {
  const waiting = data.runs.find((r) => !r.ranAt) ?? null;
  const ran = data.runs.filter((r) => r.ranAt);
  const last = ran[ran.length - 1] ?? null;
  const note = lotteryOrderNote(data);
  const nameOf = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "A team that left";

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!data.isCommissioner && !data.runs.length) return null;

  const save = async () => {
    const at = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(at)) return setError("Pick a date and time first");
    setBusy(true);
    setError(await act("schedule", at));
    setBusy(false);
    setValue("");
  };
  const cancel = async () => {
    setBusy(true);
    setError(await act("cancel"));
    setBusy(false);
    setConfirmCancel(false);
  };

  const button = (primary: boolean): React.CSSProperties => ({
    height: 36,
    padding: "0 14px",
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${line}`,
    background: primary ? teal : "#ffffff",
    color: primary ? "#ffffff" : ink,
    fontSize: 13,
    fontWeight: 700,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  });
  const runLabel = (r: LotteryRun) => `Run ${r.runNumber}${r.runNumber > 1 ? " (rerun)" : ""}`;
  const latestBox = boxValue(draftAt ? draftAt - 5 * 60_000 : nowMs + 365 * 86400_000);

  return (
    <div style={{ ...card, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ ...cardTitle, fontSize: 15, fontWeight: 700 }}>Draft Lottery</div>
        {waiting ? (
          <button style={{ ...button(true), marginLeft: "auto" }} onClick={() => onWatch(waiting, false)}>
            Watch
          </button>
        ) : last ? (
          <button style={{ ...button(true), marginLeft: "auto" }} onClick={() => onWatch(last, true)}>
            Watch replay
          </button>
        ) : null}
      </div>

      {waiting ? (
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
          <b>{runLabel(waiting)}</b> runs {when(waiting.scheduledAt)}
          {waiting.scheduledAt > nowMs ? <span style={{ color: muted }}> · in {until(waiting.scheduledAt - nowMs)}</span> : <span style={{ color: muted }}> · starting now</span>}
          <div style={{ fontSize: 12, color: muted }}>Every team gets a runner; the first to score picks first. Watch it live here.</div>
        </div>
      ) : last ? (
        <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.45 }}>
          <b>{runLabel(last)}</b> ran {when(last.ranAt as number)}: <b>{nameOf(last.resultTeamIds?.[0] ?? "")}</b> picks first.
        </div>
      ) : (
        <div style={{ fontSize: 13, marginTop: 6, color: muted, lineHeight: 1.45 }}>
          Set a time and the whole league can watch the draft order being decided: every team gets a runner, and the first to score picks first.
        </div>
      )}

      {ran.length > 1 || (waiting && ran.length) ? (
        <div style={{ ...innerBox, marginTop: 8, padding: "4px 10px" }}>
          {ran.map((r, i) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i ? `1px solid ${line}` : "none", fontSize: 12 }}>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{runLabel(r)}</span>
              <span style={{ color: muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {when(r.ranAt as number)} · 1st {nameOf(r.resultTeamIds?.[0] ?? "")}
              </span>
              <button onClick={() => onWatch(r, true)} style={{ marginLeft: "auto", border: "none", background: "transparent", padding: 0, color: teal, fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                Watch
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {note ? <div style={{ fontSize: 12, fontWeight: 600, color: "#b45309", marginTop: 8 }}>{note}</div> : null}

      {data.isCommissioner ? (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${line}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {waiting ? "Move the lottery" : last ? "Rerun the lottery" : "Set a lottery time"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <input
              type="datetime-local"
              aria-label="Lottery date and time"
              value={value}
              min={boxValue(nowMs + 60_000)}
              max={latestBox}
              onChange={(e) => setValue(e.target.value)}
              style={{ flex: "1 1 180px", minWidth: 0, height: 36, borderRadius: 10, border: `1px solid ${line}`, padding: "0 8px", fontSize: 16, color: ink, background: "#ffffff" }}
            />
            <button style={button(true)} disabled={busy} onClick={save}>
              {waiting ? "Move" : last ? "Set rerun" : "Set"}
            </button>
            {waiting ? (
              confirmCancel ? (
                <>
                  <button style={{ ...button(false), color: "#b91c1c" }} disabled={busy} onClick={cancel}>
                    Yes, cancel it
                  </button>
                  <button style={button(false)} disabled={busy} onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button style={button(false)} disabled={busy} onClick={() => setConfirmCancel(true)}>
                  Cancel lottery
                </button>
              )
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 6, lineHeight: 1.45 }}>
            {draftAt ? "At least 5 minutes before the draft. " : ""}
            {last
              ? "A rerun runs at its time like the first, and the league sees every run. You can still change the order by hand in League Settings (the league sees a note)."
              : "The result isn't decided until that time, so nobody (you included) can see it early. You can still set the order by hand in League Settings."}
          </div>
          {error ? <div style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c", marginTop: 6 }}>{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
