// lib/league/teamProfileStore.ts
// Opens a team's profile pop-up (components/TeamProfileModal.tsx) from any page: tap a team on
// the standings, power rankings, dashboard or matchup (Ethan, 20 Nov 2026).
import { create } from "zustand";

type TeamProfileState = {
  teamId: string | null;
  openTeam: (teamId: string | null | undefined) => void;
  close: () => void;
};

export const useTeamProfileStore = create<TeamProfileState>((set) => ({
  teamId: null,
  openTeam: (teamId) => set({ teamId: teamId ? String(teamId) : null }),
  close: () => set({ teamId: null }),
}));
