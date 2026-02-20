// lib/teamSelection/types.ts

export type SlotId =
  | "prop1"
  | "hooker1"
  | "prop2"
  | "lock1"
  | "lock2"
  | "looseforward1"
  | "looseforward2"
  | "looseforward3"
  | "halfback1"
  | "flyhalf1"
  | "centre1"
  | "centre2"
  | "outsideback1"
  | "outsideback2"
  | "outsideback3"
  | "bench1"
  | "bench2"
  | "bench3"
  | "bench4"
  | "bench5";

export type PosGroup =
  | "PROP"
  | "HOOKER"
  | "LOCK"
  | "LOOSE"
  | "HB"
  | "FH"
  | "CENTRE"
  | "OB"
  | "WC";

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string | null;
  posName: string;
  secondaryPosName?: string | null;
  draftRank?: number;
};

export type SlotDef = {
  id: SlotId;
  label: string;
  group: PosGroup;
  starter: boolean;
};

export type Lineup = Record<SlotId, Player | null>;

export const BENCH_IDS: SlotId[] = ["bench1", "bench2", "bench3", "bench4", "bench5"];
