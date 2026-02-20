// lib/draft/constants.ts
import type { Player } from "./types";

// You already have TEAM_OPTIONS / POSITION_OPTIONS in lib/constants
export { TEAM_OPTIONS, POSITION_OPTIONS } from "../constants";

// Roster template
export const rosterSlots = [
  { slotId: "PR", label: "Props", count: 2, posAbbrev: "PR" },
  { slotId: "HO", label: "Hookers", count: 1, posAbbrev: "HO" },
  { slotId: "LK", label: "Locks", count: 2, posAbbrev: "LK" },
  { slotId: "LF", label: "Loose Forwards", count: 3, posAbbrev: "LF" },
  { slotId: "HB", label: "Halfbacks", count: 1, posAbbrev: "HB" },
  { slotId: "FH", label: "Flyhalfs", count: 1, posAbbrev: "FH" },
  { slotId: "CE", label: "Centres", count: 2, posAbbrev: "CE" },
  { slotId: "OB", label: "Outside Backs", count: 3, posAbbrev: "OB" },
  { slotId: "WC", label: "Wildcards", count: 5, posAbbrev: "WC" },
] as const;

export const POS_NAME: Record<string, string> = {
  PR: "Prop",
  HO: "Hooker",
  LK: "Lock",
  LF: "Loose Forward",
  HB: "Halfback",
  FH: "Flyhalf",
  CE: "Centre",
  OB: "Outside Back",
};

export function getWcCap() {
  return rosterSlots.find((s) => s.posAbbrev === "WC")?.count ?? 0;
}

export function getSlotCaps() {
  const caps: Record<string, number> = {};
  for (const s of rosterSlots) {
    if (s.posAbbrev !== "WC") caps[s.posAbbrev] = s.count;
  }
  return caps;
}

export function derivePosName(posAbbrev: string) {
  return POS_NAME[posAbbrev] ?? posAbbrev;
}
