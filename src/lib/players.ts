import type {
  MatchClimate,
  PlayerCondition,
  PlayerGrade,
  PlayerRatings,
  PositionFamiliarity,
  PositionLine,
  RatedPlayer,
  Tactics,
  TeamSheet,
} from "../types";
import { profileFor } from "../data/playerProfiles";
import {
  ADJACENT_LINES,
  POSITION_LINES,
  XV_SLOTS,
  clampDial,
  type AttributeKey,
} from "./attributes";
import { latestLineup, squadFor } from "./squads";
import { conditionFor, matchStat } from "./training";

const STAR_BIAS: Record<string, Partial<Record<AttributeKey, number>>> = {
  "Tony Kelly": {
    frees: 19,
    vision: 19,
    strikingDistance: 18,
    passing: 18,
    composure: 18,
    firstTouch: 18,
    underPressure: 18,
    sidelines: 16,
  },
  "Shane O'Donnell": {
    speed: 19,
    acceleration: 18,
    firstTouch: 18,
    offTheBall: 18,
    composure: 17,
    strikingDistance: 16,
  },
  "Peter Duggan": {
    frees: 18,
    strikingDistance: 18,
    aerialReach: 18,
    highFielding: 16,
    composure: 16,
  },
  "John Conlon": {
    workrate: 18,
    highFielding: 17,
    underPressure: 17,
    strength: 16,
    firstTouch: 16,
  },
  "Mark Rodgers": {
    offTheBall: 17,
    strikingDistance: 17,
    frees: 16,
    composure: 16,
    speed: 16,
  },
  "Aidan McCarthy": { frees: 18, composure: 17, strikingDistance: 16, underPressure: 16 },
  "Danny Russell": { frees: 17, strikingDistance: 16, composure: 16, offTheBall: 15 },
  "David Fitzgerald": { stamina: 18, workrate: 17, speed: 16, highFielding: 16, passing: 15 },
  "Diarmuid Ryan": { speed: 17, aerialReach: 16, stamina: 16, strikingDistance: 15 },
  "Podge Collins": { firstTouch: 17, workrate: 17, vision: 16, offTheBall: 16 },
  "Conor Cleary": { strength: 17, manMarking: 17, aerialReach: 16, hooking: 16 },
  "Aron Shanagher": { aerialReach: 17, highFielding: 16, strength: 16, offTheBall: 15 },
  "Adam Hogan": { manMarking: 17, hooking: 16, speed: 15, underPressure: 15 },
  "Eibhear Quilligan": { puckoutReach: 17, highFielding: 16, composure: 15, aerialReach: 15 },
  "Niall Deasy": { frees: 17, composure: 16, strikingDistance: 15 },
  "David Reidy": { frees: 16, passing: 16, vision: 15 },
  "Cathal Malone": { stamina: 16, workrate: 16, highFielding: 15 },
  "Seadna Morey": { manMarking: 16, hooking: 15, speed: 15 },
};

export const DEFAULT_TACTICS: Tactics = {
  mentality: "balanced",
  build: 42,
  puckout: 58,
  aggression: 46,
  pressure: 48,
  shooting: 50,
  shape: "traditional",
};

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function stat(seed: number, min: number, max: number): number {
  const span = max - min + 1;
  return min + (seed % span);
}

export function clampStat(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value)));
}

export function positionForIndex(index: number): PositionLine {
  return XV_SLOTS[index] ?? XV_SLOTS[index % XV_SLOTS.length] ?? "MF";
}

