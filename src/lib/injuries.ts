import type {
  MatchEvent,
  PlayerCondition,
  PlayerInjury,
  RatedPlayer,
  SimulatedMatch,
  TeamSheet,
  TrainingFocus,
} from "../types";
import { pickOne, createRng, seedFrom } from "./rng";

function fitnessOf(condition: PlayerCondition): number {
  return Math.max(0, Math.min(100, Math.round(100 - condition.fatigue)));
}

const SHORT_AILMENTS = ["corked thigh", "dead leg", "stinger", "jarred wrist"] as const;
const MEDIUM_AILMENTS = ["hamstring", "groin", "twisted ankle", "quad strain", "shoulder knock"] as const;
const LONG_AILMENTS = ["knee ligament", "shoulder", "hip", "achilles"] as const;
const SEASON_AILMENTS = ["cruciate", "dislocated shoulder"] as const;

export function isInjured(condition?: PlayerCondition): boolean {
  return Boolean(condition?.injury && condition.injury.weeksLeft > 0);
}

export function injuryLine(injury: PlayerInjury): string {
  const weeks = injury.weeksLeft;
  const span =
    weeks <= 0
      ? "due back"
      : weeks === 1
        ? "1 week"
        : weeks >= 10
          ? "the rest of the season"
          : `${weeks} weeks`;
  return `${injury.ailment} · out ${span}`;
}

export function injuryChance(
  player: RatedPlayer,
  condition: PlayerCondition,
  context: "match" | "training",
  focus?: TrainingFocus,
): number {
  let chance =
    context === "match"
      ? 0.055
      : focus === "challenge"
        ? 0.08
        : focus === "fitness"
          ? 0.05
          : focus === "skills"
            ? 0.028
            : focus === "setpieces"
              ? 0.018
              : 0.01;
  const fitness = fitnessOf(condition);
  chance *= 0.45 + ((100 - fitness) / 100) * 1.9;
  if (player.age <= 21) chance *= 0.62;
  else if (player.age <= 24) chance *= 0.78;
  else if (player.age >= 36) chance *= 2.15;
  else if (player.age >= 33) chance *= 1.65;
  else if (player.age >= 30) chance *= 1.28;
  return Math.min(0.52, Math.max(0.004, chance));
}

export function rollInjuryWeeks(
  random: () => number,
  maxWeeks: number,
  player: RatedPlayer,
  condition: PlayerCondition,
): number {
  const cap = Math.max(1, maxWeeks);
  let roll = random();
  if (player.age >= 33) roll += 0.12;
  if (player.age >= 36) roll += 0.08;
  if (fitnessOf(condition) <= 40) roll += 0.1;
  if (fitnessOf(condition) <= 22) roll += 0.08;
  let weeks: number;
  if (roll < 0.38) weeks = 1;
  else if (roll < 0.62) weeks = 2;
  else if (roll < 0.78) weeks = 3 + Math.floor(random() * 2);
  else if (roll < 0.92) weeks = 5 + Math.floor(random() * 4);
  else weeks = cap;
  return Math.max(1, Math.min(cap, weeks));
}

export function ailmentFor(weeks: number, maxWeeks: number, random: () => number): string {
  if (weeks >= Math.max(8, maxWeeks - 1) && weeks >= 8) return pickOne(random, SEASON_AILMENTS);
  if (weeks >= 5) return pickOne(random, LONG_AILMENTS);
  if (weeks >= 3) return pickOne(random, MEDIUM_AILMENTS);
  return pickOne(random, SHORT_AILMENTS);
}

export type RolledInjury = {
  name: string;
  minute: number;
  injury: PlayerInjury;
  event: MatchEvent;
};

export function applyInjury(
  condition: Record<string, PlayerCondition>,
  name: string,
  injury: PlayerInjury,
): Record<string, PlayerCondition> {
  const current = condition[name] ?? { fatigue: 0, sharpness: 38, mood: 58 };
  return {
    ...condition,
    [name]: {
      ...current,
      injury,
      mood: Math.max(0, (current.mood ?? 58) - 10),
      moodNote: `Sideline with a ${injury.ailment}.`,
    },
  };
}

export function tickInjuries(
  condition: Record<string, PlayerCondition>,
  squad: RatedPlayer[],
): { condition: Record<string, PlayerCondition>; recovered: string[] } {
  const next = { ...condition };
  const recovered: string[] = [];
  for (const player of squad) {
    const current = next[player.name];
    const injury = current?.injury;
    if (!injury || injury.weeksLeft <= 0) continue;
    const weeksLeft = injury.weeksLeft - 1;
    if (weeksLeft <= 0) {
      const { injury: _dropped, ...rest } = current;
      next[player.name] = {
        ...rest,
        moodNote: `Back from a ${injury.ailment}.`,
      };
      recovered.push(player.name);
    } else {
      next[player.name] = { ...current, injury: { ...injury, weeksLeft } };
    }
  }
  return { condition: next, recovered };
}

