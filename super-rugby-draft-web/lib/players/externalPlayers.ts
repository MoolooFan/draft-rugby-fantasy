export type ExternalPlayerRow = {
  id?: number;
  feedId?: number;
  firstName?: string;
  lastName?: string;
  imageProfile?: string | null;
  imagePitch?: string | null;
};

const EXTERNAL_PLAYERS_URL = "https://playfantasyrugby.com/json/players/players.json";

export async function fetchExternalPlayers(): Promise<ExternalPlayerRow[]> {
  const res = await fetch(EXTERNAL_PLAYERS_URL, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch external players: ${res.status}`);
  }

  const json = await res.json().catch(() => null);

  if (!Array.isArray(json)) {
    throw new Error("External players response was not an array");
  }

  return json as ExternalPlayerRow[];
}