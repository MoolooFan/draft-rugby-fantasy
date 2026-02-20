// lib/constants.ts

export const TEAM_OPTIONS: { value: string; label: string }[] = [
  { value: "CHI", label: "Chiefs" },
  { value: "CRU", label: "Crusaders" },
  { value: "HUR", label: "Hurricanes" },
  { value: "BLU", label: "Blues" },
  { value: "BRU", label: "Brumbies" },
  { value: "DRU", label: "Drua" },
  { value: "FOR", label: "Force" },
  { value: "HIG", label: "Highlanders" },
  { value: "MOP", label: "Moana" },
  { value: "RED", label: "Reds" },
  { value: "WAR", label: "Waratahs" },
  
];

export const POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: "PR", label: "Prop" },
  { value: "HO", label: "Hooker" },
  { value: "LK", label: "Lock" },
  { value: "LF", label: "Loose Forward" },
  { value: "HB", label: "Halfback" },
  { value: "FH", label: "Flyhalf" },
  { value: "CE", label: "Centre" },
  { value: "OB", label: "Outside Back" },
  { value: "WC", label: "Wildcard" },
];

// Optional helper (nice to have)
export function teamLabel(teamCode: string) {
  return TEAM_OPTIONS.find((t) => t.value === teamCode)?.label ?? teamCode;
}

export function positionLabel(posAbbrev: string) {
  return POSITION_OPTIONS.find((p) => p.value === posAbbrev)?.label ?? posAbbrev;
}
