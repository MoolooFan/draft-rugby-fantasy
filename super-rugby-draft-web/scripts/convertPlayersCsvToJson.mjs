// scripts/convertPlayersCsvToJson.mjs
import fs from "fs";
import path from "path";

function normalizeStatus(raw) {
  const v = String(raw ?? "").trim().toLowerCase();

  // empty = no status shown
  if (!v) return null;

  if (v === "starting") return "starting";
  if (v === "benched") return "benched";

  // anything else (e.g. "Birth of Child", "Injured") => out
  return "out";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  if (row.some((v) => String(v).trim() !== "")) rows.push(row);

  return rows;
}

function normalizeKey(k) {
  return String(k ?? "").trim().replace(/^\uFEFF/, "");
}

function toNum(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanStr(v) {
  const s = String(v ?? "").trim();
  return s;
}

function mapPosAbbrev(x) {
  const v = String(x ?? "").trim().toUpperCase();
  if (!v) return "";

  // ✅ normalize common variants -> roster slot codes
  const map = {
    PROP: "PR",
    PR: "PR",

    HOOKER: "HO",
    HO: "HO",

    LOCK: "LK",
    LK: "LK",

    LOOSE: "LF",
    LF: "LF",

    HALF: "HB",
    HALFBACK: "HB",
    HB: "HB",

    FLY: "FH",
    FLYHALF: "FH",
    FH: "FH",

    CENTRE: "CE",
    CENTER: "CE",
    CE: "CE",

    "OUTSIDE BACK": "OB",
    OUTSIDEBACK: "OB",
    OB: "OB",
  };

  return map[v] ?? v;
}


function posNameFromAbbrev(abbrev) {
  const v = String(abbrev ?? "").trim().toUpperCase();
  if (!v) return "";
  const map = {
  PR: "Prop",
  HO: "Hooker",
  LK: "Lock",
  LF: "Loose Forward",
  HB: "Halfback",
  FH: "Flyhalf",
  CE: "Centre",
  OB: "Outside Back",
};

  return map[v] ?? v;
}

const [, , inPath, outPath] = process.argv;

if (!inPath || !outPath) {
  console.error("Usage: node scripts/convertPlayersCsvToJson.mjs data/players.csv data/players.json");
  process.exit(1);
}

const inputAbs = path.resolve(inPath);
const outputAbs = path.resolve(outPath);

if (!fs.existsSync(inputAbs)) {
  console.error("Input CSV not found:", inputAbs);
  process.exit(1);
}

const csvText = fs.readFileSync(inputAbs, "utf8");
const rows = parseCsv(csvText);
if (rows.length < 2) {
  console.error("CSV appears empty or missing data rows.");
  process.exit(1);
}

const headers = rows[0].map(normalizeKey);

function get(rowObj, key) {
  return rowObj[key] ?? "";
}

const data = rows.slice(1).map((r) => {
  const raw = {};
  for (let c = 0; c < headers.length; c++) {
    raw[headers[c]] = r[c] ?? "";
  }

  const id = cleanStr(get(raw, "Player ID"));
  const firstName = cleanStr(get(raw, "First Name"));
  const lastName = cleanStr(get(raw, "Last Name"));
  const teamCode = cleanStr(get(raw, "Team"));

  const posAbbrev = mapPosAbbrev(get(raw, "Position"));
  const secondaryPosAbbrev = mapPosAbbrev(get(raw, "Secondary Position"));

  const draftRank = toNum(get(raw, "Draft Rank"));
  const status = normalizeStatus(get(raw, "Status"));


  // Stats (all numeric, default 0)
  const stats = {
    gamesPlayed: toNum(get(raw, "Games Played")),
    starts: toNum(get(raw, "Starts")),
    triesScored: toNum(get(raw, "Tries Scored")),
    tryAssists: toNum(get(raw, "Try Assists")),
    lineBreaks: toNum(get(raw, "Line Breaks")),
    lineBreakAssists: toNum(get(raw, "Line Break Assists")),
    defendersBeaten: toNum(get(raw, "Defenders Beaten")),
    metresGained: toNum(get(raw, "Metres Gained")),
    offloads: toNum(get(raw, "Offloads")),
    tacklesMade: toNum(get(raw, "Tackles Made")),
    tacklesMissed: toNum(get(raw, "Tackles Missed")),
    turnoversForced: toNum(get(raw, "Turnovers Forced")),
    interceptions: toNum(get(raw, "Interceptions")),
    fiftyTwentyTwos: toNum(get(raw, "50:22s")),
    penaltiesConceded: toNum(get(raw, "Penalties Conceded")),
    errors: toNum(get(raw, "Errors")),
    lineoutsWon: toNum(get(raw, "Lineouts Won")),
    lineoutSteals: toNum(get(raw, "Lineout Steals")),
    lineoutErrors: toNum(get(raw, "Lineout Errors")),
    scrumsWon: toNum(get(raw, "Scrums Won")),
    conversions: toNum(get(raw, "Conversions")),
    conversionsMissed: toNum(get(raw, "Conversions Missed")),
    penaltyGoals: toNum(get(raw, "Penalty Goals")),
    penaltyGoalsMissed: toNum(get(raw, "Penalty Goals Missed")),
    dropGoals: toNum(get(raw, "Drop Goals")),
    dropGoalsMissed: toNum(get(raw, "Drop Goals Missed")),
    yellowCards: toNum(get(raw, "Yellow Cards")),
    redCards: toNum(get(raw, "Red Cards")),
  };

  return {
    id,
    firstName,
    lastName,
    teamCode,

    posAbbrev,
    posName: posNameFromAbbrev(posAbbrev),

    secondaryPosAbbrev,
    secondaryPosName: secondaryPosAbbrev ? posNameFromAbbrev(secondaryPosAbbrev) : "",

    draftRank,
    status,

    stats,
  };
});

// Sort by draftRank (optional, but nice)
data.sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999));

fs.writeFileSync(outputAbs, JSON.stringify(data, null, 2), "utf8");
console.log(`✅ Wrote ${data.length} players to ${outPath}`);
