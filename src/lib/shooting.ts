import type { MatchClimate, MatchPeriod, ShotAttempt, ShotKind } from "../types";
import { clampDial } from "./attributes";
import { periodSwitchesEnds } from "./knockout";
import { crossWind, withWindFor } from "./weather";

export const PITCH_LENGTH = 145;
export const PITCH_WIDTH = 90;

export function shootingLabel(value: number): string {
  if (value < 22) return "Shoot on sight";
  if (value < 42) return "Speculative";
  if (value < 58) return "Balanced";
  if (value < 78) return "Pick the shot";
  return "Only when certain";
}

export function shotDistanceM(shooting: number, strikingDistance: number, random: () => number): number {
  const certainty = clampDial(shooting) / 100;
  const mean = 56 - certainty * 24 - (strikingDistance - 12) * 0.35;
  const spread = 12 + (1 - certainty) * 8;
  return Math.max(10, Math.min(82, mean + (random() - 0.5) * spread * 2));
}

/** Half-backs (4–6) and midfielders (7–8) take the distance looks. */
export function midfieldDistanceSlot(index: number): boolean {
  return index >= 4 && index <= 8;
}

/** Chance a midfielder or half-back pulls the trigger from range. Easier with space. */
export function distanceAttemptChance(
  strikingDistance: number,
  shooting: number,
  slotIndex: number,
  pressure = 48,
): number {
  if (!midfieldDistanceSlot(slotIndex)) return 0;
  const dst = Math.max(0, strikingDistance - 8);
  const sht = Math.max(0, shooting - 8);
  const line = slotIndex >= 7 ? 1 : 0.82;
  const press = clampDial(pressure) / 100;
  const space = 1 + (0.48 - press) * 0.28;
  return Math.min(0.58, Math.max(0, (0.03 + dst * 0.022 + sht * 0.013) * line * space));
}

export function distanceShotM(strikingDistance: number, random: () => number): number {
  const mean = 54 + (strikingDistance - 12) * 0.4;
  return Math.max(46, Math.min(70, mean + (random() - 0.5) * 12));
}

/** Distance shots drop more easily when the press is on. */
export function distancePressureMul(pressure: number): number {
  const press = clampDial(pressure) / 100;
  return Math.min(1.2, Math.max(0.78, 1.14 - press * 0.36));
}

export function openPlayConversion(options: {
  strikingDistance: number;
  composure: number;
  shooting: number;
  finishing?: number;
  distanceM: number;
  withWind: number;
  crossWind: number;
  wet: boolean;
}): number {
  const finishing = options.finishing ?? options.strikingDistance;
  const quality = options.strikingDistance * 0.28 + finishing * 0.37 + options.composure * 0.35;
  const qualityTerm = (quality - 12) * 0.022;
  const certaintyTerm = (clampDial(options.shooting) / 100 - 0.5) * 0.24;
  const distanceTerm = (45 - options.distanceM) * 0.004;
  const windTerm =
    options.withWind * 0.08 - options.crossWind * (0.06 + Math.max(0, options.distanceM - 35) * 0.0025);
  const wetTerm = options.wet ? -0.04 : 0;
  return Math.min(0.86, Math.max(0.22, 0.6 + qualityTerm + certaintyTerm + distanceTerm + windTerm + wetTerm));
}

export function setPieceConversion(
  base: number,
  distanceM: number,
  withWind: number,
  across: number,
): number {
  const distancePenalty = Math.max(0, distanceM - 30) * 0.002 + across * (0.08 + Math.max(0, distanceM - 40) * 0.002);
  return Math.min(0.92, Math.max(0.14, base * (1 + withWind * 0.07) - distancePenalty));
}

export function goalChanceFromDistance(distanceM: number, sweeperCut: number): number {
  const close = Math.max(0, 32 - distanceM) / 32;
  return Math.min(0.34, Math.max(0.035, (0.07 + close * 0.26) * sweeperCut));
}

export type SidelineZone = "defensive" | "midfield" | "attacking";

/** On-pitch station for an XV slot. Index 1/4/9/12 are the attacking right. */
export function slotPitchPos(index: number, attackingTop: boolean): { x: number; y: number } {
  const line = index <= 0 ? 0 : index <= 3 ? 1 : index <= 6 ? 2 : index <= 8 ? 3 : index <= 11 ? 4 : 5;
  const depth = [10, 32, 55, 76, 98, 122][line] ?? 76;
  const y = attackingTop ? PITCH_LENGTH - depth : depth;
  const rightX = attackingTop ? 76 : 14;
  const leftX = attackingTop ? 14 : 76;
  let lane = 1;
  if (index <= 0) lane = 1;
  else if (index <= 3) lane = index - 1;
  else if (index <= 6) lane = index - 4;
  else if (index <= 8) lane = index === 7 ? 0 : 2;
  else if (index <= 11) lane = index - 9;
  else lane = Math.min(2, index - 12);
  const x = lane <= 0 ? rightX : lane >= 2 ? leftX : PITCH_WIDTH / 2;
  return { x, y };
}

