/**
 * Retirement and recruitment across the county, with winter development.
 *
 *   npm run sim:turnover
 *
 * Each club plays 3–6 games. The top of the panel plays them. The rest get
 * the odd game or none. Over 30, that record decides who calls it a day.
 */
import { seedChampionship } from "../src/data/championship";
import { newSave } from "../src/lib/gameStorage";
import { continueChampionship } from "../src/lib/development";
import { ratedSquad } from "../src/lib/players";
import { createRng, seedFrom } from "../src/lib/rng";
import { STAR_OVERALL, retirementChance } from "../src/lib/turnover";
import type { GameSave, RatedPlayer } from "../src/types";

const SEED = 7;
const YEARS = 8;

function stars(save: GameSave): RatedPlayer[] {
  const found: RatedPlayer[] = [];
  for (const team of seedChampionship.teams) {
    for (const player of ratedSquad(team.id, save)) {
      if (player.ratings.overall >= STAR_OVERALL) found.push(player);
    }
  }
  return found;
}

function sizes(save: GameSave): number[] {
  return seedChampionship.teams.map((team) => ratedSquad(team.id, save).length);
}

function reportsFor(save: GameSave): GameSave["reports"] {
  const reports: GameSave["reports"] = {};
  const year = save.year ?? 2026;
  for (const team of seedChampionship.teams) {
    const squad = [...ratedSquad(team.id, save)].sort(
      (a, b) => b.ratings.overall - a.ratings.overall || a.name.localeCompare(b.name),
    );
    const random = createRng(seedFrom(`${SEED}:${year}:${team.id}:fixtures`));
    const clubGames = 3 + Math.floor(random() * 4);
    for (let game = 0; game < clubGames; game += 1) {
      reports[`${team.id}-${year}-${game}`] = {
        players: squad.map((player, rank) => {
          let minutes = 0;
          if (rank < 12) minutes = 52;
          else if (rank < 15) minutes = random() < 0.65 ? 35 : 8;
          else if (rank < 20) minutes = random() < 0.35 ? 18 : 0;
          else minutes = random() < 0.12 ? 14 : 0;
          return { teamId: team.id, name: player.name, minutes, goals: 0, points: 0, rating: 6 };
        }),
      } as unknown as GameSave["reports"][string];
    }
  }
  return reports;
}

function main(): void {
  console.log("Retirement chance — age down, games across, two overalls. Club played 5.");
  console.log("age   0 games @10   0 games @18   2/5 @12   5/5 @12   5/5 @18");
  for (const age of [30, 31, 32, 34, 36, 38, 40]) {
    const cells = [
      retirementChance(age, 0, 5, 10),
      retirementChance(age, 0, 5, 18),
      retirementChance(age, 2, 5, 12),
      retirementChance(age, 5, 5, 12),
      retirementChance(age, 5, 5, 18),
    ].map((value) => value.toFixed(2).padStart(8));
    console.log(`${String(age).padStart(3)}   ${cells.join("   ")}`);
  }

  let save: GameSave = { ...newSave("ballyea"), seed: SEED };
  const openingStars = stars(save).length;
  const openingSizes = sizes(save);
  console.log(`\nOpening stars (overall ${STAR_OVERALL}+): ${openingStars}`);
  console.log(`Squad sizes ${Math.min(...openingSizes)}–${Math.max(...openingSizes)}  mean ${(openingSizes.reduce((a, b) => a + b, 0) / openingSizes.length).toFixed(1)}`);

  for (let winter = 1; winter <= YEARS; winter += 1) {
    const before = new Map(seedChampionship.teams.flatMap((team) => ratedSquad(team.id, save).map((player) => [`${team.id}:${player.name}`, player])));
    save = continueChampionship({ ...save, reports: reportsFor(save) });
    const news = save.inbox[0]?.body ?? "";
    const nowSizes = sizes(save);
    const nowStars = stars(save);
    let retired = 0;
    let retiredAge = 0;
    let retiredOverall = 0;
    let arrived = 0;
    const recruitAges: number[] = [];
    for (const team of seedChampionship.teams) {
      const squad = ratedSquad(team.id, save);
      const names = new Set(squad.map((player) => player.name));
      for (const [key, player] of before) {
        if (!key.startsWith(`${team.id}:`)) continue;
        if (!names.has(player.name)) {
          retired += 1;
          retiredAge += player.age;
          retiredOverall += player.ratings.overall;
        }
      }
      for (const player of squad) {
        if (!before.has(`${team.id}:${player.name}`)) {
          arrived += 1;
          recruitAges.push(player.age);
        }
      }
    }
    const ageNote = recruitAges.length > 0 ? ` ages ${recruitAges.sort((a, b) => a - b).join(",")}` : "";
    const delta = nowSizes.map((size, index) => size - (openingSizes[index] ?? size));
    const retiredNote =
      retired > 0 ? ` (mean age ${(retiredAge / retired).toFixed(0)}, mean OVR ${(retiredOverall / retired).toFixed(1)})` : "";
    console.log(
      `Winter ${winter}  retired ${retired}${retiredNote}  arrived ${arrived}${ageNote}  stars ${nowStars.length} (${nowStars.length - openingStars >= 0 ? "+" : ""}${nowStars.length - openingStars})  squad ${Math.min(...delta)} to ${Math.max(...delta)} off the opening size`,
    );
    if (winter === 1 || winter === YEARS) console.log(`  ${news}`);
  }

  const tony = ratedSquad("ballyea", save).find((player) => player.name === "Tony Kelly");
  const conlon = ratedSquad("clonlara", save).find((player) => player.name === "John Conlon");
  console.log(`\nAfter ${YEARS} played summers: Tony Kelly ${tony ? `still there, ${tony.age}, OVR ${tony.ratings.overall}` : "retired"}`);
  console.log(`John Conlon ${conlon ? `still there, ${conlon.age}, OVR ${conlon.ratings.overall}` : "retired"}`);
}

main();
