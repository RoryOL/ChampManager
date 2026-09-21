/**
 * County rating profile when winter development and a share of the year's
 * training are applied together.
 *
 *   npm run sim:retention
 *
 * Every club does a preseason of twelve position-mix sessions (light at one
 * club in four, balanced at the rest — the same split the CPU uses). Starters
 * play the group and a random knockout run. Only upward training is kept, and
 * only an age-and-luck share of it.
 */
import { seedChampionship } from "../src/data/championship";
import type { AttributeKey } from "../src/lib/attributes";
import { advancePlayer, trainingKeepBase, trainingKeepShare, type DevelopmentBank } from "../src/lib/development";
import { ratedSquad } from "../src/lib/players";
import { createRng, seedFrom } from "../src/lib/rng";
import { applyTraining, defaultCondition, ensureCondition } from "../src/lib/training";
import type { AttributeBoosts, RatedPlayer, TrainingIntensity } from "../src/types";

const SEED = 7;
const YEARS = 6;
const PRESEASON_SESSIONS = 12;
const WATCH = ["Thomas O'Connor", "Graham Ball", "Diarmuid Ryan", "Tony Kelly", "John Conlon"];

type SimPlayer = RatedPlayer & { bank: DevelopmentBank; clubId: string };

function clonePlayer(player: RatedPlayer, clubId: string): SimPlayer {
  return {
    ...player,
    clubId,
    bank: {},
    ratings: { ...player.ratings, familiarity: { ...player.ratings.familiarity } },
  };
}

function intensityFor(clubId: string): TrainingIntensity {
  return seedFrom(clubId) % 4 === 0 ? "light" : "balanced";
}

function trainPreseason(squad: SimPlayer[], clubId: string): Record<string, AttributeBoosts> {
  const names = squad.map((player) => player.name);
  let condition = ensureCondition(names, {}, defaultCondition());
  const intensity = intensityFor(clubId);
  for (let session = 0; session < PRESEASON_SESSIONS; session += 1) {
    condition = applyTraining(squad, condition, "mixed", {}, undefined, undefined, intensity).condition;
  }
  const boosts: Record<string, AttributeBoosts> = {};
  for (const player of squad) {
    const row = condition[player.name]?.boosts;
    if (row && Object.values(row).some((value) => (value ?? 0) > 0)) boosts[player.name] = row;
  }
  return boosts;
}

function histogram(players: SimPlayer[]): number[] {
  const counts = Array.from({ length: 21 }, () => 0);
  for (const player of players) counts[player.ratings.overall] += 1;
  return counts;
}

function mean(players: SimPlayer[]): number {
  const total = players.reduce((sum, player) => sum + player.ratings.overall, 0);
  return total / players.length;
}

function variation(before: number[], after: number[]): number {
  let moved = 0;
  for (let rating = 0; rating < before.length; rating += 1) moved += Math.abs((after[rating] ?? 0) - (before[rating] ?? 0));
  return moved / 2;
}

function printHistogram(label: string, counts: number[], baseline: number[]): void {
  const cells = [];
  for (let rating = 8; rating <= 19; rating += 1) {
    const now = counts[rating] ?? 0;
    const was = baseline[rating] ?? 0;
    const mark = now === was ? "" : now > was ? `+${now - was}` : `${now - was}`;
    cells.push(`${rating}:${String(now).padStart(3)}${mark ? `(${mark})` : "    "}`);
  }
  console.log(`${label}  ${cells.join("  ")}`);
}

function loadCounty(): SimPlayer[] {
  const players: SimPlayer[] = [];
  for (const team of seedChampionship.teams) {
    for (const player of ratedSquad(team.id, SEED)) players.push(clonePlayer(player, team.id));
  }
  return players;
}

function winter(
  players: SimPlayer[],
  year: number,
  keepTraining: boolean,
): { players: SimPlayer[]; kept: number; boost: number } {
  const next: SimPlayer[] = [];
  let kept = 0;
  let boost = 0;
  const byClub = new Map<string, SimPlayer[]>();
  for (const player of players) {
    const list = byClub.get(player.clubId) ?? [];
    list.push(player);
    byClub.set(player.clubId, list);
  }
  for (const [clubId, squad] of byClub) {
    const trained = keepTraining ? trainPreseason(squad, clubId) : {};
    const ordered = [...squad].sort((a, b) => b.ratings.overall - a.ratings.overall || a.name.localeCompare(b.name));
    const clubRng = createRng(seedFrom(`${SEED}:${year}:${clubId}:games`));
    const extra = Math.floor(clubRng() * 4);
    ordered.forEach((player, rank) => {
      const roll = createRng(seedFrom(`${SEED}:${year}:${player.name}:usage`));
      let games = 0;
      let form = 46;
      if (rank < 12) {
        games = Math.min(6, 3 + extra);
        form = 60 + Math.round(roll() * 18);
      } else if (rank < 15) {
        games = roll() < 0.7 ? Math.min(6, 3 + extra) : 2;
        form = 54 + Math.round(roll() * 16);
      } else if (rank < 20) {
        games = roll() < 0.45 ? 2 : 1;
        form = 48 + Math.round(roll() * 16);
      } else {
        games = roll() < 0.2 ? 1 : 0;
        form = 40 + Math.round(roll() * 14);
      }
      const row = trained[player.name];
      if (row) {
        for (const value of Object.values(row)) if ((value ?? 0) > 0) boost += value ?? 0;
      }
      const advanced = advancePlayer(player, { games, form }, player.bank, {
        boosts: row,
        seed: SEED + year,
      });
      kept += advanced.steps.reduce((sum, step) => sum + step.trainingKept, 0);
      next.push({
        ...player,
        age: advanced.age,
        bank: advanced.bank,
        ratings: advanced.ratings,
      });
    });
  }
  return { players: next, kept, boost };
}

