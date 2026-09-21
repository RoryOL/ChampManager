import { seedChampionship } from "../data/championship";
import type {
  CareerBook,
  CareerRatings,
  ClubRuntime,
  GameSave,
  NewsItem,
  PlayerCareer,
  PlayerRatings,
  PositionLine,
  RatedPlayer,
} from "../types";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, positionWeight, type AttributeKey } from "./attributes";
import { formValue, withStartingForm } from "./form";
import { championshipFromSave } from "./gameStorage";
import { newsItem } from "./news";
import { ratedSquad, computeOverall, expandSheetToPanel } from "./players";
import { calendarDate } from "./scoring";
import { championshipWinnerId } from "./season";
import { createRng, seedFrom } from "./rng";
import { defaultCondition, ensureCondition, squadNames } from "./training";
import { activeNames, carryPanel, scrubTactics, settlePanels, STAR_OVERALL, type PanelMove } from "./turnover";
import { compactName } from "./display";

/**
 * Winter development between championships.
 *
 * Young players (through 24) gain if they got a run of games and finished in
 * positive form. The gain is quickest at 19 and flattens to nothing at 25.
 * From 30, attributes slip. A full summer slows that drop; a season on the
 * bench steepens it. Pace goes first. Composure, vision and hurling under
 * pressure can still rise into the early thirties.
 *
 * Training lifts from the year stack on top of that. Only the upward work
 * is kept, and only a share of it: more at 19, little past 35, with a
 * winter-to-winter swing so the same player does not bank the same fraction
 * every time. Neglected stats that drifted down in training clear.
 */

export const YOUTH_FULL_AGE = 19;
export const YOUTH_FLAT_AGE = 25;
/** Decline applies when the age during the season just finished is 30 or more. */
export const DECLINE_FROM_AGE = 30;
/** Form at or below this is not a positive season. */
export const POSITIVE_FORM = 54;
const GAIN_CAP = 1.45;
const LOSS_CAP = 1.15;
const STAT_MIN = 5;

export type AgingCurve = "pace" | "power" | "skill" | "craft" | "temperament";

export const ATTRIBUTE_CURVE: Record<AttributeKey, AgingCurve> = {
  speed: "pace",
  acceleration: "pace",
  stamina: "power",
  aerialReach: "power",
  strength: "power",
  firstTouch: "skill",
  highFielding: "skill",
  strikingDistance: "skill",
  shooting: "skill",
  hooking: "skill",
  offTheBall: "skill",
  passing: "craft",
  vision: "craft",
  manMarking: "craft",
  frees: "craft",
  sidelines: "craft",
  puckoutReach: "craft",
  shotStopping: "craft",
  workrate: "temperament",
  underPressure: "temperament",
  composure: "temperament",
  teamwork: "temperament",
};

/** Points a relevant attribute can move in one perfect youth season before the other factors. */
const YOUTH_BASE: Record<AgingCurve, number> = {
  pace: 3.15,
  power: 2.95,
  skill: 3.05,
  craft: 2.05,
  temperament: 0.95,
};

/** Points lost at the reference decline (age factor 1, a three-game summer). */
const DECLINE_BASE: Record<AgingCurve, number> = {
  pace: 1.85,
  power: 1.25,
  skill: 0.5,
  craft: 0.22,
  temperament: 0.12,
};

/**
 * Attributes that keep rising with age and games, separate from the youth burst.
 * Composure is the clearest of these.
 */
const MATURITY_BASE: Partial<Record<AttributeKey, number>> = {
  composure: 1.15,
  underPressure: 0.85,
  teamwork: 0.55,
  vision: 0.48,
  passing: 0.36,
  manMarking: 0.42,
  frees: 0.28,
  sidelines: 0.22,
  workrate: 0.32,
};

/** Index is games played, capped at 6. Under two games is not a development season. */
const GAMES_GROWTH = [0, 0, 0.55, 0.8, 0.92, 1, 1];

