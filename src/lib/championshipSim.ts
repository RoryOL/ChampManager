/**
 * Simulate a full Clare SHC with computer managers on both sides.
 * Used to compare Standard vs Balanced panel modes.
 *
 *   npx vite-node scripts/championship-sim.ts
 */
import { seedChampionship } from "../data/championship";
import { compactName } from "./display";
import { decisiveResult, insertReplay, replayFixture, scoresAreLevel } from "./knockout";
import { applyKnockoutExtraTime, simulateMatch } from "./matchEngine";
import { clubTactics, clubXvOverall, defaultSheet, ratedSquad } from "./players";
import { resolveMatchSides } from "./resolve";
import { nextOpenBatch } from "./schedule";
import type { Championship, SquadBalance } from "../types";

export function simulateChampionship(options: {
  seed: number;
  balance?: SquadBalance;
}): { championId: string | null; championship: Championship } {
  const championship = structuredClone(seedChampionship);
  const balance = options.balance ?? "standard";
  const ratings = { seed: options.seed, balance };

  for (let guard = 0; guard < 80; guard += 1) {
    const batch = nextOpenBatch(championship);
    if (!batch) break;
    for (const match of batch.matches) {
      const { homeId, awayId } = resolveMatchSides(championship, match);
      if (!homeId || !awayId) continue;
      let sim = simulateMatch({
        matchId: match.id,
        homeId,
        awayId,
        homeSheet: defaultSheet(homeId, ratings),
        awaySheet: defaultSheet(awayId, ratings),
        homeTactics: clubTactics(homeId, balance),
        awayTactics: clubTactics(awayId, balance),
        homeSquad: ratedSquad(homeId, ratings),
        awaySquad: ratedSquad(awayId, ratings),
        seed: options.seed,
        gameSeed: options.seed,
        balance,
        period: "full",
        stage: match.stage,
      });
      sim = applyKnockoutExtraTime(sim, {
        seed: options.seed,
        gameSeed: options.seed,
        balance,
        homeSquad: ratedSquad(homeId, ratings),
        awaySquad: ratedSquad(awayId, ratings),
        homeName: compactName(championship.teams.find((team) => team.id === homeId)!),
        awayName: compactName(championship.teams.find((team) => team.id === awayId)!),
        stage: match.stage,
      });
      const row = championship.matches.find((item) => item.id === match.id);
      if (row) {
        row.homeScore = sim.homeScore;
        row.awayScore = sim.awayScore;
      }
      if (match.stage !== "group" && scoresAreLevel(sim.homeScore, sim.awayScore)) {
        const replay = replayFixture(match, homeId, awayId, championship.matches);
        championship.matches = insertReplay(championship.matches, replay);
      }
    }
  }

  const final = championship.matches.find((item) => item.id === "final");
  if (!final) return { championId: null, championship };
  const sides = resolveMatchSides(championship, final);
  const result = decisiveResult(championship, final);
  const championId = result === "home" ? sides.homeId : result === "away" ? sides.awayId : null;
  return { championId, championship };
}

export function tallyChampions(
  seeds: number[],
  balance: SquadBalance,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const team of seedChampionship.teams) counts[team.id] = 0;
  for (const seed of seeds) {
    const { championId } = simulateChampionship({ seed, balance });
    if (championId) counts[championId] = (counts[championId] ?? 0) + 1;
  }
  return counts;
}

export function printXvTable(seed: number, balance: SquadBalance): void {
  const ratings = { seed, balance };
  const rows = seedChampionship.teams
    .map((team) => ({
      name: compactName(team),
      xv: clubXvOverall(team.id, ratedSquad(team.id, ratings)),
      star: [...ratedSquad(team.id, ratings)].sort((a, b) => b.ratings.overall - a.ratings.overall)[0],
    }))
    .sort((a, b) => b.xv - a.xv);
  for (const row of rows) {
    const star = row.star ? `${row.star.name} ${row.star.ratings.overall}` : "";
    console.log(`${row.name.padEnd(22)} XV ${row.xv.toFixed(2)}  ${star}`);
  }
}
