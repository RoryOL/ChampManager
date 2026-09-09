import type {
  MatchEvent,
  PlayerCondition,
  PlayerInjury,
  RatedPlayer,
  SimulatedMatch,
  TeamSheet,
  TrainingIntensity,
  WeekSession,
} from "../types";
import { ADJACENT_LINES, XV_SLOTS } from "./attributes";
import { clampForm, formValue } from "./form";
import { pickOne, createRng, seedFrom } from "./rng";

/** Keep in step with `MIN_MATCH_FITNESS` in training — avoid importing that module (cycle). */
const MIN_MATCH_FITNESS = 50;
const FRESH_FITNESS = 90;

function fitnessOf(condition: PlayerCondition): number {
  return Math.max(MIN_MATCH_FITNESS, Math.min(100, Math.round(100 - condition.fatigue)));
}

function fitnessTiredness(fitness: number): number {
  if (fitness >= FRESH_FITNESS) return 0;
  if (fitness <= MIN_MATCH_FITNESS) return 1;
  return (FRESH_FITNESS - fitness) / (FRESH_FITNESS - MIN_MATCH_FITNESS);
}

const SHORT_AILMENTS = ["corked thigh", "dead leg", "stinger", "jarred wrist"] as const;
const MEDIUM_AILMENTS = ["hamstring", "groin", "twisted ankle", "quad strain", "shoulder knock"] as const;
const LONG_AILMENTS = ["knee ligament", "shoulder", "hip", "achilles"] as const;
const SEASON_AILMENTS = ["cruciate", "dislocated shoulder"] as const;

export function isInjured(condition?: PlayerCondition): boolean {
  return Boolean(condition?.injury && condition.injury.weeksLeft > 0);
}

export function isSuspended(condition?: PlayerCondition): boolean {
  return Boolean(condition?.suspension && condition.suspension.matchesLeft > 0);
}

export function isUnavailable(condition?: PlayerCondition): boolean {
  return isInjured(condition) || isSuspended(condition);
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
  focus?: WeekSession | "fitness" | "skills" | "setpieces",
  intensity: TrainingIntensity = "balanced",
): number {
  if (context === "training" && (intensity !== "intense" || focus === "recovery")) {
    return 0;
  }
  let chance =
    context === "match"
      ? 0.028
      : focus === "challenge"
        ? 0.08
        : focus === "fitness"
          ? 0.05
          : focus === "recovery"
            ? 0.01
            : focus === "setpieces"
              ? 0.018
              : focus === "skills"
                ? 0.028
                : 0.032;
  const fitness = fitnessOf(condition);
  const tired = fitnessTiredness(fitness);
  chance *= 0.45 + ((100 - fitness) / 100) * 1.9;
  // On the 50 floor the number cannot fall further, so injury risk stays high.
  chance *= 1 + tired * 0.55;
  if (fitness <= MIN_MATCH_FITNESS) chance *= 1.28;
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
  const fitness = fitnessOf(condition);
  if (fitness <= MIN_MATCH_FITNESS) roll += 0.18;
  else if (fitness <= 70) roll += 0.06;
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
  const current = condition[name] ?? { fatigue: 0, sharpness: 38 };
  return {
    ...condition,
    [name]: {
      ...current,
      injury,
      form: clampForm(formValue(current) - 4),
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
      };
      recovered.push(player.name);
    } else {
      next[player.name] = { ...current, injury: { ...injury, weeksLeft } };
    }
  }
  return { condition: next, recovered };
}

export function slotFit(player: RatedPlayer, slotIndex: number): number {
  const slot = XV_SLOTS[slotIndex] ?? "MF";
  const familiarity = player.ratings.familiarity[slot] ?? 0;
  let bonus = 0;
  if (player.position === slot) bonus += 40;
  else if ((ADJACENT_LINES[slot] ?? []).includes(player.position)) bonus += 12;
  return bonus * 10 + familiarity * 8 + player.ratings.overall;
}

export function bestBenchForSlot(
  sheet: TeamSheet,
  squad: RatedPlayer[],
  slotIndex: number,
  unavailable: Set<string>,
): string | undefined {
  const byName = new Map(squad.map((player) => [player.name, player]));
  const candidates = sheet.subs.filter(
    (name) => name && !unavailable.has(name) && !sheet.starters.includes(name) && byName.has(name),
  );
  if (candidates.length === 0) return undefined;
  return [...candidates].sort((a, b) => slotFit(byName.get(b)!, slotIndex) - slotFit(byName.get(a)!, slotIndex))[0];
}

