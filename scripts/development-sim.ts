/**
 * Project how sample players age across seasons.
 *
 *   npm run sim:development
 *
 * Ratings are the real rolled cards (seed 7). Each row is the age they start
 * the next season at, after the winter change.
 */
import { ratedSquad } from "../src/lib/players";
import {
  advancePlayer,
  attributeSeasonDelta,
  projectPlayer,
  type SeasonUsage,
} from "../src/lib/development";
import type { AttributeKey } from "../src/lib/attributes";
import type { RatedPlayer } from "../src/types";

const SEED = 7;
const YEARS = 8;

const WATCH: AttributeKey[] = [
  "speed",
  "acceleration",
  "stamina",
  "strength",
  "firstTouch",
  "shooting",
  "vision",
  "composure",
  "underPressure",
  "shotStopping",
];

type Sample = { clubId: string; name: string; note: string };

const SAMPLES: Sample[] = [
  { clubId: "st-josephs", name: "Thomas O'Connor", note: "19, full-forward, underage" },
  { clubId: "st-josephs", name: "Graham Ball", note: "19, half-forward, underage" },
  { clubId: "clonlara", name: "Michael Collins", note: "20, full-forward, underage" },
  { clubId: "ballyea", name: "Daniel Costelloe", note: "21, midfield, U20" },
  { clubId: "clonlara", name: "Diarmuid Stritch", note: "21, half-forward, already a senior" },
  { clubId: "sixmilebridge", name: "Mark Sheedy", note: "20, goalkeeper, Clare senior" },
  { clubId: "inagh-kilnamona", name: "Sean Rynne", note: "22, midfield, Clare senior" },
  { clubId: "cratloe", name: "Diarmuid Ryan", note: "27, half-back, peak years" },
  { clubId: "inagh-kilnamona", name: "David Fitzgerald", note: "30, midfield, just past 29" },
  { clubId: "ballyea", name: "Tony Kelly", note: "32, midfield, star" },
  { clubId: "ballyea", name: "Paul Flanagan", note: "33, full-back" },
  { clubId: "cratloe", name: "Podge Collins", note: "34, full-forward" },
  { clubId: "clonlara", name: "John Conlon", note: "37, half-forward" },
  { clubId: "crusheen", name: "Donal Tuohy", note: "38, goalkeeper" },
];

const PATHS: { id: string; label: string; usage: SeasonUsage }[] = [
  { id: "run", label: "Run of the summer — 5 games, form 74", usage: { games: 5, form: 74 } },
  { id: "group", label: "Group regular — 3 games, form 64", usage: { games: 3, form: 64 } },
  { id: "cameo", label: "One cameo — 1 game, form 70", usage: { games: 1, form: 70 } },
  { id: "cold", label: "Played, out of sorts — 4 games, form 40", usage: { games: 4, form: 40 } },
  { id: "bench", label: "Bench — 0 games, form 46", usage: { games: 0, form: 46 } },
];

