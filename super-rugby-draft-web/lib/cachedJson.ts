// lib/cachedJson.ts
// Fetches JSON once and shares it: everything asking for the same address within `maxAgeMs`
// gets the same answer instead of downloading it again (e.g. the season's stats, which every
// player card used to re-download).
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function cachedJson<T = unknown>(url: string, maxAgeMs = 2 * 60_000): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise as Promise<T>;
  const promise = fetch(url, { cache: "no-store" }).then(async (res) => {
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new Error(`Failed to load ${url.split("?")[0]}`);
    return json;
  });
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url)); // don't keep failures
  return promise as Promise<T>;
}
