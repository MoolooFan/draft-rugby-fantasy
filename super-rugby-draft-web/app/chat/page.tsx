"use client";
// app/chat/page.tsx
// League chat and direct messages (Ethan, 13 Nov 2026). The list of conversations (league chat +
// one with each other team), then a conversation: messages, pictures, trade offers (with a
// Review button) and the league's automated posts. New messages are checked every few
// seconds while a conversation is open. Rules: lib/chat/common.ts.
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { useRouter, useSearchParams } from "next/navigation";
import { AppMenu } from "@/components/AppMenu";
import { TeamAvatar } from "@/components/TeamAvatar";
import { TradeReviewModal } from "@/components/TradeReviewModal";
import { ChatIcon } from "@/components/ChatIcon";
import { useLeagueStore } from "@/lib/league/store";
import { usePlayersStore } from "@/lib/players/store";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useChatUnread } from "@/lib/chat/store";
import { dmTeams, LEAGUE_CHANNEL } from "@/lib/chat/common";
import { RoundRecapModal } from "@/components/RoundRecapModal";
import { roundLabel } from "@/lib/season";

type Team = { id: string; name: string; pictureUrl: string | null; initials: string | null; ownerName: string | null };
type Msg = {
  id: string;
  channel: string;
  sender_team_id: string | null;
  kind: "text" | "image" | "trade" | "system";
  body: string | null;
  image_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

const POLL_MS = 4000;

function timeText(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function ChatPageInner() {
  useRequireSession();
  const router = useRouter();
  const params = useSearchParams();
  const channel = params?.get("c") ?? null;

  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const setUnreadTotal = useChatUnread((s) => s.setUnread);
  const [menuOpen, setMenuOpen] = useState(false);

  // ---- conversations list
  const [overview, setOverview] = useState<{ forLeague: string; myTeamId: string; teams: Team[]; channels: string[]; latest: Record<string, Msg>; unread: Record<string, number> } | null>(null);
  const loadOverview = useCallback(() => {
    if (!activeLeagueId) return;
    fetch(`/api/chat?leagueId=${encodeURIComponent(activeLeagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          setOverview({ forLeague: activeLeagueId, myTeamId: j.myTeamId, teams: j.teams, channels: j.channels, latest: j.latest ?? {}, unread: j.unread ?? {} });
          setUnreadTotal(Object.values((j.unread ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0));
        }
      })
      .catch(() => {});
  }, [activeLeagueId, setUnreadTotal]);
  useEffect(() => {
    if (channel) return;
    loadOverview();
    const t = setInterval(loadOverview, 15_000);
    return () => clearInterval(t);
  }, [channel, loadOverview]);

  // ---- one conversation
  const [msgs, setMsgs] = useState<{ key: string; list: Msg[]; myTeamId: string } | null>(null);
  const convKey = activeLeagueId && channel ? `${activeLeagueId}|${channel}` : "";
  const lastAt = useRef<string>("");
  useEffect(() => {
    if (!convKey || !activeLeagueId || !channel) return;
    let cancelled = false;
    lastAt.current = "";
    const load = (first: boolean) => {
      if (document.hidden && !first) return;
      const after = first ? "" : lastAt.current;
      fetch(`/api/chat/messages?leagueId=${encodeURIComponent(activeLeagueId)}&channel=${encodeURIComponent(channel)}${after ? `&after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.ok) return;
          const incoming = (j.messages ?? []) as Msg[];
          if (incoming.length) lastAt.current = incoming[incoming.length - 1].created_at;
          setMsgs((prev) => {
            if (first || !prev || prev.key !== convKey) return { key: convKey, list: incoming, myTeamId: j.myTeamId };
            const seen = new Set(prev.list.map((m) => m.id));
            const add = incoming.filter((m) => !seen.has(m.id));
            return add.length ? { ...prev, list: [...prev.list, ...add] } : prev;
          });
        })
        .catch(() => {});
    };
    load(true);
    const t = setInterval(() => load(false), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [convKey, activeLeagueId, channel]);

  // team names for the open conversation (from the overview, loaded once if needed)
  useEffect(() => {
    if (channel && (!overview || overview.forLeague !== activeLeagueId)) loadOverview();
  }, [channel, overview, activeLeagueId, loadOverview]);
  const teams = overview && overview.forLeague === activeLeagueId ? overview.teams : [];
  const team = (id: string | null | undefined) => teams.find((t) => t.id === id) ?? null;
  const myTeamId = overview?.myTeamId ?? msgs?.myTeamId ?? "";

  // scroll to the newest message
  const endRef = useRef<HTMLDivElement | null>(null);
  const shown = msgs && msgs.key === convKey ? msgs.list : [];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length]);

  // ---- sending
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send(body: string, imageUrl?: string) {
    if (!activeLeagueId || !channel || (!body.trim() && !imageUrl)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leagueId: activeLeagueId, channel, body, imageUrl }),
      });
      const j = await r.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Couldn't send that");
      setText("");
      // pick it up straight away
      const g = await fetch(`/api/chat/messages?leagueId=${encodeURIComponent(activeLeagueId)}&channel=${encodeURIComponent(channel)}${lastAt.current ? `&after=${encodeURIComponent(lastAt.current)}` : ""}`, { cache: "no-store", credentials: "include" }).then((x) => x.json());
      if (g?.ok) {
        const incoming = (g.messages ?? []) as Msg[];
        if (incoming.length) lastAt.current = incoming[incoming.length - 1].created_at;
        setMsgs((prev) => {
          if (!prev || prev.key !== convKey) return { key: convKey, list: incoming, myTeamId: g.myTeamId };
          const seen = new Set(prev.list.map((m) => m.id));
          return { ...prev, list: [...prev.list, ...incoming.filter((m) => !seen.has(m.id))] };
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send that");
    } finally {
      setBusy(false);
    }
  }
  async function sendPicture(file: File) {
    if (!activeLeagueId) return;
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("leagueId", activeLeagueId);
      form.append("file", file);
      const r = await fetch("/api/chat/image", { method: "POST", body: form, credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Couldn't send the picture");
      setBusy(false);
      await send(text, j.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send the picture");
      setBusy(false);
    }
  }

  // ---- trade offers: their status, and reviewing one
  const players = usePlayersStore((s) => s.players);
  const roundRows = usePlayersStore((s) => s.roundRows);
  const playersLoaded = usePlayersStore((s) => s.loaded);
  const refreshPlayers = usePlayersStore((s) => s.refresh);
  const [tradeStatus, setTradeStatus] = useState<Record<string, string>>({});
  const hasTrades = shown.some((m) => m.kind === "trade");
  useEffect(() => {
    if (!hasTrades || !activeLeagueId) return;
    if (!playersLoaded) refreshPlayers();
    fetch(`/api/trades/list?leagueId=${encodeURIComponent(activeLeagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) return;
        const out: Record<string, string> = {};
        for (const t of (j.offers ?? []) as Array<{ id: string; status: string }>) out[t.id] = String(t.status).toLowerCase();
        setTradeStatus(out);
      })
      .catch(() => {});
  }, [hasTrades, activeLeagueId, playersLoaded, refreshPlayers, shown.length]);
  const [review, setReview] = useState<Msg | null>(null);
  // the round recap pop-up (from a "Round N recap" message)
  const [recapWeek, setRecapWeek] = useState<number | null>(null);
  const playerObj = (id: string, name: string) => (players ?? []).find((p) => p.id === id) ?? ({ id, firstName: "", lastName: name } as never);
  async function answerTrade(tradeId: string, accept: boolean) {
    setReview(null);
    const r = await fetch(accept ? "/api/trades/accept" : "/api/trades/decline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(accept ? { tradeOfferId: tradeId } : { leagueId: activeLeagueId, tradeId, reason: "Declined" }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) setErr(j?.error ?? "Couldn't answer the trade");
    setTradeStatus((s) => ({ ...s, [tradeId]: accept ? (j?.ok ? "accepted" : s[tradeId]) : "declined" }));
  }

  // ---- layout
  const title = !channel ? "Messages" : channel === LEAGUE_CHANNEL ? "League chat" : (() => {
    const t = dmTeams(channel);
    const other = t ? (t[0] === myTeamId ? t[1] : t[0]) : null;
    return team(other)?.name ?? "Messages";
  })();

  const card: React.CSSProperties = { ...themeCard };
  const listBox: React.CSSProperties = { marginTop: 12, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.92)", color: "#0f172a", boxShadow: "0 12px 30px rgba(0,0,0,0.18)" };

  function preview(m: Msg | undefined) {
    if (!m) return "No messages yet";
    const who = m.sender_team_id ? (m.sender_team_id === myTeamId ? "You: " : channel === null && m.channel === LEAGUE_CHANNEL ? `${team(m.sender_team_id)?.name ?? ""}: ` : "") : "";
    const what = m.kind === "trade" ? "Trade offer" : m.kind === "image" ? "Picture" : String(m.body ?? "").split("\n")[0];
    return `${who}${what}`;
  }

  // (a plain function, not a component, so bubbles aren't rebuilt on every refresh)
  function bubble(m: Msg) {
    const mine = m.sender_team_id === myTeamId;
    // the round recap: a card that opens the recap pop-up (results, the Shield, player of the
    // week, best and worst pickups: components/RoundRecapModal)
    const recapFor = m.kind === "system" ? Number((m.meta as { recapWeek?: unknown } | null)?.recapWeek) : NaN;
    if (Number.isInteger(recapFor) && recapFor > 0) {
      return (
        <button
          onClick={() => setRecapWeek(recapFor)}
          style={{ justifySelf: "center", width: "92%", maxWidth: 360, border: "1px solid #e5e9ef", borderRadius: 14, background: "#ffffff", color: "#0f172a", padding: "10px 12px", textAlign: "left", cursor: "pointer", boxShadow: "0 4px 12px rgba(15,23,42,0.08)", display: "grid", gap: 4 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{roundLabel(recapFor)} recap</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#0d9488", whiteSpace: "nowrap" }}>Open ›</span>
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.5 }}>{timeText(m.created_at)}</div>
        </button>
      );
    }
    if (m.kind === "system") {
      return (
        <div style={{ justifySelf: "center", maxWidth: "92%", borderRadius: 12, background: "rgba(15,23,42,0.06)", padding: "8px 10px", fontSize: 12, fontWeight: 500, whiteSpace: "pre-line", lineHeight: 1.4 }}>
          {m.body}
          <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.5, marginTop: 4 }}>{timeText(m.created_at)}</div>
        </div>
      );
    }
    const sender = team(m.sender_team_id);
    const base: React.CSSProperties = {
      justifySelf: mine ? "end" : "start",
      maxWidth: "80%",
      borderRadius: 14,
      padding: "8px 10px",
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.35,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      background: mine ? "rgb(13,148,136)" : "rgba(15,23,42,0.07)",
      color: mine ? "white" : "#0f172a",
    };
    return (
      <div style={{ display: "grid", justifyItems: mine ? "end" : "start", gap: 2 }}>
        {!mine && channel === LEAGUE_CHANNEL ? <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, paddingLeft: 4 }}>{sender?.name ?? "—"}</div> : null}
        {m.kind === "trade" ? (
          (() => {
            const meta = m.meta as { tradeId?: string; fromTeamId?: string; toTeamId?: string; offer?: Array<{ id: string; name: string }>; request?: Array<{ id: string; name: string }> };
            const status = meta.tradeId ? tradeStatus[meta.tradeId] ?? "pending" : "pending";
            const forMe = meta.toTeamId === myTeamId;
            return (
              <div style={{ ...base, background: "white", color: "#0f172a", border: "2px solid rgb(13,148,136)", display: "grid", gap: 6, minWidth: 220 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Trade offer from {team(meta.fromTeamId)?.name ?? "—"}</div>
                <div style={{ fontSize: 12 }}>
                  <b>{team(meta.fromTeamId)?.name ?? "They"} give:</b> {(meta.offer ?? []).map((p) => p.name).join(", ") || "nothing"}
                </div>
                <div style={{ fontSize: 12 }}>
                  <b>{team(meta.toTeamId)?.name ?? "They"} give:</b> {(meta.request ?? []).map((p) => p.name).join(", ") || "nothing"}
                </div>
                {m.body ? <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.8 }}>&ldquo;{m.body}&rdquo;</div> : null}
                {status === "pending" && forMe ? (
                  <button onClick={() => setReview(m)} style={{ height: 30, borderRadius: 999, border: "none", background: "#22C55E", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    Review
                  </button>
                ) : (
                  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>
                    {status === "pending" ? "Waiting for an answer" : status === "accepted" ? "Accepted" : status === "declined" ? "Declined" : "No longer open"}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div style={base}>
            {m.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.image_url} alt="" style={{ display: "block", maxWidth: 220, maxHeight: 260, borderRadius: 10, marginBottom: m.body ? 6 : 0 }} />
            ) : null}
            {m.body}
          </div>
        )}
        <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.45, padding: "0 4px" }}>{timeText(m.created_at)}</div>
      </div>
    );
  }

  const inLeague = useMemo(() => (leagues ?? []).length > 0, [leagues]);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }} />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px", paddingBottom: channel ? 96 : "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
        </div>

        <div style={{ ...card, marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          {channel ? (
            <button onClick={() => router.push("/chat")} aria-label="Back to messages" style={{ background: "transparent", border: "none", color: "inherit", fontSize: 26, fontWeight: 700, cursor: "pointer", padding: 0 }}>
              ‹
            </button>
          ) : (
            <span style={{ width: 30, height: 30, borderRadius: 999, background: "#0d9488", display: "grid", placeItems: "center" }}>
              <ChatIcon size={17} color="white" />
            </span>
          )}
          <div style={{ fontWeight: 700, fontSize: 20, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        </div>

        {!inLeague ? (
          <div style={{ ...listBox, padding: 14, fontSize: 13, fontWeight: 600 }}>Join a league to chat with the other teams.</div>
        ) : !channel ? (
          <div style={listBox}>
            {(overview?.channels ?? []).map((ch, i) => {
              const t = dmTeams(ch);
              const other = t ? team(t[0] === myTeamId ? t[1] : t[0]) : null;
              const n = overview?.unread?.[ch] ?? 0;
              const last = overview?.latest?.[ch];
              return (
                <button
                  key={ch}
                  onClick={() => router.push(`/chat?c=${encodeURIComponent(ch)}`)}
                  style={{ width: "100%", display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", border: "none", borderTop: i ? "1px solid rgba(0,0,0,0.08)" : "none", background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer" }}
                >
                  {other ? (
                    <TeamAvatar pictureUrl={other.pictureUrl} initials={other.initials ?? ""} size={34} />
                  ) : (
                    <span style={{ width: 34, height: 34, borderRadius: 999, background: "rgb(13,148,136)", display: "grid", placeItems: "center" }}>
                      <ChatIcon size={18} color="white" />
                    </span>
                  )}
                  <span style={{ minWidth: 0, display: "grid" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{other ? other.name : "League chat"}</span>
                    <span style={{ fontSize: 11, fontWeight: n ? 800 : 600, opacity: n ? 0.9 : 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview(last)}</span>
                  </span>
                  <span style={{ display: "grid", justifyItems: "end", gap: 3 }}>
                    {last ? <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.5 }}>{timeText(last.created_at)}</span> : null}
                    {n ? <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#EF4444", color: "white", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>{n}</span> : null}
                  </span>
                </button>
              );
            })}
            {!overview ? <div style={{ padding: 14, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Loading…</div> : null}
          </div>
        ) : (
          <div style={{ ...listBox, padding: 10, display: "grid", gap: 8, minHeight: 200 }}>
            {!msgs ? <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Loading…</div> : null}
            {msgs && !shown.length ? <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>No messages yet. Say hello!</div> : null}
            {shown.map((m) => (
              <React.Fragment key={m.id}>{bubble(m)}</React.Fragment>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Writing a message */}
      {channel && inLeague ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "8px max(12px, env(safe-area-inset-left, 0px)) calc(8px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(15,23,42,0.96)",
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: 420, margin: "0 auto", display: "grid", gap: 6 }}>
            {err ? <div style={{ fontSize: 11, fontWeight: 600, color: "#FCA5A5" }}>{err}</div> : null}
            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 8, alignItems: "end" }}>
              <label aria-label="Send a picture" style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,0.14)", display: "grid", placeItems: "center", cursor: busy ? "default" : "pointer", fontSize: 18 }}>
                📷
                <input
                  id="chat-picture"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={busy}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) sendPicture(f);
                  }}
                />
              </label>
              <textarea
                id="chat-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy) send(text);
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="Message"
                style={{ resize: "none", minHeight: 36, maxHeight: 110, borderRadius: 18, border: "none", padding: "9px 12px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "white" }}
              />
              <button
                onClick={() => send(text)}
                disabled={busy || !text.trim()}
                style={{ height: 36, padding: "0 14px", borderRadius: 999, border: "none", background: "#22C55E", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: busy || !text.trim() ? 0.5 : 1 }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {recapWeek != null && activeLeagueId ? <RoundRecapModal leagueId={activeLeagueId} week={recapWeek} onClose={() => setRecapWeek(null)} /> : null}
      {review
        ? (() => {
            const meta = review.meta as { tradeId: string; fromTeamId: string; offer?: Array<{ id: string; name: string }>; request?: Array<{ id: string; name: string }> };
            return (
              <TradeReviewModal
                fromTeamName={team(meta.fromTeamId)?.name ?? "another team"}
                getPlayers={(meta.offer ?? []).map((p) => playerObj(p.id, p.name))}
                givePlayers={(meta.request ?? []).map((p) => playerObj(p.id, p.name))}
                statRows={roundRows ?? []}
                canRespond
                onClose={() => setReview(null)}
                onAccept={() => answerTrade(meta.tradeId, true)}
                onDecline={() => answerTrade(meta.tradeId, false)}
              />
            );
          })()
        : null}

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues as never}
        activeLeagueId={activeLeagueId as never}
        setActiveLeague={setActiveLeague as never}
        activeItem={"Messages" as never}
      />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