/** Fewer games, steeper decline. Six or more keeps the drop as small as age allows. */
const GAMES_DECLINE = [1.7, 1.42, 1.18, 1, 0.82, 0.6, 0.5];

export type SeasonUsage = {
  games: number;
  /** End-of-season form, 8–92. */
  form: number;
};

export type DevelopmentBank = Partial<Record<AttributeKey, number>>;

export type AttributeStep = {
  key: AttributeKey;
  before: number;
  after: number;
  /** Fractional change applied this winter, before the bank crossed an integer. */
  delta: number;
  /** Natural winter change, before any training is banked. */
  natural: number;
  /** Share of this year's positive training lift that stuck. */
  trainingKept: number;
};

/** Positive training lifts from the season just finished. */
export type SeasonTraining = {
  boosts?: Partial<Record<AttributeKey, number>>;
  /** Stable seed so the same winter keeps the same fraction. */
  seed: number;
};

export type PlayerAdvance = {
  age: number;
  ratings: PlayerRatings;
  bank: DevelopmentBank;
  steps: AttributeStep[];
};

export function youthAgeFactor(age: number): number {
  if (age >= YOUTH_FLAT_AGE) return 0;
  if (age <= YOUTH_FULL_AGE) return 1;
  const span = YOUTH_FLAT_AGE - age;
  const full = YOUTH_FLAT_AGE - YOUTH_FULL_AGE;
  return (span / full) ** 1.35;
}

export function gamesGrowthFactor(games: number): number {
  if (games < 2) return 0;
  return GAMES_GROWTH[Math.min(6, Math.round(games))] ?? 1;
}

export function formGrowthFactor(form: number): number {
  if (form <= POSITIVE_FORM) return 0;
  const t = Math.min(1, (form - POSITIVE_FORM) / 28);
  return t ** 0.62;
}

export function declineAgeFactor(age: number): number {
  if (age < DECLINE_FROM_AGE) return 0;
  return ((age - 29) / 8) ** 1.2;
}

export function gamesDeclineFactor(games: number): number {
  const index = Math.max(0, Math.min(6, Math.round(games)));
  return GAMES_DECLINE[index] ?? 1;
}

export function maturityAgeFactor(age: number): number {
  if (age >= 36) return 0;
  if (age <= 21) return 0.55;
  if (age <= 31) return 0.55 + (age - 21) * 0.045;
  return Math.max(0, 1 - (age - 31) * 0.22);
}

function headroom(value: number): number {
  const room = Math.max(0, 19.4 - value);
  return (room / 10) ** 0.75;
}

function relevance(weight: number): number {
  return 0.22 + 0.78 * Math.min(1, Math.max(0, weight));
}

function declineScale(value: number): number {
  return Math.min(1.25, 0.55 + value / 28);
}

function ceilingDamp(overall: number): number {
  if (overall <= 16) return 1;
  if (overall >= 19) return 0.35;
  return 1 - (overall - 16) * 0.22;
}

function maturityGamesFactor(games: number): number {
  if (games <= 0) return 0;
  if (games === 1) return 0.4;
  return Math.min(1, 0.5 + (games - 2) * 0.14);
}

function maturityFormFactor(form: number): number {
  const factor = Math.max(-1, Math.min(1, (form - 50) / 42));
  return Math.max(0.2, 0.62 + factor * 0.38);
}

/**
 * Mean share of a positive training lift that becomes part of the card.
 * Quick at 19, still useful through the mid-twenties, thin from 30.
 */
export function trainingKeepBase(age: number): number {
  if (age <= 19) return 0.34;
  if (age >= 38) return 0.05;
  if (age <= 25) return 0.34 - ((age - 19) / 6) * 0.12;
  if (age <= 30) return 0.22 - ((age - 25) / 5) * 0.07;
  return 0.15 - Math.min(1, (age - 30) / 8) * 0.1;
}