export const MATCH_INJURY_CAP = 2;
export const MATCH_INJURY_PER_TEAM = 1;

export function remainingInjuryBudget(
  events: MatchEvent[],
  homeId: string,
  awayId: string,
): { total: number; home: number; away: number } {
  const home = events.filter((event) => event.kind === "injury" && event.teamId === homeId).length;
  const away = events.filter((event) => event.kind === "injury" && event.teamId === awayId).length;
  return {
    total: Math.max(0, MATCH_INJURY_CAP - home - away),
    home: Math.max(0, MATCH_INJURY_PER_TEAM - home),
    away: Math.max(0, MATCH_INJURY_PER_TEAM - away),
  };
}

export function closingSheetOf(
  sim: {
    homeId: string;
    awayId: string;
    homeSheet: TeamSheet;
    awaySheet: TeamSheet;
    homeClosingSheet?: TeamSheet;
    awayClosingSheet?: TeamSheet;
  },
  clubId: string,
): TeamSheet {
  if (clubId === sim.homeId) return sim.homeClosingSheet ?? sim.homeSheet;
  if (clubId === sim.awayId) return sim.awayClosingSheet ?? sim.awaySheet;
  return sim.homeSheet;
}

export function keepClubSheet(sheet: TeamSheet, squad: RatedPlayer[]): TeamSheet {
  const known = new Set(squad.map((player) => player.name));
  const seen = new Set<string>();
  const starters: string[] = [];
  const subs: string[] = [];
  for (const name of [...sheet.starters, ...sheet.subs]) {
    if (!known.has(name) || seen.has(name)) continue;
    seen.add(name);
    if (starters.length < 15) starters.push(name);
    else subs.push(name);
  }
  if (starters.length < 15) {
    for (const player of squad) {
      if (seen.has(player.name)) continue;
      starters.push(player.name);
      seen.add(player.name);
      if (starters.length >= 15) break;
    }
  }
  return { starters, subs };
}

export function closingSheetFromSlots(
  opening: TeamSheet,
  slots: string[],
  subs: string[],
  out: Iterable<string> = [],
): TeamSheet {
  const starters = [...slots];
  const bench = [...subs];
  const listed = new Set([...starters, ...bench]);
  for (const name of [...opening.starters, ...opening.subs, ...out]) {
    if (!name || listed.has(name)) continue;
    bench.push(name);
    listed.add(name);
  }
  return { starters, subs: bench };
}

export function sitInjuredPlayers(
  sheet: TeamSheet,
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition>,
  extraNames: string[] = [],
): TeamSheet {
  const cleaned = keepClubSheet(sheet, squad);
  const out = new Set([
    ...extraNames.filter((name) => squad.some((player) => player.name === name)),
    ...squad.filter((player) => isUnavailable(condition[player.name])).map((player) => player.name),
  ]);
  if (out.size === 0) return cleaned;
  const healthy = squad.filter((player) => !out.has(player.name));
  const starters = [...cleaned.starters];
  const subs = [...cleaned.subs];
  const taken = () => new Set([...starters, ...subs]);

  const nextHealthy = () => healthy.find((player) => !taken().has(player.name))?.name;

  for (let index = 0; index < starters.length; index += 1) {
    const name = starters[index];
    if (!name || !out.has(name)) continue;
    const fromSub = bestBenchForSlot({ starters, subs }, squad, index, out);
    const replacement = fromSub ?? nextHealthy();
    if (!replacement) continue;
    starters[index] = replacement;
    const subIndex = subs.indexOf(replacement);
    if (subIndex >= 0) subs[subIndex] = name;
    else subs.push(name);
  }
  return keepClubSheet({ starters, subs }, squad);
}

export function applyStraightRedSuspensions(
  condition: Record<string, PlayerCondition>,
  names: string[],
): Record<string, PlayerCondition> {
  if (names.length === 0) return condition;
  const next = { ...condition };
  for (const name of names) {
    const current = next[name] ?? { fatigue: 0, sharpness: 38 };
    next[name] = {
      ...current,
      suspension: { matchesLeft: 1, reason: "straight-red" },
    };
  }
  return next;
}