export function sitInjuredPlayers(
  sheet: TeamSheet,
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition>,
  extraNames: string[] = [],
): TeamSheet {
  const out = new Set([
    ...extraNames,
    ...squad.filter((player) => isInjured(condition[player.name])).map((player) => player.name),
  ]);
  if (out.size === 0) return sheet;
  const healthy = squad.filter((player) => !out.has(player.name));
  const starters = [...sheet.starters];
  const subs = [...sheet.subs];
  const taken = () => new Set([...starters, ...subs]);

  const nextHealthy = () => healthy.find((player) => !taken().has(player.name))?.name;

  for (let index = 0; index < starters.length; index += 1) {
    const name = starters[index];
    if (!name || !out.has(name)) continue;
    const fromSub = subs.find((sub) => !out.has(sub) && !starters.includes(sub));
    const replacement = fromSub ?? nextHealthy();
    if (!replacement) continue;
    starters[index] = replacement;
    const subIndex = subs.indexOf(replacement);
    if (subIndex >= 0) {
      const fill = nextHealthy();
      if (fill) subs[subIndex] = fill;
      else subs.splice(subIndex, 1);
    }
  }
  for (let index = subs.length - 1; index >= 0; index -= 1) {
    const name = subs[index];
    if (!name || !out.has(name)) continue;
    const fill = nextHealthy();
    if (fill) subs[index] = fill;
    else subs.splice(index, 1);
  }
  return { starters, subs };
}

export function injuredNamesFromEvents(events: MatchEvent[], clubId: string): string[] {
  return [
    ...new Set(
      events.filter((event) => event.kind === "injury" && event.teamId === clubId && event.playerName).map((event) => event.playerName),
    ),
  ];
}

function injuryText(name: string, ailment: string, weeks: number, maxWeeks: number): string {
  if (weeks >= Math.max(8, maxWeeks - 1)) {
    return `${name} is down — looks like a ${ailment}. That could be him for the year.`;
  }
  if (weeks >= 5) {
    return `${name} pulls up with a ${ailment}. He's gone, and he won't be back for a good while.`;
  }
  return `${name} is in trouble with a ${ailment}. He's going off.`;
}

export function rollMatchInjuries(options: {
  clubId: string;
  squad: RatedPlayer[];
  condition: Record<string, PlayerCondition>;
  seed: number;
  matchId: string;
  period: "first" | "second" | "full";
  remainingWeeks: number;
  teamId: string;
  played: { name: string; minutes: number; started: boolean }[];
}): RolledInjury[] {
  const random = createRng(seedFrom(`${options.seed}:${options.matchId}:${options.period}:injuries`));
  const minMinute = options.period === "second" ? 32 : 4;
  const maxMinute = options.period === "first" ? 30 : 60;
  const rolled: RolledInjury[] = [];
  const candidates = options.played
    .filter((row) => row.minutes >= 8)
    .map((row) => {
      const player = options.squad.find((item) => item.name === row.name);
      return player ? { player, row } : null;
    })
    .filter((item): item is { player: RatedPlayer; row: (typeof options.played)[number] } => Boolean(item))
    .filter(({ player }) => !isInjured(options.condition[player.name]));

  for (const { player, row } of candidates) {
    if (rolled.length >= 2) break;
    const chance = injuryChance(player, options.condition[player.name] ?? { fatigue: 0, sharpness: 38 }, "match");
    const weight = row.started ? 1 : 0.55;
    if (random() > chance * weight) continue;
    const weeks = rollInjuryWeeks(random, options.remainingWeeks, player, options.condition[player.name] ?? { fatigue: 0, sharpness: 38 });
    const ailment = ailmentFor(weeks, options.remainingWeeks, random);
    const minute = minMinute + Math.floor(random() * Math.max(1, maxMinute - minMinute));
    const injury: PlayerInjury = {
      weeksLeft: weeks,
      durationWeeks: weeks,
      ailment,
      source: "match",
    };
    rolled.push({
      name: player.name,
      minute,
      injury,
      event: {
        minute,
        teamId: options.teamId,
        playerName: player.name,
        kind: "injury",
        text: injuryText(player.name, ailment, weeks, options.remainingWeeks),
      },
    });
  }
  return rolled;
}

export function insertInjuryEvents(sim: SimulatedMatch, injuries: RolledInjury[]): SimulatedMatch {
  if (injuries.length === 0) return sim;
  const events = [...sim.events];
  for (const item of injuries) {
    const index = events.findIndex((event) => event.kind !== "full" && event.minute > item.minute);
    const at = index === -1 ? Math.max(0, events.findIndex((event) => event.kind === "full")) : index;
    events.splice(at === -1 ? events.length : at, 0, item.event);
  }
  return { ...sim, events };
}

export function rollTrainingInjuries(options: {
  squad: RatedPlayer[];
  condition: Record<string, PlayerCondition>;
  focus: TrainingFocus;
  seed: number;
  weekKey: string;
  remainingWeeks: number;
}): RolledInjury[] {
  const random = createRng(seedFrom(`${options.seed}:${options.weekKey}:${options.focus}:train-inj`));
  const rolled: RolledInjury[] = [];
  for (const player of options.squad) {
    if (rolled.length >= 2) break;
    if (isInjured(options.condition[player.name])) continue;
    const current = options.condition[player.name] ?? { fatigue: 0, sharpness: 38 };
    if (random() > injuryChance(player, current, "training", options.focus)) continue;
    const weeks = rollInjuryWeeks(random, options.remainingWeeks, player, current);
    const ailment = ailmentFor(weeks, options.remainingWeeks, random);
    const injury: PlayerInjury = {
      weeksLeft: weeks,
      durationWeeks: weeks,
      ailment,
      source: "training",
    };
    rolled.push({
      name: player.name,
      minute: 0,
      injury,
      event: {
        minute: 0,
        teamId: "",
        playerName: player.name,
        kind: "injury",
        text: `${player.name} picked up a ${ailment} in training.`,
      },
    });
  }
  return rolled;
}
