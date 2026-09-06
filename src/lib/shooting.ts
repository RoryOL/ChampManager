import type { MatchClimate, ShotAttempt, ShotKind } from "../types";
import { clampDial } from "./attributes";
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

export function openPlayConversion(options: {
  strikingDistance: number;
  composure: number;
  shooting: number;
  distanceM: number;
  withWind: number;
  crossWind: number;
  wet: boolean;
}): number {
  const quality = options.strikingDistance * 0.55 + options.composure * 0.45;
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

export function placeShot(options: {
  kind: ShotKind;
  scored: boolean;
  attackingTop: boolean;
  distanceM: number;
  random: () => number;
}): { x: number; y: number } {
  const wide = options.kind === "sideline" ? 28 + options.random() * 12 : 6 + options.random() * 22;
  const side = options.random() < 0.5 ? -1 : 1;
  const lateral =
    options.kind === "goal" || options.kind === "save"
      ? (options.random() - 0.5) * 14
      : options.kind === "sixtyFive"
        ? (options.random() - 0.5) * 16
        : side * wide * (0.35 + options.random() * 0.65);
  const x = Math.max(3, Math.min(PITCH_WIDTH - 3, PITCH_WIDTH / 2 + lateral));
  const depth = Math.max(6, options.distanceM + (options.scored ? -2 : 1) * options.random() * 4);
  const y = options.attackingTop
    ? Math.max(4, depth)
    : Math.min(PITCH_LENGTH - 4, PITCH_LENGTH - depth);
  return { x, y };
}

export function attackingTop(
  teamId: string,
  homeId: string,
  period: "first" | "second" | "full",
): boolean {
  const homeAttacksTop = period !== "second";
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
  period: "first" | "second" | "full";
  random: () => number;
}): ShotAttempt {
  const { x, y } = placeShot({
    kind: options.kind,
    scored: options.scored,
    attackingTop: attackingTop(options.teamId, options.homeId, options.period),
    distanceM: options.distanceM,
    random: options.random,
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
  period: "first" | "second" | "full",
): { withWind: number; crossWind: number; wet: boolean } {
  return {
    withWind: withWindFor(climate, teamId, homeId, period),
    crossWind: crossWind(climate),
    wet: climate.sky === "wet",
  };
}