/** Age sets the share. `roll` in 0–1 swings it by about ±0.11. */
export function trainingKeepShare(age: number, roll: number): number {
  const swing = (Math.max(0, Math.min(1, roll)) - 0.5) * 0.22;
  return Math.max(0, Math.min(0.55, trainingKeepBase(age) + swing));
}

export function retainedTrainingDelta(age: number, boost: number, roll: number): number {
  if (!(boost > 0)) return 0;
  return Math.round(boost * trainingKeepShare(age, roll) * 1000) / 1000;
}

function trainingRoll(seed: number, name: string): number {
  return createRng(seedFrom(`${seed}:${name}:training-keep`))();
}

function emptyRatings(ratings: PlayerRatings): Record<AttributeKey, number> {
  const next = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) next[key] = ratings[key];
  return next;
}

export function attributeSeasonDelta(input: {
  age: number;
  games: number;
  form: number;
  key: AttributeKey;
  value: number;
  position: PositionLine;
  overall: number;
}): number {
  const weight = positionWeight(input.position, input.key);
  const fit = relevance(weight);
  const room = headroom(input.value);
  const curve = ATTRIBUTE_CURVE[input.key];

  const youth =
    YOUTH_BASE[curve] *
    youthAgeFactor(input.age) *
    gamesGrowthFactor(input.games) *
    formGrowthFactor(input.form) *
    room *
    fit *
    ceilingDamp(input.overall);

  let maturity = 0;
  const maturityBase = MATURITY_BASE[input.key] ?? 0;
  if (maturityBase > 0 && input.games > 0) {
    let ageFactor = maturityAgeFactor(input.age);
    if (input.key === "workrate" && input.age >= 28) ageFactor *= 0.35;
    maturity =
      maturityBase *
      ageFactor *
      maturityGamesFactor(input.games) *
      maturityFormFactor(input.form) *
      room *
      fit;
  }

  const decline =
    DECLINE_BASE[curve] *
    declineAgeFactor(input.age) *
    gamesDeclineFactor(input.games) *
    declineScale(input.value) *
    fit;

  const net = youth + maturity - decline;
  if (net >= 0) return Math.min(GAIN_CAP, net);
  return Math.max(-LOSS_CAP, net);
}

function applyBank(value: number, bank: number, delta: number): { value: number; bank: number } {
  let next = value;
  let carried = bank + delta;
  while (carried >= 1 && next < 20) {
    next += 1;
    carried -= 1;
  }
  while (carried <= -1 && next > STAT_MIN) {
    next -= 1;
    carried += 1;
  }
  if (next >= 20 && carried > 0) carried = 0;
  if (next <= STAT_MIN && carried < 0) carried = 0;
  carried = Math.max(-0.99, Math.min(0.99, carried));
  return { value: next, bank: Math.round(carried * 1000) / 1000 };
}

export function advancePlayer(
  player: RatedPlayer,
  usage: SeasonUsage,
  bank: DevelopmentBank = {},
  training?: SeasonTraining,
): PlayerAdvance {
  const current = emptyRatings(player.ratings);
  const next = { ...current };
  const nextBank: DevelopmentBank = {};
  const steps: AttributeStep[] = [];
  const roll = training ? trainingRoll(training.seed, player.name) : 0.5;

  for (const key of ATTRIBUTE_KEYS) {
    const natural = attributeSeasonDelta({
      age: player.age,
      games: usage.games,
      form: usage.form,
      key,
      value: current[key],
      position: player.position,
      overall: player.ratings.overall,
    });
    const trainingKept = training ? retainedTrainingDelta(player.age, training.boosts?.[key] ?? 0, roll) : 0;
    const delta = natural + trainingKept;
    const applied = applyBank(current[key], bank[key] ?? 0, delta);
    next[key] = applied.value;
    if (applied.bank !== 0) nextBank[key] = applied.bank;
    steps.push({
      key,
      before: current[key],
      after: applied.value,
      delta: Math.round(delta * 1000) / 1000,
      natural: Math.round(natural * 1000) / 1000,
      trainingKept,
    });
  }

  const ratings: PlayerRatings = {
    ...next,
    familiarity: player.ratings.familiarity,
    overall: computeOverall(next, player.ratings.familiarity, player.position),
  };

  return {
    age: player.age + 1,
    ratings,
    bank: nextBank,
    steps,
  };
}

