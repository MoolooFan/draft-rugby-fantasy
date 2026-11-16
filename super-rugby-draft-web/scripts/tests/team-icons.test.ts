// Run: npx tsx scripts/tests/team-icons.test.ts — default team pictures (lib/teams/icons.ts).
import { detailColour, isTeamIcon, parseTeamIcon, teamIconSvg, teamIconValue, TEAM_ICON_KINDS } from "../../lib/teams/icons";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

check("saved value: jersey with its number", teamIconValue({ kind: "jersey", colour: "#FFC600", number: 10 }) === "icon:jersey:ffc600:10");
check("saved value: other icons have no number", teamIconValue({ kind: "ball", colour: "#ef4444", number: 9 }) === "icon:ball:ef4444");
check("rejected: unknown icon, bad colour, jersey number outside 1-23",
  teamIconValue({ kind: "scrum", colour: "#ffffff" }) === null
  && teamIconValue({ kind: "boot", colour: "red" }) === null
  && teamIconValue({ kind: "jersey", colour: "#ffffff", number: 24 }) === null
  && teamIconValue({ kind: "jersey", colour: "#ffffff", number: 0 }) === null);
check("read back", JSON.stringify(parseTeamIcon("icon:jersey:ffc600:23")) === JSON.stringify({ kind: "jersey", colour: "#ffc600", number: 23 })
  && JSON.stringify(parseTeamIcon("icon:posts:111827")) === JSON.stringify({ kind: "posts", colour: "#111827" }));
check("a photo address is not an icon", !isTeamIcon("https://x.supabase.co/storage/v1/object/public/team-pictures/a.jpg") && !isTeamIcon(null) && !isTeamIcon("icon:boot:zzzzzz"));
check("details: white, or dark on very light colours", detailColour("#ef4444") === "#ffffff" && detailColour("#111827") === "#ffffff" && detailColour("#ffffff") === "#0f172a" && detailColour("#facc15") === "#0f172a");
for (const { kind } of TEAM_ICON_KINDS) {
  const svg = teamIconSvg({ kind, colour: "#22c55e", ...(kind === "jersey" ? { number: 7 } : {}) });
  check(`${kind}: draws in the chosen colour`, svg.startsWith("<svg") && svg.includes("#22c55e") && !svg.includes("undefined") && !svg.includes("NaN"));
}
check("jersey shows its number", teamIconSvg({ kind: "jersey", colour: "#22c55e", number: 15 }).includes(">15</text>"));

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
