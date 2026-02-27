export async function fetchRosters(leagueId: string) {
  const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, {
    cache: "no-store",
  });
  return res.json();
}

export async function saveRoster(leagueId: string, teamId: string, data: any) {
  const res = await fetch(`/api/rosters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leagueId, teamId, data }),
  });
  return res.json();
}