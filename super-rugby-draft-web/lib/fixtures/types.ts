export type FixtureStatus = "scheduled" | "live" | "final";

export type Fixture = {
  id: string;
  week: number;
  kickoffAt: string; // ISO string
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
};