function watchLine(players: SimPlayer[], name: string): string {
  const player = players.find((item) => item.name === name);
  if (!player) return name;
  const speed = player.ratings.speed;
  const shooting = player.ratings.shooting;
  const composure = player.ratings.composure;
  return `${name} (${player.age}) OVR ${player.ratings.overall}  spd ${speed} sht ${shooting} cmp ${composure}`;
}

function main(): void {
  console.log("Training kept onto the card — share of a positive lift");
  console.log("age   low roll   even   high roll   base");
  for (const age of [19, 21, 23, 25, 27, 29, 30, 32, 34, 37]) {
    const low = trainingKeepShare(age, 0).toFixed(2);
    const even = trainingKeepShare(age, 0.5).toFixed(2);
    const high = trainingKeepShare(age, 1).toFixed(2);
    console.log(`${String(age).padStart(3)}   ${low.padStart(8)}   ${even.padStart(4)}   ${high.padStart(9)}   ${trainingKeepBase(age).toFixed(2)}`);
  }

  const baselinePlayers = loadCounty();
  const baseline = histogram(baselinePlayers);
  console.log(`\nPlayers ${baselinePlayers.length}   mean overall ${mean(baselinePlayers).toFixed(2)}`);
  printHistogram("start ", baseline, baseline);

  let natural = loadCounty();
  let stacked = loadCounty();
  for (let year = 1; year <= YEARS; year += 1) {
    const aged = winter(natural, year, false);
    const both = winter(stacked, year, true);
    natural = aged.players;
    stacked = both.players;
    const naturalCounts = histogram(natural);
    const stackedCounts = histogram(stacked);
    console.log(
      `\nAfter ${year} winter${year === 1 ? "" : "s"}   natural mean ${mean(natural).toFixed(2)} (moved ${variation(baseline, naturalCounts)})   with training mean ${mean(stacked).toFixed(2)} (moved ${variation(baseline, stackedCounts)})   kept ${both.kept.toFixed(1)} of ${both.boost.toFixed(1)} training points`,
    );
    printHistogram("age  ", naturalCounts, baseline);
    printHistogram("both ", stackedCounts, baseline);
    if (year === 1 || year === 3 || year === 6) {
      console.log("  natural  " + WATCH.map((name) => watchLine(natural, name)).join("\n           "));
      console.log("  trained  " + WATCH.map((name) => watchLine(stacked, name)).join("\n           "));
    }
  }

  const thomas = baselinePlayers.find((player) => player.name === "Thomas O'Connor");
  const tony = baselinePlayers.find((player) => player.name === "Tony Kelly");
  if (thomas && tony) {
    const boost: Partial<Record<AttributeKey, number>> = { speed: 1.2, shooting: 0.8, passing: 0.5 };
    const young = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts: boost, seed: 7 });
    const old = advancePlayer(tony, { games: 5, form: 70 }, {}, { boosts: boost, seed: 7 });
    const speed = (steps: { key: string; natural: number; trainingKept: number; delta: number }[]) =>
      steps.find((step) => step.key === "speed");
  console.log("\nSame +1.2 speed / +0.8 shooting / +0.5 passing, five games, seed 7");
  console.log(`Thomas ${thomas.age} speed natural ${speed(young.steps)?.natural} kept ${speed(young.steps)?.trainingKept} total ${speed(young.steps)?.delta} → ${young.ratings.speed} (was ${thomas.ratings.speed}), OVR ${thomas.ratings.overall} → ${young.ratings.overall}`);
  console.log(`Tony   ${tony.age} speed natural ${speed(old.steps)?.natural} kept ${speed(old.steps)?.trainingKept} total ${speed(old.steps)?.delta} → ${old.ratings.speed} (was ${tony.ratings.speed}), OVR ${tony.ratings.overall} → ${old.ratings.overall}`);

  const keptSpeeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
    const stepped = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts: boost, seed });
    return stepped.steps.find((step) => step.key === "speed")?.trainingKept ?? 0;
  });
  console.log(
    `Thomas speed kept from +1.2 across 8 winters: ${keptSpeeds.map((value) => value.toFixed(2)).join(", ")}`,
  );

  const plans = {
    [thomas.name]: {
      mix: { defensive: 0, attacking: 70, tactics: 10, physical: 15, setpieces: 5 },
      recovery: false as const,
      intensity: "balanced" as const,
    },
  };
  let condition = ensureCondition([thomas.name], {}, defaultCondition());
  for (let session = 0; session < PRESEASON_SESSIONS; session += 1) {
    condition = applyTraining([thomas], condition, "mixed", plans, undefined, undefined, "balanced").condition;
  }
  const focused = condition[thomas.name]?.boosts ?? {};
  const bare = advancePlayer(thomas, { games: 5, form: 74 });
  const coached = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts: focused, seed: 7 });
  const shot = (steps: { key: string; natural: number; trainingKept: number; after: number }[]) =>
    steps.find((step) => step.key === "shooting");
  console.log(
    `Thomas shooting-heavy preseason: boost ${focused.shooting?.toFixed(2) ?? "0"} kept ${shot(coached.steps)?.trainingKept} on top of natural ${shot(bare.steps)?.natural} → shooting ${shot(coached.steps)?.after} (natural only ${shot(bare.steps)?.after}), OVR ${coached.ratings.overall} (natural only ${bare.ratings.overall})`,
  );
}
}

main();
