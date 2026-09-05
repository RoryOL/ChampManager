import type { Database, Match, StandingRow, Team } from "./types.js";

/**
 * Build a double round-robin fixture list (each team plays every other twice,
 * once home and once away) using the circle method.
 */
export function generateFixtures(teams: Team[]): Match[] {
  const ids = teams.map((t) => t.id);
  if (ids.length < 2) return [];

  const hasBye = ids.length % 2 !== 0;
  const wheel = hasBye ? [...ids, "__bye__"] : [...ids];
  const n = wheel.length;
  const rounds = n - 1;
  const half = n / 2;

  const firstLeg: Match[] = [];
  let order = [...wheel];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const home = order[i];
      const away = order[n - 1 - i];
      if (home !== "__bye__" && away !== "__bye__") {
        // Alternate home/away by round for fairness.
        const [h, a] = r % 2 === 0 ? [home, away] : [away, home];
        firstLeg.push(makeMatch(r + 1, h, a));
      }
    }
    // Rotate keeping the first element fixed.
    order = [order[0], ...order.slice(2), order[1]];
  }

  // Second leg: mirror fixtures with reversed venue, continuing round numbers.
  const secondLeg: Match[] = firstLeg.map((m, idx) =>
    makeMatch(m.round + rounds, m.awayId, m.homeId, idx + firstLeg.length),
  );

  return [...firstLeg, ...secondLeg].map((m, idx) => ({ ...m, id: `m${idx + 1}` }));
}

function makeMatch(round: number, homeId: string, awayId: string, seq = 0): Match {
  return {
    id: `tmp${round}-${seq}`,
    round,
    homeId,
    awayId,
    homeGoals: null,
    awayGoals: null,
    played: false,
  };
}

/** Sample a goal count from a Poisson distribution (Knuth's algorithm). */
function poisson(lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > l);
  return k - 1;
}

/**
 * Simulate a single match. Expected goals scale with the attacking side's
 * strength relative to the opponent's defense, plus a small home advantage.
 */
export function simulateMatch(home: Team, away: Team): { homeGoals: number; awayGoals: number } {
  const homeAdvantage = 0.35;
  const homeXg = Math.max(0.15, (home.attack / away.defense) * 1.3 + homeAdvantage);
  const awayXg = Math.max(0.15, (away.attack / home.defense) * 1.3);
  return { homeGoals: poisson(homeXg), awayGoals: poisson(awayXg) };
}

export function computeStandings(db: Database): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const team of db.teams) {
    rows.set(team.id, {
      teamId: team.id,
      name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  }

  for (const match of db.matches) {
    if (!match.played || match.homeGoals === null || match.awayGoals === null) continue;
    const home = rows.get(match.homeId);
    const away = rows.get(match.awayId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (match.homeGoals < match.awayGoals) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name),
  );
}