export function projectPlayer(
  player: RatedPlayer,
  seasons: SeasonUsage[],
): { age: number; overall: number; ratings: Record<AttributeKey, number> }[] {
  const trace: { age: number; overall: number; ratings: Record<AttributeKey, number> }[] = [
    { age: player.age, overall: player.ratings.overall, ratings: emptyRatings(player.ratings) },
  ];
  let current = player;
  let bank: DevelopmentBank = {};
  for (const usage of seasons) {
    const advanced = advancePlayer(current, usage, bank);
    bank = advanced.bank;
    current = { ...current, age: advanced.age, ratings: advanced.ratings };
    trace.push({ age: advanced.age, overall: advanced.ratings.overall, ratings: emptyRatings(advanced.ratings) });
  }
  return trace;
}

const PLAYED_MINUTES = 12;

export function gamesInReports(
  reports: Record<string, { players?: { teamId?: string; name?: string; minutes?: number }[] } | undefined>,
  teamId: string,
  name: string,
): number {
  let games = 0;
  for (const report of Object.values(reports)) {
    const row = report?.players?.find((player) => player.teamId === teamId && player.name === name);
    if (row && (row.minutes ?? 0) >= PLAYED_MINUTES) games += 1;
  }
  return games;
}

function careerRatingsOf(ratings: PlayerRatings): CareerRatings {
  const next = {} as CareerRatings;
  for (const key of ATTRIBUTE_KEYS) next[key] = ratings[key];
  return next;
}

type WinterChange = {
  name: string;
  age: number;
  overallDelta: number;
  up: AttributeKey[];
  down: AttributeKey[];
  /** Positive training lifts from the year that were written onto the card. */
  trainingKept: number;
};

