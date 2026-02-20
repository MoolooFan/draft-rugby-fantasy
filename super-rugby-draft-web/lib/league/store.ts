// lib/league/store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { League, LeagueTeam, PlayoffFormat } from "./types";
import { getActiveUserProfile, getUserInitialsFromProfile } from "@/lib/session";

function normalizeUserId(u: string) {
  return u.trim().toLowerCase();
}

function getActiveUserId(): string | null {
  const u = getActiveUserProfile()?.username ?? null;
  return u ? normalizeUserId(u) : null;
}

type LeagueState = {
  leagues: League[];
  activeLeagueId: string | null;
  maybeAutoStartDraft: (leagueId: string) => void;

  // helpers
  activeLeague: () => League | null;
  isActiveLeagueCreator: () => boolean;

  // actions
  setActiveLeague: (leagueId: string) => void;

  completeDraft: (leagueId: string) => void;

createLeague: (params: {
  name: string;
  teamName: string;
  playoffFormat: PlayoffFormat;
  draftDateTimeText: string;
  draftAt?: number | null;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

joinLeagueByCode: (params: {
  code: string;
  teamName: string;
}) => Promise<{ ok: true } | { ok: false; error: string }>;

  setCurrentWeek: (leagueId: string, week: number) => void;
  advanceWeek: (leagueId: string) => void;


  updateLeagueSettings: (
    leagueId: string,
    patch: Partial<
      Pick<
        League,
        | "name"
        | "playoffFormat"
        | "draftDateTimeText"
        | "draftAt"
        | "currentWeek"
        | "draftStatus"
        | "startRound"
        | "totalWeeks"
      >
    >
  ) => void;

  setDraftOrder: (leagueId: string, orderedTeamIds: string[]) => void;
};

function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function parseDraftAt(input: string): number | null {
  // Accept:
  // - datetime-local format: "YYYY-MM-DDTHH:mm"
  // - fallback: Date-parsable strings (best effort)
  const s = (input ?? "").trim();
  if (!s) return null;

  // datetime-local has no timezone — JS treats it as local time.
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return t;
}

export const useLeagueStore = create<LeagueState>()(
  persist(
    (set, get) => ({
      leagues: [
        {
          id: "l-1",
          name: "The Diddy Dunk League",
          code: "4HX62",

          // ✅ IMPORTANT: createdByUserId must match your real session userId (normalized username)
          createdByUserId: "dev",

          teams: [
            { id: "t-1", name: "Stouty’s Studs", initials: "ES", userId: "dev", userInitials: "ES" },
            { id: "t-2", name: "Hughie’s Hornets", initials: "JH", userId: "hugh", userInitials: "JH" },
            { id: "t-3", name: "Diddy Dunkers", initials: "JB", userId: "diddy", userInitials: "JB" },
            { id: "t-4", name: "Team 4", initials: "ZO", userId: "user4", userInitials: "ZO" },
            { id: "t-5", name: "Team 5", initials: "SS", userId: "user5", userInitials: "SS" },
            { id: "t-6", name: "Team 6", initials: "CL", userId: "user6", userInitials: "CL" },
          ],

          draftDateTimeText: "2026-02-09T18:30",
          draftAt: parseDraftAt("2026-02-09T18:30"),
          draftStatus: "scheduled",

          playoffFormat: "final4",

          realRegularSeasonRounds: 15,
          startRound: 1,

          totalWeeks: 15,
          currentWeek: 1,
        },
      ],
      activeLeagueId: "l-1",

      activeLeague: () => {
        const s = get();
        return s.leagues.find((l) => l.id === s.activeLeagueId) ?? null;
      },

      isActiveLeagueCreator: () => {
        const userId = getActiveUserId();
        const l = get().activeLeague();
        if (!userId || !l) return false;
        return userId === l.createdByUserId;
      },

      setActiveLeague: (leagueId) => set({ activeLeagueId: leagueId }),

      maybeAutoStartDraft: (leagueId) => {
        set((s) => ({
          leagues: s.leagues.map((l) => {
            if (l.id !== leagueId) return l;
            if (l.draftStatus !== "scheduled") return l;
            if (!l.draftAt) return l;

            const now = Date.now();
            if (now < l.draftAt) return l;

            return { ...l, draftStatus: "live" };
          }),
        }));
      },

      completeDraft: (leagueId) => {
        set((s) => ({
          leagues: s.leagues.map((l) => {
            if (l.id !== leagueId) return l;
            if (l.draftStatus === "complete") return l;
            return { ...l, draftStatus: "complete" };
          }),
        }));
      },

      createLeague: async ({ name, teamName, playoffFormat, draftDateTimeText, draftAt }) => {
  const userId = getActiveUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  try {
    const res = await fetch("/api/leagues/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teamName, playoffFormat, draftDateTimeText, draftAt }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? "Failed to create league." };
    }

    // ✅ Expect API to return a full league object
    const league: League = json.league;

    set((s) => ({
      leagues: [league, ...s.leagues.filter((l) => l.id !== league.id)],
      activeLeagueId: league.id,
    }));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Failed to create league." };
  }
},

      joinLeagueByCode: async ({ code, teamName }) => {
  const userId = getActiveUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return { ok: false, error: "Enter a league code." };

  try {
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cleanCode, teamName }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error ?? "Failed to join league." };
    }

    // ✅ Expect API returns a full league object (recommended)
    const league: League = json.league;

    set((s) => ({
      leagues: [league, ...s.leagues.filter((l) => l.id !== league.id)],
      activeLeagueId: league.id,
    }));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Failed to join league." };
  }
},

      updateLeagueSettings: (leagueId, patch) => {
        set((s) => ({
          leagues: s.leagues.map((l) => {
            if (l.id !== leagueId) return l;

            const draftLocked = l.draftStatus === "live" || l.draftStatus === "complete";
            if (draftLocked) {
              // ignore draft time edits after draft begins/finishes
              const { draftAt, draftDateTimeText, ...rest } = patch;
              return { ...l, ...rest };
            }

            const next = { ...l, ...patch };

            if (typeof patch.startRound === "number") {
              const rr = next.realRegularSeasonRounds ?? 16;
              const sr = Math.max(1, Math.min(rr, patch.startRound));
              const newTotalWeeks = Math.max(1, rr - sr + 1);

              next.startRound = sr;
              next.totalWeeks = newTotalWeeks;

              // keep currentWeek valid
              next.currentWeek = Math.max(1, Math.min(newTotalWeeks, next.currentWeek ?? 1));
            }

            return next;
          }),
        }));
      },

      setCurrentWeek: (leagueId, week) =>
        set((state) => ({
          leagues: state.leagues.map((l) => {
            if (l.id !== leagueId) return l;
            const clamped = Math.max(1, Math.min(l.totalWeeks ?? 16, week));
            return { ...l, currentWeek: clamped };
          }),
        })),

      advanceWeek: (leagueId) =>
        set((state) => ({
          leagues: state.leagues.map((l) => {
            if (l.id !== leagueId) return l;
            const total = l.totalWeeks ?? 16;
            const next = Math.min(total, (l.currentWeek ?? 1) + 1);
            return { ...l, currentWeek: next };
          }),
        })),

      setDraftOrder: (leagueId, orderedTeamIds) => {
        set((s) => ({
          leagues: s.leagues.map((l) => {
            if (l.id !== leagueId) return l;

            // lock draft order once draft is live/complete
            if (l.draftStatus === "live" || l.draftStatus === "complete") return l;

            const byId = new Map(l.teams.map((t) => [t.id, t]));
            const reordered = orderedTeamIds
              .map((id) => byId.get(id))
              .filter(Boolean) as LeagueTeam[];

            const leftovers = l.teams.filter((t) => !orderedTeamIds.includes(t.id));
            return { ...l, teams: [...reordered, ...leftovers] };
          }),
        }));
      },
    }),
    {
      name: "sr-leagues-v2",
      partialize: (s) => ({
        leagues: s.leagues,
        activeLeagueId: s.activeLeagueId,
      }),
      migrate: (persisted: any) => {
        // ensure newly-added fields exist on old saved leagues
        const leagues = (persisted?.leagues ?? []).map((l: any) => {
          const realRegularSeasonRounds = Number.isFinite(l.realRegularSeasonRounds)
            ? l.realRegularSeasonRounds
            : 16;
          const startRound = Number.isFinite(l.startRound) ? l.startRound : 1;

          const computedTotalWeeks = Math.max(1, realRegularSeasonRounds - startRound + 1);
          const totalWeeks = Number.isFinite(l.totalWeeks) ? l.totalWeeks : computedTotalWeeks;

          return {
            ...l,
            draftStatus: l.draftStatus ?? "scheduled",
            draftAt: typeof l.draftAt === "number" || l.draftAt === null ? l.draftAt : null,

            realRegularSeasonRounds,
            startRound,

            // if old league had totalWeeks missing, fill it; otherwise keep it
            totalWeeks,
            currentWeek: Number.isFinite(l.currentWeek)
              ? Math.max(1, Math.min(totalWeeks, l.currentWeek))
              : 1,
          };
        });

        return {
          ...persisted,
          leagues,
        };
      },
    }
  )
);