function lineBias(line: PositionLine, key: AttributeKey): number {
  const table: Record<PositionLine, Partial<Record<AttributeKey, number>>> = {
    GK: {
      puckoutReach: 4,
      highFielding: 2,
      aerialReach: 2,
      composure: 2,
      speed: -2,
      offTheBall: -3,
      frees: -4,
      sidelines: -3,
    },
    FB: {
      strength: 3,
      manMarking: 3,
      aerialReach: 2,
      hooking: 2,
      speed: -1,
      frees: -3,
      strikingDistance: -2,
    },
    HB: {
      stamina: 2,
      passing: 2,
      aerialReach: 1,
      highFielding: 1,
      strikingDistance: 1,
      sidelines: 1,
      manMarking: 1,
    },
    MF: {
      stamina: 3,
      workrate: 2,
      highFielding: 2,
      speed: 1,
      passing: 1,
      strikingDistance: 1,
    },
    HF: {
      firstTouch: 2,
      vision: 2,
      passing: 2,
      strikingDistance: 2,
      offTheBall: 1,
      frees: 1,
      sidelines: 1,
    },
    FF: {
      offTheBall: 3,
      composure: 2,
      strikingDistance: 2,
      frees: 2,
      firstTouch: 1,
      manMarking: -2,
      puckoutReach: -3,
    },
  };
  return table[line][key] ?? 0;
}

function rollStat(
  seed: number,
  shift: number,
  base: number,
  line: PositionLine,
  key: AttributeKey,
  floor: number,
  spread: number,
): number {
  const wobble = stat(seed >> shift, -spread, spread);
  const raw = base + lineBias(line, key) + wobble;
  const lifted = floor > 0 ? Math.max(raw, floor - 8) : raw;
  return clampStat(lifted);
}

function familiarityFor(seed: number, natural: PositionLine, floor: number): PositionFamiliarity {
  const result = {} as PositionFamiliarity;
  for (const line of POSITION_LINES) {
    if (line === natural) {
      result[line] = clampStat(Math.max(16, floor - 1, 14 + stat(seed >> 2, 0, 4)));
    } else if (ADJACENT_LINES[natural].includes(line)) {
      result[line] = clampStat(11 + stat(seed >> (4 + POSITION_LINES.indexOf(line)), 0, 4));
    } else {
      result[line] = clampStat(5 + stat(seed >> (8 + POSITION_LINES.indexOf(line)), 0, 5));
    }
  }
  return result;
}

export function ratePlayer(teamId: string, name: string, index: number, gameSeed?: number): PlayerRatings {
  const seed =
    gameSeed == null ? hash(`${teamId}:${name.toLowerCase()}`) : hash(`${gameSeed}:${teamId}:${name.toLowerCase()}`);
  const panel = index >= 15;
  const profile = profileFor(teamId, name, panel);
  const position = profile.position ?? positionForIndex(index);
  const target = stat(seed, profile.overallMin, profile.overallMax);
  const floor = profile.grade === "A" ? profile.overallMin : 0;
  const base = target;
  const spread = profile.grade === "D" ? 6 : profile.grade === "A" ? 3 : 4;
  const keys: AttributeKey[] = [
    "speed",
    "aerialReach",
    "stamina",
    "strength",
    "acceleration",
    "firstTouch",
    "highFielding",
    "strikingDistance",
    "vision",
    "hooking",
    "passing",
    "offTheBall",
    "manMarking",
    "workrate",
    "underPressure",
    "composure",
    "frees",
    "sidelines",
    "puckoutReach",
  ];
  const ratings = {} as Record<AttributeKey, number>;
  keys.forEach((key, i) => {
    ratings[key] = rollStat(seed, 3 + i * 2, base, position, key, floor, spread);
  });
  const spikeKey = keys[stat(seed >> 21, 0, keys.length - 1)] ?? "speed";
  const spike =
    profile.grade === "A" ? stat(seed >> 23, 1, 3) : profile.grade === "D" ? stat(seed >> 23, 4, 9) : stat(seed >> 23, 2, 5);
  ratings[spikeKey] = clampStat(ratings[spikeKey] + spike);
  const dumpKey = keys[stat(seed >> 25, 0, keys.length - 1)] ?? "puckoutReach";
  if (dumpKey !== spikeKey && profile.grade === "D") {
    ratings[dumpKey] = clampStat(ratings[dumpKey] - stat(seed >> 27, 2, 6));
  }
  const familiarity = familiarityFor(seed, position, floor);
  let overall = computeOverall(ratings, familiarity, position);
  if (overall < profile.overallMin || overall > profile.overallMax) {
    const delta = target - overall;
    for (const key of keys) {
      ratings[key] = clampStat(ratings[key] + delta);
    }
    overall = computeOverall(ratings, familiarity, position);
  }
  const bias = STAR_BIAS[name];
  if (bias) {
    for (const [key, value] of Object.entries(bias) as [AttributeKey, number][]) {
      ratings[key] = clampStat(Math.max(ratings[key], value));
    }
  }
  overall = Math.max(profile.overallMin, Math.min(profile.overallMax, computeOverall(ratings, familiarity, position)));
  return {
    ...ratings,
    familiarity,
    overall,
  };
}