/** After a match, bans that were already being served tick down. */
export function serveSuspensions(
  condition: Record<string, PlayerCondition>,
): Record<string, PlayerCondition> {
  const next = { ...condition };
  for (const [name, current] of Object.entries(next)) {
    const suspension = current.suspension;
    if (!suspension || suspension.matchesLeft <= 0) continue;
    const matchesLeft = suspension.matchesLeft - 1;
    next[name] =
      matchesLeft <= 0 ? { ...current, suspension: undefined } : { ...current, suspension: { ...suspension, matchesLeft } };
  }
  return next;
}

export function applyMatchSuspensions(
  condition: Record<string, PlayerCondition>,
  straightRedNames: string[],
): Record<string, PlayerCondition> {
  return applyStraightRedSuspensions(serveSuspensions(condition), straightRedNames);
}

export function subEventFor(injury: RolledInjury, incoming: string): MatchEvent {
  return {
    minute: injury.minute,
    teamId: injury.event.teamId,
    playerName: incoming,
    kind: "sub",
    text: `${incoming} is on for ${injury.name}.`,
    replacedName: injury.name,
  };
}

export function injuredNamesFromEvents(events: MatchEvent[], clubId: string): string[] {
  return [
    ...new Set(
      events.filter((event) => event.kind === "injury" && event.teamId === clubId && event.playerName).map((event) => event.playerName),
    ),
  ];
}

export function injuryText(name: string, ailment: string, weeks: number, maxWeeks: number): string {
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
  maxCount?: number;
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

  const cap = Math.max(0, options.maxCount ?? 2);
  for (const { player, row } of candidates) {
    if (rolled.length >= cap) break;
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

export function insertInjuryEvents(
  sim: SimulatedMatch,
  injuries: RolledInjury[],
  aftermath?: { clubId: string; squad: RatedPlayer[]; sheet: TeamSheet },
): SimulatedMatch {
  if (injuries.length === 0) return sim;
  const events = [...sim.events];
  let sheet = aftermath?.sheet;
  const sorted = [...injuries].sort((left, right) => left.minute - right.minute || left.name.localeCompare(right.name));
  for (const item of sorted) {
    const index = events.findIndex((event) => event.kind !== "full" && event.minute > item.minute);
    const at = index === -1 ? Math.max(0, events.findIndex((event) => event.kind === "full")) : index;
    const insertAt = at === -1 ? events.length : at;
    events.splice(insertAt, 0, item.event);
    if (!aftermath || item.event.teamId !== aftermath.clubId || !sheet) continue;
    if (!sheet.starters.includes(item.name)) continue;
    const nextSheet = sitInjuredPlayers(sheet, aftermath.squad, {}, [item.name]);
    const slot = sheet.starters.indexOf(item.name);
    const incoming = slot >= 0 ? nextSheet.starters[slot] : undefined;
    if (!incoming || incoming === item.name) continue;
    events.splice(insertAt + 1, 0, subEventFor(item, incoming));
    sheet = nextSheet;
  }
  const next: SimulatedMatch = { ...sim, events };
  if (sheet && aftermath) {
    if (sim.homeId === aftermath.clubId) next.homeSheet = sheet;
    if (sim.awayId === aftermath.clubId) next.awaySheet = sheet;
  }
  return next;
}

export function rollTrainingInjuries(options: {
  squad: RatedPlayer[];
  condition: Record<string, PlayerCondition>;
  focus: WeekSession | "fitness" | "skills" | "setpieces";
  seed: number;
  weekKey: string;
  remainingWeeks: number;
  intensity?: TrainingIntensity;
}): RolledInjury[] {
  const intensity = options.intensity ?? "balanced";
  if (intensity !== "intense") return [];
  const random = createRng(seedFrom(`${options.seed}:${options.weekKey}:${options.focus}:train-inj`));
  const rolled: RolledInjury[] = [];
  for (const player of options.squad) {
    if (rolled.length >= 2) break;
    if (isInjured(options.condition[player.name])) continue;
    const current = options.condition[player.name] ?? { fatigue: 0, sharpness: 38 };
    if (random() > injuryChance(player, current, "training", options.focus, intensity)) continue;
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
