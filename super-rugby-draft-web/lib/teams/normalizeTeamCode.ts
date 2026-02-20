export function normalizeTeamCode(code: string | null | undefined) {
  const c = (code ?? "").trim().toUpperCase();

  // Moana Pasifika canonicalisation
  if (c === "MOP") return "MOA";

  return c;
}