export function playerGrade(teamId: string, name: string, index = 0): PlayerGrade {
  return profileFor(teamId, name, index >= 15).grade;
}

export function playerAge(teamId: string, name: string, index = 0): number {
  return profileFor(teamId, name, index >= 15).age;
}

export function computeOverall(
  ratings: Record<AttributeKey, number>,
  familiarity: PositionFamiliarity,
  position: PositionLine,
): number {
  return clampStat(
    Math.round(
      (ratings.speed +
        ratings.aerialReach +
        ratings.stamina +
        ratings.firstTouch +
        ratings.highFielding +
        ratings.strikingDistance +
        ratings.vision +
        ratings.passing +
        ratings.offTheBall +
        ratings.workrate +
        ratings.composure +
        ratings.frees * 1.15 +
        familiarity[position]) /
        13,
    ),
  );
}

export function ratedSquad(teamId: string, gameSeed?: number): RatedPlayer[] {
  const lineup = latestLineup(teamId);
  const order = [
    ...(lineup?.starters.map((player) => player.name) ?? []),
    ...(lineup?.subs.map((player) => player.name) ?? []),
  ];
  const squad = squadFor(teamId);
  return squad.map((player) => {
    const listed = order.indexOf(player.name);
    const index = listed >= 0 ? listed : 15;
    const profile = profileFor(teamId, player.name, index >= 15);
    return {
      ...player,
      position: profile.position,
      ratings: ratePlayer(teamId, player.name, index, gameSeed),
      age: profile.age,
      grade: profile.grade,
    };
  });
}

export function defaultSheet(teamId: string): TeamSheet {
  const lineup = latestLineup(teamId);
  return {
    starters: (lineup?.starters ?? []).map((player) => player.name).slice(0, 15),
    subs: (lineup?.subs ?? []).map((player) => player.name).slice(0, 5),
  };
}

export function sheetPlayers(teamId: string, sheet: TeamSheet, gameSeed?: number): RatedPlayer[] {
  const squad = ratedSquad(teamId, gameSeed);
  const byName = new Map(squad.map((player) => [player.name, player]));
  return sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
}

