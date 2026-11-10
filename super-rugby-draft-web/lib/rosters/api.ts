export async function fetchRosters(leagueId: string) {
  const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, {
    cache: "no-store",
  });
  return res.json();
}