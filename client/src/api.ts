export interface Team {
  id: string;
  name: string;
  attack: number;
  defense: number;
}

export interface Match {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
}

export interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  getTeams: () => request<Team[]>("/teams"),
  addTeam: (team: { name: string; attack: number; defense: number }) =>
    request<Team>("/teams", { method: "POST", body: JSON.stringify(team) }),
  deleteTeam: (id: string) => request<void>(`/teams/${id}`, { method: "DELETE" }),
  getMatches: () => request<Match[]>("/matches"),
  getStandings: () => request<StandingRow[]>("/standings"),
  generateSeason: () => request<Match[]>("/season/generate", { method: "POST" }),
  simulateSeason: () =>
    request<{ simulated: number; standings: StandingRow[] }>("/season/simulate", {
      method: "POST",
    }),
  resetSeason: () => request<void>("/season/reset", { method: "POST" }),
};