export function nearestToSpot(
  names: string[],
  attackingTop: boolean,
  x: number,
  y: number,
  options?: { skip?: ReadonlySet<string>; includeKeeper?: boolean },
): { name: string; index: number } {
  const skip = options?.skip;
  const start = options?.includeKeeper ? 0 : 1;
  let best: { name: string; index: number; dist: number } | undefined;
  for (let i = start; i < names.length; i += 1) {
    const name = names[i];
    if (!name || skip?.has(name)) continue;
    const pos = slotPitchPos(i, attackingTop);
    const dist = (pos.x - x) ** 2 + (pos.y - y) ** 2;
    if (!best || dist < best.dist) best = { name, index: i, dist };
  }
  if (best) return { name: best.name, index: best.index };
  const fallback = names.find((name) => Boolean(name) && !skip?.has(name)) ?? names[0];
  return { name: fallback ?? "a substitute", index: Math.max(0, names.indexOf(fallback ?? "")) };
}

export function sidelineSpot(
  attackingTop: boolean,
  zone: SidelineZone,
  random: () => number,
): { x: number; y: number; distanceM: number } {
  const distanceM =
    zone === "attacking" ? 20 + random() * 34 : zone === "midfield" ? 54 + random() * 26 : 80 + random() * 36;
  const y = attackingTop ? distanceM : PITCH_LENGTH - distanceM;
  const x = random() < 0.5 ? 2 : PITCH_WIDTH - 2;
  return { x, y, distanceM };
}

export function sidelineLanding(
  spot: { x: number; y: number; distanceM: number },
  attackingTop: boolean,
  carryM: number,
): { x: number; y: number; distanceM: number } {
  const infield = spot.x < PITCH_WIDTH / 2 ? 1 : -1;
  const remaining = Math.max(8, spot.distanceM - carryM * 0.52);
  const y = attackingTop ? remaining : PITCH_LENGTH - remaining;
  const x = Math.max(10, Math.min(PITCH_WIDTH - 10, spot.x + infield * Math.min(36, 10 + carryM * 0.22)));
  return { x, y, distanceM: remaining };
}

export function placeShot(options: {
  kind: ShotKind;
  scored: boolean;
  attackingTop: boolean;
  distanceM: number;
  random: () => number;
  x?: number;
}): { x: number; y: number } {
  const wide = options.kind === "sideline" ? 28 + options.random() * 12 : 6 + options.random() * 22;
  const side = options.random() < 0.5 ? -1 : 1;
  const lateral =
    options.kind === "goal" || options.kind === "save"
      ? (options.random() - 0.5) * 14
      : options.kind === "sixtyFive"
        ? (options.random() - 0.5) * 16
        : side * wide * (0.35 + options.random() * 0.65);
  const x =
    options.x != null
      ? Math.max(2, Math.min(PITCH_WIDTH - 2, options.x))
      : Math.max(3, Math.min(PITCH_WIDTH - 3, PITCH_WIDTH / 2 + lateral));
  const depth = Math.max(6, options.distanceM + (options.scored ? -2 : 1) * options.random() * 4);
  const y = options.attackingTop
    ? Math.max(4, depth)
    : Math.min(PITCH_LENGTH - 4, PITCH_LENGTH - depth);
  return { x, y };
}

export function attackingTop(
  teamId: string,
  homeId: string,
  period: MatchPeriod,
): boolean {
  const homeAttacksTop = !periodSwitchesEnds(period);
  return teamId === homeId ? homeAttacksTop : !homeAttacksTop;
}

export function makeShot(options: {
  minute: number;
  teamId: string;
  homeId: string;
  playerName: string;
  kind: ShotKind;
  scored: boolean;
  distanceM: number;
  period: MatchPeriod;
  random: () => number;
  x?: number;
}): ShotAttempt {
  const { x, y } = placeShot({
    kind: options.kind,
    scored: options.scored,
    attackingTop: attackingTop(options.teamId, options.homeId, options.period),
    distanceM: options.distanceM,
    random: options.random,
    x: options.x,
  });
  return {
    minute: options.minute,
    teamId: options.teamId,
    playerName: options.playerName,
    kind: options.kind,
    scored: options.scored,
    x,
    y,
    distance: Math.round(options.distanceM * 10) / 10,
  };
}

export function conversionContext(
  climate: MatchClimate,
  teamId: string,
  homeId: string,
  period: MatchPeriod,
): { withWind: number; crossWind: number; wet: boolean } {
  return {
    withWind: withWindFor(climate, teamId, homeId, period),
    crossWind: crossWind(climate),
    wet: climate.sky === "wet",
  };
}
