// scripts/csvToPlayers.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// Update these if your paths differ
const INPUT_CSV = path.join(ROOT, "data", "players.csv");
const OUTPUT_JSON = path.join(ROOT, "data", "players.json");


// Position abbrev -> full name
const POS_NAME = {
  PR: "Prop",
  HO: "Hooker",
  LK: "Lock",
  LF: "Loose Forward",
  HB: "Halfback",
  FH: "Flyhalf",
  CE: "Centre",
  OB: "Outside Back",
};

// ---- CSV parsing (handles commas + quotes) ----
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // If we see "" inside a quoted string, that's an escaped quote
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      // handle CRLF
      if (ch === "\r" && text[i + 1] === "\n") i++;

      // push final cell
      row.push(cur);
      cur = "";

      // ignore blank lines
      if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);

      row = [];
      continue;
    }

    cur += ch;
  }

  // last cell / row
  row.push(cur);
  if (row.some((c) => String(c ?? "").trim() !== "")) rows.push(row);

  return rows;
}

function normalizeHeader(h) {
  return String(h ?? "").trim();
}

function makeIndex(headers) {
  const idx = new Map();
  headers.forEach((h, i) => idx.set(normalizeHeader(h), i));
  return idx;
}

function getCell(row, idx, key) {
  const i = idx.get(key);
  if (i == null) return "";
  return String(row[i] ?? "").trim();
}

function toNumberOrZero(v) {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  // remove commas like "1,234"
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function ensureFileExists(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`File not found: ${p}`);
  }
}

function main() {
  ensureFileExists(INPUT_CSV);

  const raw = fs.readFileSync(INPUT_CSV, "utf8");
  const table = parseCSV(raw);

  if (table.length < 2) {
    throw new Error("CSV has no data rows (needs header + at least 1 row).");
  }

  const headers = table[0].map(normalizeHeader);
  const idx = makeIndex(headers);

  // Required headers (based on what you said you have)
  const required = ["Player ID", "First Name", "Last Name", "Team", "Position", "Draft Rank"];
  const missing = required.filter((h) => !idx.has(h));
  if (missing.length) {
    throw new Error(
      `Missing required header(s): ${missing.join(", ")}\n` +
        `Found headers: ${headers.join(", ")}`
    );
  }

  // Columns we treat as "core fields"
  const coreKeys = new Set([
    "Player ID",
    "Name",
    "First Name",
    "Last Name",
    "Team",
    "Position",
    "Status",
    "Draft Rank",
  ]);

  const players = [];

  for (let r = 1; r < table.length; r++) {
    const row = table[r];

    const id = getCell(row, idx, "Player ID") || `p-${r}`;
    const firstName = getCell(row, idx, "First Name");
    const lastName = getCell(row, idx, "Last Name");
    const teamCode = getCell(row, idx, "Team");      // already abbreviated e.g. CHI
    const posAbbrev = getCell(row, idx, "Position"); // already abbreviated e.g. FH
    const status = getCell(row, idx, "Status");
    const draftRank = toNumberOrZero(getCell(row, idx, "Draft Rank"));

    // Skip totally empty lines
    if (!firstName && !lastName && !teamCode && !posAbbrev) continue;

    // Build stats object from any remaining columns
    const stats = {};
    for (const h of headers) {
      if (coreKeys.has(h)) continue;
      const val = getCell(row, idx, h);
      // Most of these are numeric stats; store as number
      stats[h] = toNumberOrZero(val);
    }

    players.push({
      id,
      firstName,
      lastName,
      teamCode,
      posAbbrev,
      posName: POS_NAME[posAbbrev] ?? posAbbrev,
      draftRank: draftRank || 9999,
      status: status || "",
      stats,
    });
  }

  // Sort by draft rank just to keep things consistent
  players.sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999));

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(players, null, 2), "utf8");

  console.log(`✅ Converted ${players.length} players`);
  console.log(`📄 Wrote: ${OUTPUT_JSON}`);
}

main();