export function swapPlayersInSheet(sheet: TeamSheet, first: string, second: string): TeamSheet {
  const starters = [...sheet.starters];
  const subs = [...sheet.subs];
  const i = starters.indexOf(first);
  const j = starters.indexOf(second);
  const a = subs.indexOf(first);
  const b = subs.indexOf(second);
  if (i >= 0 && j >= 0) {
    [starters[i], starters[j]] = [starters[j], starters[i]];
  } else if (i >= 0 && b >= 0) {
    starters[i] = second;
    subs[b] = first;
  } else if (j >= 0 && a >= 0) {
    starters[j] = first;
    subs[a] = second;
  } else if (i >= 0) {
    starters[i] = second;
  } else if (j >= 0) {
    starters[j] = first;
  }
  return { starters, subs };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slotLine(index: number): PositionLine {
  return XV_SLOTS[index] ?? "MF";
}

function usedInSlot(player: RatedPlayer, index: number): number {
  const line = slotLine(index);
  const fam = player.ratings.familiarity[line] / 20;
  return 0.62 + 0.38 * fam;
}

export type SideProfile = {
  attack: number;
  defence: number;
  aerial: number;
  running: number;
  hooking: number;
  deadBall: number;
  halfBackHands: number;
  puckout: number;
  pressure: number;
  longFreeTaker: RatedPlayer | undefined;
  shortFreeTaker: RatedPlayer | undefined;
  sidelineTaker: RatedPlayer | undefined;
  keeper: RatedPlayer | undefined;
};

export function pickSpecialist(
  xv: RatedPlayer[],
  key: AttributeKey,
  condition: Record<string, PlayerCondition> = {},
): RatedPlayer | undefined {
  if (xv.length === 0) return undefined;
  return [...xv].sort(
    (a, b) =>
      matchStat(b.ratings[key], conditionFor(b.name, condition), key) -
      matchStat(a.ratings[key], conditionFor(a.name, condition), key),
  )[0];
}

export function pickNamedOrSpecialist(
  xv: RatedPlayer[],
  name: string | undefined,
  key: AttributeKey,
  condition: Record<string, PlayerCondition> = {},
): RatedPlayer | undefined {
  if (name) {
    const named = xv.find((player) => player.name === name);
    if (named) return named;
  }
  return pickSpecialist(xv, key, condition);
}

export function designatedRoles(
  xv: RatedPlayer[],
  tactics?: Tactics,
): {
  longFreeTaker?: string;
  shortFreeTaker?: string;
  sidelineTaker?: string;
  puckoutKeeper?: string;
} {
  return {
    longFreeTaker: pickNamedOrSpecialist(xv, tactics?.longFreeTaker, "frees")?.name,
    shortFreeTaker: pickNamedOrSpecialist(xv, tactics?.shortFreeTaker, "frees")?.name,
    sidelineTaker: pickNamedOrSpecialist(xv, tactics?.sidelineTaker, "sidelines")?.name,
    puckoutKeeper: xv[0]?.name,
  };
}

export function sideProfile(
  teamId: string,
  sheet: TeamSheet,
  tactics: Tactics,
  condition: Record<string, PlayerCondition> = {},
  gameSeed?: number,
  climate?: MatchClimate,
): SideProfile {
  const xv = sheetPlayers(teamId, sheet, gameSeed);
  const scaled = (index: number, keys: AttributeKey[]) => {
    const player = xv[index];
    if (!player) return 12;
    const form = conditionFor(player.name, condition);
    const mean = average(keys.map((key) => matchStat(player.ratings[key], form, key)));
    return mean * usedInSlot(player, index);
  };

  const forwards = [9, 10, 11, 12, 13, 14];
  const backs = [0, 1, 2, 3, 4, 5, 6];
  const mids = [7, 8];
  const halfBacks = [4, 5, 6];
  const midfield = [...halfBacks, ...mids];

  let attack =
    average([
      ...forwards.map((i) => scaled(i, ["strikingDistance", "offTheBall", "composure", "firstTouch", "frees"])),
      ...mids.map((i) => scaled(i, ["strikingDistance", "vision", "passing", "workrate"])),
    ]) || 12;
  let defence =
    average(backs.map((i) => scaled(i, ["hooking", "manMarking", "strength", "highFielding", "aerialReach"]))) ||
    12;
  let aerial =
    average(midfield.map((i) => scaled(i, ["highFielding", "aerialReach", "strength"]))) || 12;
  let running =
    average(
      [...mids, ...forwards].map((i) =>
        scaled(i, ["speed", "acceleration", "firstTouch", "passing", "vision", "offTheBall"]),
      ),
    ) || 12;
  let hooking = average(backs.map((i) => scaled(i, ["hooking", "strength", "workrate"]))) || 12;
  let halfBackHands =
    average(halfBacks.map((i) => scaled(i, ["firstTouch", "passing", "vision", "underPressure"]))) || 12;
  const keeper = xv[0];
  const puckout = keeper
    ? matchStat(keeper.ratings.puckoutReach, conditionFor(keeper.name, condition), "puckoutReach") *
      usedInSlot(keeper, 0)
    : 12;
  const longFreeTaker = pickNamedOrSpecialist(xv, tactics.longFreeTaker, "frees", condition);
  const shortFreeTaker = pickNamedOrSpecialist(xv, tactics.shortFreeTaker, "frees", condition);
  const sidelineTaker = pickNamedOrSpecialist(xv, tactics.sidelineTaker, "sidelines", condition);
  const deadBallTaker = longFreeTaker ?? shortFreeTaker;
  const deadBall = deadBallTaker
    ? (matchStat(deadBallTaker.ratings.frees, conditionFor(deadBallTaker.name, condition), "frees") * 1.2 +
        matchStat(deadBallTaker.ratings.composure, conditionFor(deadBallTaker.name, condition), "composure") +
        matchStat(deadBallTaker.ratings.underPressure, conditionFor(deadBallTaker.name, condition), "underPressure")) /
      3.2
    : 12;
  const pressure =
    average(xv.map((player) => matchStat(player.ratings.underPressure, conditionFor(player.name, condition), "underPressure"))) ||
    12;

  if (tactics.mentality === "attacking") {
    attack += 1.4;
    defence -= 0.8;
  }
  if (tactics.mentality === "contain") {
    attack -= 0.9;
    defence += 1.3;
  }
  const direct = clampDial(tactics.build) / 100;
  const longPuck = clampDial(tactics.puckout) / 100;
  attack += direct * (0.4 + (aerial - 12) * 0.12) + (1 - direct) * (0.28 + (running - 12) * 0.14);
  attack += longPuck * (puckout + aerial - 24) * 0.08 + (1 - longPuck) * (halfBackHands - 12) * 0.12;
  defence += (1 - longPuck) * 0.22;
  if (tactics.shape === "sweeper") {
    defence += 1.6;
    attack -= 0.7;
  }
  const physical = clampDial(tactics.aggression ?? 46) / 100;
  const press = clampDial(tactics.pressure ?? 48) / 100;
  hooking += physical * 2.4 + press * 0.9;
  defence += physical * 0.9 + press * 0.35;

  if (climate?.sky === "wet") {
    running *= 0.86;
    hooking += 0.85;
    defence += 0.45;
    aerial += 0.3;
    halfBackHands *= 0.88;
    attack -= 0.25;
  } else if (climate?.sky === "cold") {
    running *= 0.93;
    halfBackHands *= 0.96;
    attack -= 0.15;
  }

  return {
    attack,
    defence,
    aerial,
    running,
    hooking,
    deadBall,
    halfBackHands,
    puckout,
    pressure,
    longFreeTaker,
    shortFreeTaker,
    sidelineTaker,
    keeper,
  };
}

export function sideStrength(
  teamId: string,
  sheet: TeamSheet,
  tactics: Tactics,
  gameSeed?: number,
): { attack: number; defence: number } {
  const profile = sideProfile(teamId, sheet, tactics, {}, gameSeed);
  return { attack: profile.attack, defence: profile.defence };
}

export function clubTactics(teamId: string): Tactics {
  const value = hash(teamId);
  const mentalities: Tactics["mentality"][] = ["contain", "balanced", "balanced", "attacking"];
  return {
    mentality: mentalities[value % mentalities.length] ?? "balanced",
    build: 18 + ((value >> 3) % 70),
    puckout: 16 + ((value >> 5) % 72),
    aggression: 14 + ((value >> 9) % 74),
    pressure: 12 + ((value >> 11) % 76),
    shooting: 22 + ((value >> 13) % 58),
    shape: (value >> 7) % 3 === 0 ? "sweeper" : "traditional",
  };
}