function findPlayer(sample: Sample): RatedPlayer {
  const player = ratedSquad(sample.clubId, SEED).find((item) => item.name === sample.name);
  if (!player) throw new Error(`Missing ${sample.name} (${sample.clubId})`);
  return player;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function line(age: number, overall: number, ratings: Record<AttributeKey, number>, overall0: number): string {
  const cells = WATCH.map((key) => pad(ratings[key], 3)).join(" ");
  const delta = overall - overall0;
  const mark = delta === 0 ? "  " : delta > 0 ? `+${delta}` : `${delta}`;
  return `${pad(age, 3)}  ${pad(overall, 3)} ${mark.padStart(3)}   ${cells}`;
}

function header(): string {
  const labels = ["Spd", "Acc", "Sta", "Str", "1st", "Sht", "Vis", "Cmp", "Prs", "Sav"];
  return `Age  OVR        ${labels.map((label) => pad(label, 3)).join(" ")}`;
}

function printCareer(sample: Sample, player: RatedPlayer, usage: SeasonUsage): void {
  const trace = projectPlayer(
    player,
    Array.from({ length: YEARS }, () => usage),
  );
  const start = trace[0]!;
  console.log(`\n${sample.name} (${sample.note})  start OVR ${start.overall}`);
  console.log(header());
  for (const row of trace) {
    console.log(line(row.age, row.overall, row.ratings, start.overall));
  }
}

function printOneSeasonGrid(player: RatedPlayer): void {
  console.log(`\n${player.name}, age ${player.age}, OVR ${player.ratings.overall} — fractional change in one winter`);
  console.log("games\\form   40     55     64     74     86");
  const forms = [40, 55, 64, 74, 86];
  for (const games of [0, 1, 2, 3, 5, 6]) {
    const cells = forms.map((form) => {
      const step = advancePlayer(player, { games, form });
      const ovr = step.ratings.overall - player.ratings.overall;
      const speed = step.steps.find((item) => item.key === "speed")!;
      const composure = step.steps.find((item) => item.key === "composure")!;
      const sign = ovr > 0 ? `+${ovr}` : `${ovr}`;
      return `${sign}/${speed.delta.toFixed(2)}/${composure.delta.toFixed(2)}`;
    });
    console.log(`${String(games).padStart(5)}    ${cells.map((cell) => cell.padStart(12)).join(" ")}`);
  }
  console.log("cell = overall integer / speed fraction / composure fraction");
}

function printAgeCurve(): void {
  console.log("\nAge curve for a half-forward role stat (shooting 13, weight ~0.9, overall 14)");
  console.log("age  youthFactor  goodSeasonΔ  coldΔ  benchDeclineΔ  composureΔ(good)");
  for (const age of [19, 20, 21, 22, 23, 24, 25, 27, 29, 30, 32, 34, 36, 38]) {
    const shooting = attributeSeasonDelta({
      age,
      games: 5,
      form: 74,
      key: "shooting",
      value: 13,
      position: "HF",
      overall: 14,
    });
    const cold = attributeSeasonDelta({
      age,
      games: 4,
      form: 40,
      key: "shooting",
      value: 13,
      position: "HF",
      overall: 14,
    });
    const bench = attributeSeasonDelta({
      age,
      games: 0,
      form: 46,
      key: "speed",
      value: 14,
      position: "HF",
      overall: 14,
    });
    const composure = attributeSeasonDelta({
      age,
      games: 5,
      form: 74,
      key: "composure",
      value: 12,
      position: "HF",
      overall: 14,
    });
    const youth = age >= 25 ? 0 : age <= 19 ? 1 : ((25 - age) / 6) ** 1.35;
    console.log(
      `${String(age).padStart(3)}  ${youth.toFixed(2).padStart(11)}  ${shooting.toFixed(2).padStart(11)}  ${cold.toFixed(2).padStart(6)}  ${bench.toFixed(2).padStart(13)}  ${composure.toFixed(2).padStart(16)}`,
    );
  }
}

console.log("Sample player projections — seed 7");
console.log("A gain needs age under 25, at least two games, and form above 54.");
console.log("Decline starts at 30. More games that summer means a smaller drop.");
console.log("Composure (and vision, pressure, teamwork) can still rise with age if they played.");

printAgeCurve();

const thomas = findPlayer(SAMPLES[0]!);
printOneSeasonGrid(thomas);
const tony = findPlayer(SAMPLES.find((sample) => sample.name === "Tony Kelly")!);
printOneSeasonGrid(tony);
const conlon = findPlayer(SAMPLES.find((sample) => sample.name === "John Conlon")!);
printOneSeasonGrid(conlon);

for (const path of PATHS) {
  console.log(`\n======== ${path.label} ========`);
  for (const sample of SAMPLES) {
    printCareer(sample, findPlayer(sample), path.usage);
  }
}