function advanceClub(save: GameSave, teamId: string): { book: Record<string, PlayerCareer>; changes: WinterChange[] } {
  const squad = ratedSquad(teamId, save);
  const condition = teamId === save.clubId ? save.condition : (save.rivals[teamId]?.condition ?? {});
  const existing = save.careers?.[teamId] ?? {};
  const book: Record<string, PlayerCareer> = {};
  const changes: WinterChange[] = [];
  for (const player of squad) {
    const usage = {
      games: gamesInReports(save.reports, teamId, player.name),
      form: formValue(condition[player.name]),
    };
    const advanced = advancePlayer(player, usage, existing[player.name]?.bank ?? {}, {
      boosts: condition[player.name]?.boosts,
      seed: save.seed + (save.year ?? 0),
    });
    const up = advanced.steps.filter((step) => step.after > step.before).map((step) => step.key);
    const down = advanced.steps.filter((step) => step.after < step.before).map((step) => step.key);
    const trainingKept = advanced.steps.reduce((sum, step) => sum + step.trainingKept, 0);
    book[player.name] = {
      age: advanced.age,
      ratings: careerRatingsOf(advanced.ratings),
      bank: Object.keys(advanced.bank).length > 0 ? advanced.bank : undefined,
      joined: existing[player.name]?.joined,
    };
    if (up.length > 0 || down.length > 0 || advanced.ratings.overall !== player.ratings.overall || trainingKept > 0) {
      changes.push({
        name: player.name,
        age: advanced.age,
        overallDelta: advanced.ratings.overall - player.ratings.overall,
        up,
        down,
        trainingKept,
      });
    }
  }
  carryPanel(existing, book);
  return { book, changes };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function attrPhrase(keys: AttributeKey[]): string {
  return joinNames(keys.slice(0, 3).map((key) => ATTRIBUTE_LABELS[key].toLowerCase()));
}

function panelSentences(move: PanelMove | undefined, elsewhere: PanelMove[]): string[] {
  const sentences: string[] = [];
  if (move && move.retired.length > 0) {
    const who = joinNames(move.retired.slice(0, 3).map((player) => player.name));
    sentences.push(`${who} ${move.retired.length === 1 ? "has" : "have"} called it a day.`);
  }
  const promising = move?.arrived.find((player) => player.promising);
  if (promising) {
    sentences.push(`${promising.name} (${promising.age}) comes in with a real shout already.`);
  } else if (move && move.arrived.length > 0) {
    const who = joinNames(move.arrived.slice(0, 2).map((player) => `${player.name} (${player.age})`));
    sentences.push(`${who} ${move.arrived.length === 1 ? "joins" : "join"} the panel.`);
  }
  const star = elsewhere
    .flatMap((club) => club.retired.filter((player) => player.overall >= STAR_OVERALL).map((player) => ({ ...player, clubId: club.clubId })))
    .sort((a, b) => b.overall - a.overall)[0];
  if (star) {
    const club = seedChampionship.teams.find((team) => team.id === star.clubId);
    sentences.push(`${star.name} has stepped away${club ? ` from ${compactName(club)}` : ""}.`);
  }
  return sentences;
}

export function winterPanelNews(
  changes: WinterChange[],
  year: number,
  seed: number,
  move?: PanelMove,
  elsewhere: PanelMove[] = [],
): NewsItem {
  const gone = new Set(move?.retired.map((player) => player.name) ?? []);
  changes = changes.filter((change) => !gone.has(change.name));
  const risers = changes
    .filter((change) => change.overallDelta > 0 || (change.up.length > 0 && change.down.length === 0))
    .sort((a, b) => b.overallDelta - a.overallDelta || b.up.length - a.up.length);
  const fallers = changes
    .filter((change) => change.overallDelta < 0 || change.down.length > change.up.length)
    .sort((a, b) => a.overallDelta - b.overallDelta || b.down.length - a.down.length);
  const matured = changes.filter(
    (change) => change.up.includes("composure") && !risers.some((riser) => riser.name === change.name),
  );
  const sentences: string[] = [];
  if (risers.length > 0) {
    const who = joinNames(risers.slice(0, 3).map((change) => change.name));
    sentences.push(`${who} came on over the winter.`);
    const detail = risers.find((change) => change.up.length > 0);
    if (detail) {
      const stats = attrPhrase(detail.up);
      sentences.push(
        detail.up.length === 1
          ? `${detail.name}'s ${stats} is up after a summer in the jersey.`
          : `${detail.name}'s ${stats} are up after a summer in the jersey.`,
      );
    }
  }
  if (fallers.length > 0) {
    const who = joinNames(fallers.slice(0, 3).map((change) => change.name));
    sentences.push(`${who} ${fallers.length === 1 ? "has" : "have"} slipped.`);
    const legs = fallers.find((change) => change.down.includes("speed") || change.down.includes("acceleration"));
    if (legs) sentences.push(`${legs.name} has lost a yard.`);
  }
  if (matured.length > 0 && sentences.length < 4) {
    const who = joinNames(matured.slice(0, 2).map((change) => change.name));
    sentences.push(`${who} ${matured.length === 1 ? "is" : "are"} calmer on the ball. That comes with years.`);
  }
  if (sentences.length === 0) {
    sentences.push(
      "A year older, and the hurling on the card is much the same. The lads who were going to come on needed games and form.",
    );
  }
  const kept = changes.reduce((sum, change) => sum + change.trainingKept, 0);
  if (kept >= 1.5) {
    sentences.push("Some of the year's training has stuck. The younger lads kept more of it.");
  }
  const panel = panelSentences(move, elsewhere);
  sentences.push(...panel);
  const changed = (move?.retired.length ?? 0) > 0 || (move?.arrived.length ?? 0) > 0;
  sentences.push(changed ? "New summer." : "Same panel. New summer.");
  return newsItem({
    id: `${seed}-winter-${year}`,
    kind: "press",
    source: "Clare Echo",
    date: calendarDate("2026-06-12", year),
    tone: risers.length > 0 && fallers.length === 0 ? "positive" : fallers.length > 0 && risers.length === 0 ? "negative" : "neutral",
    title: "The winter panel",
    body: sentences.join(" "),
  });
}

function resetRival(runtime: ClubRuntime, names: string[], seed: number, clubId: string, ctx: { seed: number; balance?: GameSave["balance"]; careers: CareerBook }): ClubRuntime {
  const squad = ratedSquad(clubId, ctx);
  return {
    ...runtime,
    tactics: scrubTactics(runtime.tactics, activeNames(squad)),
    sheet: expandSheetToPanel(clubId, runtime.sheet, ctx),
    condition: withStartingForm(ensureCondition(names, {}, defaultCondition()), names, seed),
    inbox: [],
    trainingDue: true,
    plans: {},
    sessionsDone: 0,
    trainingDeltas: {},
    weekDeltas: {},
    nextMatchPrep: undefined,
    preseasonWeek: 1,
    lastSheet: undefined,
  };
}

/** Roll the same panels into the next Clare SHC. A share of the year's training is written onto the card, then the lifts clear. */
export function continueChampionship(save: GameSave): GameSave {
  const finished = championshipFromSave(save);
  const year = (save.year ?? finished.year) + 1;
  const winnerId = championshipWinnerId(finished);
  const careers: CareerBook = {};
  let ours: WinterChange[] = [];
  for (const team of seedChampionship.teams) {
    const advanced = advanceClub(save, team.id);
    careers[team.id] = advanced.book;
    if (team.id === save.clubId) ours = advanced.changes;
  }
  const turned = settlePanels({
    careers,
    reports: save.reports,
    seed: save.seed,
    year,
    balance: save.balance,
  });
  const ctx = { seed: save.seed, balance: save.balance, careers: turned.careers };
  const rivals: Record<string, ClubRuntime> = {};
  for (const [clubId, runtime] of Object.entries(save.rivals)) {
    rivals[clubId] = resetRival(runtime, squadNames(clubId, ctx), save.seed + year, clubId, ctx);
  }
  const names = squadNames(save.clubId, ctx);
  const oursMove = turned.moves.find((move) => move.clubId === save.clubId);
  const living = new Set(names);
  return {
    ...save,
    year,
    defendingChampionId: winnerId ?? save.defendingChampionId,
    careers: turned.careers,
    tactics: scrubTactics(save.tactics, living),
    sheet: expandSheetToPanel(save.clubId, save.sheet, ctx),
    plans: Object.fromEntries(Object.entries(save.plans).filter(([name]) => living.has(name))),
    lastSheet: undefined,
    matches: seedChampionship.matches.map((match) => ({
      id: match.id,
      homeScore: null,
      awayScore: null,
    })),
    extraMatches: [],
    reports: {},
    phase: "preseason",
    preseasonWeek: 1,
    trainingDue: true,
    sessionsDone: 0,
    trainingDeltas: {},
    weekDeltas: {},
    nextMatchPrep: undefined,
    seasonWrap: undefined,
    condition: withStartingForm(ensureCondition(names, {}, defaultCondition()), names, save.seed + year),
    rivals,
    inbox: [
      winterPanelNews(
        ours,
        year,
        save.seed,
        oursMove,
        turned.moves.filter((move) => move.clubId !== save.clubId),
      ),
      ...save.inbox,
    ].slice(0, 80),
  };
}
