// Run: npx tsx scripts/tests/taunt-art.test.ts — try taunt pictures (lib/chat/tauntArt.ts):
// repainting the key colours, picking a picture, colours and wording.
import {
  cardLine, keyFor, pickArt, pointsText, repaintPixels, skinColour, teamColours, tryLine, wordColour, type TauntArt,
} from "../../lib/chat/tauntArt";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const paint = (rgba: number[], targets = { jersey: "#ffc600", trim: "#111111", skin: "#8e5b3a" }) => {
  const px = new Uint8ClampedArray(rgba);
  repaintPixels(px, targets);
  return Array.from(px);
};
const near = (a: number[], b: number[], tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// key colours
check("hues: green = jersey, blue = skin, magenta = trim, others none", keyFor(120) === "jersey" && keyFor(225) === "skin" && keyFor(300) === "trim" && keyFor(30) === null && keyFor(0) === null);
check("pure green becomes the jersey colour", near(paint([0, 255, 0, 255]), [255, 198, 0, 255]), JSON.stringify(paint([0, 255, 0, 255])));
check("pure blue becomes the skin tone", near(paint([0, 0, 255, 255]), [142, 91, 58, 255]), JSON.stringify(paint([0, 0, 255, 255])));
check("pure magenta becomes the second colour", near(paint([255, 0, 255, 255]), [17, 17, 17, 255]));
const shadow = paint([0, 128, 0, 255]);
check("a shadowed green keeps its shade (darker jersey)", shadow[0] < 255 && shadow[0] > 100 && shadow[1] < 198, JSON.stringify(shadow));
const light = paint([128, 255, 128, 255]);
check("a highlighted green goes lighter", light[2] > 0 && light[0] >= 255 - 3, JSON.stringify(light));
check("black outlines, white socks and a brown ball are left alone",
  near(paint([10, 10, 10, 255]), [10, 10, 10, 255], 0) && near(paint([250, 250, 250, 255]), [250, 250, 250, 255], 0) && near(paint([150, 90, 40, 255]), [150, 90, 40, 255], 0));
check("see-through pixels are left alone", near(paint([0, 255, 0, 0]), [0, 255, 0, 0], 0));
const dull = paint([110, 140, 110, 255]);
check("a greyish green is barely touched (edges blend)", near(dull, [110, 140, 110, 255], 25), JSON.stringify(dull));

// picking a picture
const arts: TauntArt[] = [
  { id: "1", player_id: null, url: "g1", active: true },
  { id: "2", player_id: null, url: "g2", active: true },
  { id: "3", player_id: null, url: "g3", active: false },
  { id: "4", player_id: "mckenda01", url: "dmac", active: true },
];
check("a player with his own picture gets it, shown as it is", JSON.stringify(pickArt(arts, "mckenda01")) === JSON.stringify({ url: "dmac", generic: false }));
check("everyone else gets a random generic one", pickArt(arts, "x", () => 0)?.url === "g1" && pickArt(arts, "x", () => 0.99)?.url === "g2" && pickArt(arts, "x")?.generic === true);
check("hidden pictures are never picked", ![0, 0.4, 0.7, 0.99].some((r) => pickArt(arts, "x", () => r)?.url === "g3"));
check("no pictures at all: none (the drawn jersey shows)", pickArt([], "x") === null);
check("his own picture hidden: back to generic", pickArt([{ ...arts[3], active: false }, arts[0]], "mckenda01")?.url === "g1");

// colours and wording
check("team colours: saved first, then defaults; Moana's old code", teamColours("HUR").jersey === "#ffc600" && teamColours("HUR", { HUR: { jersey: "#000000", trim: "#ffffff" } }).jersey === "#000000" && teamColours("MOP").jersey === teamColours("MOA").jersey);
check("skin tone not set = medium", skinColour(null) === skinColour(2) && skinColour(4) !== skinColour(1));
check("TRY! lettering is the darker team colour", wordColour({ jersey: "#ffc600", trim: "#111111" }) === "#111111" && wordColour({ jersey: "#c8102e", trim: "#f2c230" }) === "#c8102e");
check("points text", pointsText(15) === "+15 Points" && pointsText(-5) === "−5 Points" && pointsText(10.9) === "+10.9 Points");
check("lines", tryLine("Damian McKenzie", 1) === "Damian McKenzie try" && tryLine("Will Jordan", 2) === "Will Jordan, 2 tries" && cardLine("Codie Taylor", "yellow") === "Codie Taylor sin-binned" && cardLine("X", "red") === "X sent off");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
