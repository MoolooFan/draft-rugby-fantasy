// lib/notifications/types.ts
// The notification types each person can switch on or off (agreed with Ethan, plan item D1).
// Saved on the Account page. Chat uses them now for its in-app alerts (unread counts and the
// message banner); phone push notifications will use them too (D1).

export const NOTIFICATION_TYPES = [
  { key: "trade_offer", label: "Trade offers", hint: "Someone offers you a trade" },
  { key: "trade_result", label: "Your trades", hint: "A trade you offered is accepted or declined" },
  { key: "league_trade", label: "League trades", hint: "Any trade accepted in your league" },
  { key: "lineup_reminder", label: "Lineup reminder", hint: "2 hours before the team selection deadline" },
  { key: "waivers", label: "Waiver results", hint: "When waivers run and you had claims in" },
  { key: "draft_soon", label: "Draft starting", hint: "Your league's draft, or its draft order lottery, is about to start" },
  { key: "chat_dm", label: "Direct messages", hint: "Someone messages you (incl. trade offers in chat)" },
  { key: "chat_league", label: "League chat", hint: "Someone posts in your league chat" },
  { key: "chat_auto", label: "League updates in chat", hint: "Weekly recap, trades, waiver and free agent reports, the shield" },
] as const;

export type NotificationKey = (typeof NOTIFICATION_TYPES)[number]["key"];
export type NotificationSettings = Record<NotificationKey, boolean>;

/** Saved settings with every type filled in (a type never switched off is on). */
export function withDefaults(raw: unknown): NotificationSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as NotificationSettings;
  for (const t of NOTIFICATION_TYPES) out[t.key] = src[t.key] !== false;
  return out;
}
