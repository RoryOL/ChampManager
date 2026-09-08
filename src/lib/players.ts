import type {
  MatchClimate,
  PlayerCondition,
  PlayerGrade,
  PlayerRatings,
  PositionFamiliarity,
  PositionLine,
  RatedPlayer,
  RatingsContext,
  SquadBalance,
  Tactics,
  TeamSheet,
} from "../types";
import { seedChampionship } from "../data/championship";
import { profileFor } from "../data/playerProfiles";
import { parseRatings } from "./balance";
import {
  ADJACENT_LINES,
  ATTRIBUTE_KEYS,
  OVERALL_WEIGHT_MIN,
  POSITION_LINES,
  XV_SLOTS,
  clampDial,
  compressHighEnd,
  isRoleAttribute,
  positionWeight,
  type AttributeKey,
} from "./attributes";
import { latestLineup, squadFor } from "./squads";
import { isInjured, slotFit } from "./injuries";
import { conditionFor, fitnessOf, matchStat } from "./training";

const STAR_BIAS: Record<string, Partial<Record<AttributeKey, number>>> = {
  "Tony Kelly": {
    frees: 19,
    vision: 19,
    strikingDistance: 18,
    shooting: 18,
    passing: 18,
    composure: 18,
    teamwork: 17,
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
    shooting: 17,
    strikingDistance: 16,
    teamwork: 16,
  },
  "Peter Duggan": {
    frees: 18,
    strikingDistance: 18,
    shooting: 17,
    aerialReach: 18,
    highFielding: 16,
    composure: 16,
  },
  "John Conlon": {
    workrate: 18,
    teamwork: 17,
    highFielding: 17,
    underPressure: 17,
    strength: 16,
    firstTouch: 16,
  },
  "Mark Rodgers": {
    offTheBall: 17,
    shooting: 17,
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
  return min + ((seed >>> 0) % span);
}

function shifted(seed: number, shift: number): number {
  return seed >>> shift;
}

export function clampStat(value: number): number {
  return Math.max(1, Math.min(20, Math.round(value)));
}

export function positionForIndex(index: number): PositionLine {
  return XV_SLOTS[index] ?? XV_SLOTS[index % XV_SLOTS.length] ?? "MF";
}

const STAT_FLOOR = 5;

function spreadFor(grade: PlayerGrade, weight: number): number {
  if (grade === "D") return weight < 0.4 ? 4 : 3;
  if (grade === "A") return weight >= 0.7 ? 2 : 3;
  return 3;
}

function rollStat(
  seed: number,
  shift: number,
  target: number,
  line: PositionLine,
  key: AttributeKey,
  grade: PlayerGrade,
): number {
  const weight = positionWeight(line, key);
  const wobble = stat(shifted(seed, shift), -spreadFor(grade, weight), spreadFor(grade, weight));
  const raw = Math.max(5, STAT_FLOOR + (target - STAT_FLOOR) * weight + wobble);
  const shaped = compressHighEnd(raw);
  if (grade === "A" && weight >= 0.75) {
    return Math.max(shaped, target - 5);
  }
  return shaped;
}

function rareTwenty(seed: number, shift: number): boolean {
  return stat(shifted(seed, shift), 0, 31) === 0;
}

function finalizeStat(value: number, seed: number, shift: number, cap = 19): number {
  const rounded = Math.round(value);
  if (rounded >= 20 && cap >= 20) return rareTwenty(seed, shift) ? 20 : 19;
  return clampStat(Math.min(cap, rounded));
}

function roleKeys(line: PositionLine): AttributeKey[] {
  return ATTRIBUTE_KEYS.filter((key) => isRoleAttribute(line, key));
}

function alignRoleStats(
  ratings: Record<AttributeKey, number>,
  familiarity: PositionFamiliarity,
  position: PositionLine,
  target: number,
  seed: number,
): void {
  const keys = roleKeys(position);
  if (keys.length === 0) return;
  for (let step = 0; step < 40; step += 1) {
    const overall = computeOverall(ratings, familiarity, position);
    if (overall === target) return;
    if (overall < target) {
      const cap = overall >= 18 && target >= 19 ? 19 : 18;
      const ordered = [...keys].filter((key) => ratings[key] < cap).sort((a, b) => ratings[a] - ratings[b]);
      const key = ordered[0];
      if (!key) return;
      ratings[key] = finalizeStat(ratings[key] + 1, seed, 11 + step, cap);
    } else {
      const ordered = [...keys].filter((key) => ratings[key] > 8).sort((a, b) => ratings[b] - ratings[a]);
      const key = ordered[0];
      if (!key) return;
      ratings[key] = clampStat(ratings[key] - 1);
    }
  }
}

function familiarityFor(seed: number, natural: PositionLine, floor: number): PositionFamiliarity {
  const result = {} as PositionFamiliarity;
  for (const line of POSITION_LINES) {
    if (line === natural) {
      result[line] = clampStat(Math.max(16, floor - 1, 14 + stat(shifted(seed, 2), 0, 4)));
    } else if (ADJACENT_LINES[natural].includes(line)) {
      result[line] = clampStat(11 + stat(shifted(seed, 4 + POSITION_LINES.indexOf(line)), 0, 4));
    } else {
      result[line] = clampStat(5 + stat(shifted(seed, 8 + POSITION_LINES.indexOf(line)), 0, 5));
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
  const keys: AttributeKey[] = ATTRIBUTE_KEYS;
  const ratings = {} as Record<AttributeKey, number>;
  keys.forEach((key, i) => {
    ratings[key] = finalizeStat(rollStat(seed, 3 + i * 2, target, position, key, profile.grade), seed, 5 + i, 18);
  });
  const primary = roleKeys(position);
  const spikePool = profile.grade === "D" || profile.grade === "C" || primary.length === 0 ? keys : primary;
  const spikeKey = spikePool[stat(shifted(seed, 21), 0, spikePool.length - 1)] ?? "speed";
  const spike =
    profile.grade === "A"
      ? stat(shifted(seed, 23), 1, 2)
      : profile.grade === "D"
        ? stat(shifted(seed, 23), 5, 8)
        : stat(shifted(seed, 23), 2, 4);
  const spikeCap = profile.grade === "A" && target >= 18 ? 19 : 18;
  ratings[spikeKey] = finalizeStat(Math.max(ratings[spikeKey], target) + spike, seed, 29, spikeCap);
  const dumpPool = keys.filter((key) => positionWeight(position, key) < 0.4);
  const dumpSource = dumpPool.length > 0 ? dumpPool : keys;
  const dumpKey = dumpSource[stat(shifted(seed, 25), 0, dumpSource.length - 1)] ?? "puckoutReach";
  if (dumpKey !== spikeKey && profile.grade === "D") {
    ratings[dumpKey] = clampStat(Math.max(5, ratings[dumpKey] - stat(shifted(seed, 27), 1, 3)));
  }
  const familiarity = familiarityFor(seed, position, floor);
  alignRoleStats(ratings, familiarity, position, target, seed);
  const bias = STAR_BIAS[name];
  if (bias) {
    for (const [key, value] of Object.entries(bias) as [AttributeKey, number][]) {
      const lifted = Math.max(ratings[key], value);
      ratings[key] = value >= 19 && rareTwenty(seed, 31) ? 20 : finalizeStat(lifted, seed, 31, 19);
    }
  }
  const overall = computeOverall(ratings, familiarity, position);
  return {
    ...ratings,
    familiarity,
    overall: Math.max(profile.overallMin, Math.min(profile.overallMax, overall)),
  };
}

export function playerGrade(teamId: string, name: string, index = 0): PlayerGrade {
  return profileFor(teamId, name, index >= 15).grade;
}

export function playerAge(teamId: string, name: string, index = 0): number {
  return profileFor(teamId, name, index >= 15).age;
}

export function computeOverallRaw(
  ratings: Record<AttributeKey, number>,
  familiarity: PositionFamiliarity,
  position: PositionLine,
): number {
  let weighted = 0;
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const weight = positionWeight(position, key);
    if (weight < OVERALL_WEIGHT_MIN) continue;
    weighted += ratings[key] * weight;
    total += weight;
  }
  weighted += familiarity[position] * 0.65;
  total += 0.65;
  return weighted / Math.max(total, 1);
}

export function computeOverall(
  ratings: Record<AttributeKey, number>,
  familiarity: PositionFamiliarity,
  position: PositionLine,
): number {
  return clampStat(Math.round(computeOverallRaw(ratings, familiarity, position)));
}

export function buildRatedSquad(teamId: string, gameSeed?: number): RatedPlayer[] {
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

function nudgeOverall(player: RatedPlayer, target: number): RatedPlayer {
  const ratings = { ...player.ratings };
  const familiarity = player.ratings.familiarity;
  const keys = roleKeys(player.position);
  const pool = keys.length > 0 ? keys : ATTRIBUTE_KEYS;
  for (let step = 0; step < 24; step += 1) {
    const overall = computeOverall(ratings, familiarity, player.position);
    if (overall === target) break;
    if (overall < target) {
      const key = [...pool].filter((item) => ratings[item] < 18).sort((a, b) => ratings[a] - ratings[b])[0];
      if (!key) break;
      ratings[key] = clampStat(ratings[key] + 1);
    } else {
      const key = [...pool].filter((item) => ratings[item] > 6).sort((a, b) => ratings[b] - ratings[a])[0];
      if (!key) break;
      ratings[key] = clampStat(ratings[key] - 1);
    }
  }
  return {
    ...player,
    ratings: {
      ...ratings,
      familiarity,
      overall: computeOverall(ratings, familiarity, player.position),
    },
  };
}

function shiftPlayer(player: RatedPlayer, delta: number): RatedPlayer {
  if (Math.abs(delta) < 0.05) return player;
  const ratings = { ...player.ratings, familiarity: player.ratings.familiarity };
  for (const key of ATTRIBUTE_KEYS) {
    ratings[key] = clampStat(Math.round(player.ratings[key] + delta));
  }
  ratings.overall = computeOverall(ratings, ratings.familiarity, player.position);
  const target = clampStat(Math.round(player.ratings.overall + delta));
  return target === ratings.overall ? { ...player, ratings } : nudgeOverall({ ...player, ratings }, target);
}

/** Soft-cap the very top overalls so a 19 becomes about 18. Order on the same panel stays. */
function compressStar(player: RatedPlayer): RatedPlayer {
  const overall = player.ratings.overall;
  if (overall <= 16) return player;
  const target = clampStat(Math.round(16 + (overall - 16) * 0.5));
  return target >= overall ? player : nudgeOverall(player, target);
}

export function clubXvOverall(teamId: string, squad: RatedPlayer[]): number {
  const byName = new Map(squad.map((player) => [player.name, player]));
  const values = defaultSheet(teamId)
    .starters.map((name) => byName.get(name)?.ratings.overall ?? 0)
    .filter((value) => value > 0);
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const balancedPacks = new Map<string, Map<string, RatedPlayer[]>>();

function replacePlayer(squad: RatedPlayer[], next: RatedPlayer): RatedPlayer[] {
  return squad.map((player) => (player.name === next.name ? next : player));
}

function fineTuneXv(teamId: string, squad: RatedPlayer[], target: number): RatedPlayer[] {
  let next = squad;
  const starName = [...next].sort((a, b) => b.ratings.overall - a.ratings.overall)[0]?.name;
  for (let step = 0; step < 20; step += 1) {
    const current = clubXvOverall(teamId, next);
    if (Math.abs(current - target) < 0.12) return next;
    const byName = new Map(next.map((player) => [player.name, player]));
    const xv = defaultSheet(teamId)
      .starters.map((name) => byName.get(name))
      .filter((player): player is RatedPlayer => Boolean(player));
    const wantUp = current < target;
    const candidates = xv
      .filter((player) =>
        wantUp ? player.ratings.overall < 18 : player.name !== starName && player.ratings.overall > 8,
      )
      .sort((a, b) =>
        wantUp ? a.ratings.overall - b.ratings.overall : b.ratings.overall - a.ratings.overall,
      );
    const pick = candidates[0];
    if (!pick) return next;
    const nudged = nudgeOverall(pick, pick.ratings.overall + (wantUp ? 1 : -1));
    if (nudged.ratings.overall === pick.ratings.overall) return next;
    next = replacePlayer(next, nudged);
  }
  return next;
}

function equalizeChampionship(gameSeed?: number): Map<string, RatedPlayer[]> {
  const raw = new Map<string, RatedPlayer[]>();
  const means: { id: string; mean: number }[] = [];
  for (const team of seedChampionship.teams) {
    const squad = buildRatedSquad(team.id, gameSeed).map(compressStar);
    raw.set(team.id, squad);
    means.push({ id: team.id, mean: clubXvOverall(team.id, squad) });
  }
  const target = means.reduce((sum, row) => sum + row.mean, 0) / Math.max(means.length, 1);
  const result = new Map<string, RatedPlayer[]>();
  for (const row of means) {
    const shifted = (raw.get(row.id) ?? []).map((player) => shiftPlayer(player, target - row.mean));
    result.set(row.id, fineTuneXv(row.id, shifted, target));
  }
  return result;
}

function balancedPack(gameSeed?: number): Map<string, RatedPlayer[]> {
  const key = gameSeed == null ? "static" : String(gameSeed);
  let pack = balancedPacks.get(key);
  if (!pack) {
    pack = equalizeChampionship(gameSeed);
    balancedPacks.set(key, pack);
  }
  return pack;
}

export function ratedSquad(teamId: string, ctx?: number | RatingsContext): RatedPlayer[] {
  const { seed, balance } = parseRatings(ctx);
  if (balance === "balanced") {
    return balancedPack(seed).get(teamId) ?? buildRatedSquad(teamId, seed);
  }
  return buildRatedSquad(teamId, seed);
}

/** Fifteen starters plus the rest of the panel on the bench. */
export function expandSheetToPanel(teamId: string, sheet: TeamSheet, ctx?: number | RatingsContext): TeamSheet {
  const squad = ratedSquad(teamId, ctx);
  const names = squad.map((player) => player.name);
  const known = new Set(names);
  const starters = sheet.starters.filter((name) => known.has(name)).slice(0, 15);
  const taken = new Set(starters);
  if (starters.length < 15) {
    for (const name of names) {
      if (taken.has(name)) continue;
      starters.push(name);
      taken.add(name);
      if (starters.length >= 15) break;
    }
  }
  const keptSubs = sheet.subs.filter((name) => known.has(name) && !taken.has(name));
  const rest = names.filter((name) => !taken.has(name) && !keptSubs.includes(name));
  return { starters, subs: [...keptSubs, ...rest] };
}

export function defaultSheet(teamId: string, ctx?: number | RatingsContext): TeamSheet {
  const lineup = latestLineup(teamId);
  return expandSheetToPanel(
    teamId,
    {
      starters: (lineup?.starters ?? []).map((player) => player.name).slice(0, 15),
      subs: (lineup?.subs ?? []).map((player) => player.name),
    },
    ctx,
  );
}

function coachSlotScore(player: RatedPlayer, slotIndex: number, condition: Record<string, PlayerCondition>): number {
  const healthy = isInjured(condition[player.name]) ? 0 : 800;
  const fit = fitnessOf(conditionFor(player.name, condition));
  return healthy + slotFit(player, slotIndex) + fit * 0.08;
}

/** Best available fifteen by slot, then the rest of the panel on the bench. Injured lads sit if the panel allows. */
export function coachPickSheet(
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition> = {},
): TeamSheet {
  const taken = new Set<string>();
  const pick = (slotIndex: number) =>
    [...squad]
      .filter((player) => !taken.has(player.name))
      .sort((a, b) => {
        const delta = coachSlotScore(b, slotIndex, condition) - coachSlotScore(a, slotIndex, condition);
        return delta !== 0 ? delta : a.name.localeCompare(b.name);
      })[0];

  const starters: string[] = [];
  for (let index = 0; index < 15; index += 1) {
    const next = pick(index);
    if (!next) break;
    starters.push(next.name);
    taken.add(next.name);
  }

  const subs = [...squad]
    .filter((player) => !taken.has(player.name))
    .sort((a, b) => {
      const ah = isInjured(condition[a.name]) ? 0 : 1;
      const bh = isInjured(condition[b.name]) ? 0 : 1;
      if (bh !== ah) return bh - ah;
      const overall = b.ratings.overall - a.ratings.overall;
      return overall !== 0 ? overall : a.name.localeCompare(b.name);
    })
    .map((player) => player.name);

  return { starters, subs };
}

export function sheetPlayers(teamId: string, sheet: TeamSheet, ctx?: number | RatingsContext): RatedPlayer[] {
  const squad = ratedSquad(teamId, ctx);
  const byName = new Map(squad.map((player) => [player.name, player]));
  return sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
}

/** Championship shirt for this match: 1–15 in position order, 16+ on the bench. */
export function matchShirtNumber(sheet: TeamSheet, name: string): number | undefined {
  const start = sheet.starters.indexOf(name);
  if (start >= 0) return start + 1;
  const bench = sheet.subs.indexOf(name);
  if (bench >= 0) return 16 + bench;
  return undefined;
}

export function matchOrderIndex(sheet: TeamSheet, name: string): number {
  const start = sheet.starters.indexOf(name);
  if (start >= 0) return start;
  const bench = sheet.subs.indexOf(name);
  if (bench >= 0) return 15 + bench;
  return 1000;
}

export function matchSlot(sheet: TeamSheet, name: string): PositionLine | "SUB" | undefined {
  const start = sheet.starters.indexOf(name);
  if (start >= 0) return XV_SLOTS[start] ?? "MF";
  if (sheet.subs.includes(name)) return "SUB";
  return undefined;
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
  strength: number;
  halfBackHands: number;
  puckout: number;
  pressure: number;
  longFreeTaker: RatedPlayer | undefined;
  shortFreeTaker: RatedPlayer | undefined;
  puckoutTarget: RatedPlayer | undefined;
  keeper: RatedPlayer | undefined;
};

/** Midfield (7–8) and half-forward (9–11) shirts that attacking puck-outs aim at. */
export const PUCKOUT_TARGET_INDEXES = [7, 8, 9, 10, 11];

export function aerialContestRating(highFielding: number, aerialReach: number, strength: number): number {
  return aerialReach * 0.36 + highFielding * 0.34 + strength * 0.3;
}

export function puckoutTargetPool(xv: RatedPlayer[]): RatedPlayer[] {
  return PUCKOUT_TARGET_INDEXES.map((index) => xv[index]).filter((player): player is RatedPlayer => Boolean(player));
}

export function pickPuckoutTarget(
  xv: RatedPlayer[],
  named?: string,
  condition: Record<string, PlayerCondition> = {},
): RatedPlayer | undefined {
  const pool = puckoutTargetPool(xv);
  if (pool.length === 0) return undefined;
  if (named) {
    const chosen = pool.find((player) => player.name === named);
    if (chosen) return chosen;
  }
  const score = (player: RatedPlayer) => {
    const form = conditionFor(player.name, condition);
    return aerialContestRating(
      matchStat(player.ratings.highFielding, form, "highFielding"),
      matchStat(player.ratings.aerialReach, form, "aerialReach"),
      matchStat(player.ratings.strength, form, "strength"),
    );
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

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
  puckoutKeeper?: string;
  puckoutTarget?: string;
} {
  return {
    longFreeTaker: pickNamedOrSpecialist(xv, tactics?.longFreeTaker, "frees")?.name,
    shortFreeTaker: pickNamedOrSpecialist(xv, tactics?.shortFreeTaker, "frees")?.name,
    puckoutKeeper: xv[0]?.name,
    puckoutTarget: pickPuckoutTarget(xv, tactics?.puckoutTarget)?.name,
  };
}

function xvFromSquad(
  teamId: string,
  sheet: TeamSheet,
  ctx?: number | RatingsContext,
  squad?: RatedPlayer[],
): RatedPlayer[] {
  if (!squad?.length) return sheetPlayers(teamId, sheet, ctx);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const xv = sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
  return xv.length === sheet.starters.length ? xv : sheetPlayers(teamId, sheet, ctx);
}

export function sideProfile(
  teamId: string,
  sheet: TeamSheet,
  tactics: Tactics,
  condition: Record<string, PlayerCondition> = {},
  ctx?: number | RatingsContext,
  climate?: MatchClimate,
  squad?: RatedPlayer[],
): SideProfile {
  const xv = xvFromSquad(teamId, sheet, ctx, squad);
  const scaled = (index: number, keys: AttributeKey[]) => {
    const player = xv[index];
    if (!player) return 12;
    const form = conditionFor(player.name, condition);
    const mean = average(keys.map((key) => matchStat(player.ratings[key], form, key)));
    return mean * usedInSlot(player, index);
  };

  const forwards = xv.length < 15 ? [9, 10, 11, 12, 13] : [9, 10, 11, 12, 13, 14];
  const backs = [0, 1, 2, 3, 4, 5, 6];
  const mids = [7, 8];
  const halfBacks = [4, 5, 6];
  const midfield = [...halfBacks, ...mids];

  let attack =
    average([
      ...forwards.map((i) => scaled(i, ["shooting", "strikingDistance", "offTheBall", "composure", "firstTouch"])),
      ...mids.map((i) => scaled(i, ["strikingDistance", "vision", "passing", "workrate", "teamwork"])),
    ]) || 12;
  let defence =
    average(backs.map((i) => scaled(i, ["hooking", "manMarking", "strength", "highFielding", "aerialReach"]))) ||
    12;
  let aerial =
    average(
      [...forwards, ...midfield].map((i) => scaled(i, ["highFielding", "aerialReach", "strength"])),
    ) || 12;
  let running =
    average(
      [...mids, ...forwards].map((i) =>
        scaled(i, ["speed", "acceleration", "firstTouch", "passing", "vision", "offTheBall", "teamwork"]),
      ),
    ) || 12;
  let hooking = average(backs.map((i) => scaled(i, ["hooking", "workrate"]))) || 12;
  let strength = average([...backs, ...mids].map((i) => scaled(i, ["strength"]))) || 12;
  let halfBackHands =
    average(halfBacks.map((i) => scaled(i, ["firstTouch", "passing", "vision", "underPressure"]))) || 12;
  const keeper = xv[0];
  const puckout = keeper
    ? matchStat(keeper.ratings.puckoutReach, conditionFor(keeper.name, condition), "puckoutReach") *
      usedInSlot(keeper, 0)
    : 12;
  const longFreeTaker = pickNamedOrSpecialist(xv, tactics.longFreeTaker, "frees", condition);
  const shortFreeTaker = pickNamedOrSpecialist(xv, tactics.shortFreeTaker, "frees", condition);
  const puckoutTarget = pickPuckoutTarget(xv, tactics.puckoutTarget, condition);
  const aerialOf = (player: RatedPlayer | undefined) => {
    if (!player) return 12;
    const form = conditionFor(player.name, condition);
    return aerialContestRating(
      matchStat(player.ratings.highFielding, form, "highFielding"),
      matchStat(player.ratings.aerialReach, form, "aerialReach"),
      matchStat(player.ratings.strength, form, "strength"),
    );
  };
  const targetAerial = aerialOf(puckoutTarget);
  const pack = puckoutTargetPool(xv);
  const packAerial =
    average(pack.filter((player) => player.name !== puckoutTarget?.name).map(aerialOf)) || targetAerial;
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
  attack +=
    longPuck * (puckout * 0.35 + targetAerial * 0.7 + packAerial * 0.3 - 18) * 0.08 +
    (1 - longPuck) * (halfBackHands - 12) * 0.12;
  defence += (1 - longPuck) * 0.22;
  if (tactics.shape === "sweeper" && xv.length >= 15) {
    defence += 1.6;
    attack -= 0.7;
  }
  if (xv.length < 15) {
    attack -= 0.85;
    defence -= 0.35;
  }
  const physical = clampDial(tactics.aggression ?? 46) / 100;
  const press = clampDial(tactics.pressure ?? 48) / 100;
  hooking += physical * 2.4 + press * 0.9;
  strength += physical * 1.1;
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
    strength,
    halfBackHands,
    puckout,
    pressure,
    longFreeTaker,
    shortFreeTaker,
    puckoutTarget,
    keeper,
  };
}

export function sideStrength(
  teamId: string,
  sheet: TeamSheet,
  tactics: Tactics,
  ctx?: number | RatingsContext,
): { attack: number; defence: number } {
  const profile = sideProfile(teamId, sheet, tactics, {}, ctx);
  return { attack: profile.attack, defence: profile.defence };
}

export function sideTeamwork(
  teamId: string,
  sheet: TeamSheet,
  condition: Record<string, PlayerCondition> = {},
  ctx?: number | RatingsContext,
  squad?: RatedPlayer[],
): number {
  const xv = xvFromSquad(teamId, sheet, ctx, squad);
  if (xv.length === 0) return 12;
  const total = xv.reduce(
    (sum, player) => sum + matchStat(player.ratings.teamwork, conditionFor(player.name, condition), "teamwork"),
    0,
  );
  return Math.round((total / xv.length) * 10) / 10;
}

export function clubTactics(teamId: string, balance?: SquadBalance): Tactics {
  if (balance === "balanced") return { ...DEFAULT_TACTICS };
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
