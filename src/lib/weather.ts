import type { MatchClimate, MatchPeriod, WeatherSky } from "../types";
import { periodSwitchesEnds } from "./knockout";

export type WindSides = {
  first: string;
  second: string;
};

function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function seedFrom(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function rollClimate(seed: number, matchId: string): MatchClimate {
  const random = createRng(seedFrom(`${seed}:${matchId}:climate`));
  const skyRoll = random();
  const sky: WeatherSky =
    skyRoll < 0.34 ? "sunny" : skyRoll < 0.58 ? "wet" : skyRoll < 0.78 ? "cold" : "windy";
  const base = sky === "windy" ? 64 + Math.floor(random() * 34) : 6 + Math.floor(random() * 48);
  const windStrength = sky === "windy" ? Math.max(base, 62) : base;
  const windAngle = Math.floor(random() * 360);
  return { sky, windStrength, windAngle };
}

export function climateOf(climate?: MatchClimate): MatchClimate {
  return climate ?? { sky: "sunny", windStrength: 12, windAngle: 18 };
}

/** +1 = blowing toward the end the first-named side attacks in the opening half. */
export function parallelWind(climate: MatchClimate): number {
  const rad = (climate.windAngle * Math.PI) / 180;
  return Math.cos(rad) * (climate.windStrength / 100);
}

export function crossWind(climate: MatchClimate): number {
  const rad = (climate.windAngle * Math.PI) / 180;
  return Math.abs(Math.sin(rad)) * (climate.windStrength / 100);
}

export function withWindFor(
  climate: MatchClimate,
  teamId: string,
  homeId: string,
  period: MatchPeriod,
): number {
  const along = parallelWind(climate);
  const homeAttacksAwayEnd = !periodSwitchesEnds(period);
  const isHome = teamId === homeId;
  const attackingAwayEnd = isHome ? homeAttacksAwayEnd : !homeAttacksAwayEnd;
  return attackingAwayEnd ? along : -along;
}

export function skyLabel(sky: WeatherSky): string {
  if (sky === "wet") return "Wet";
  if (sky === "cold") return "Cold";
  if (sky === "windy") return "Very windy";
  return "Sunny";
}

export function windStrengthLabel(strength: number): string {
  if (strength < 18) return "Calm";
  if (strength < 36) return "Light breeze";
  if (strength < 55) return "Fresh breeze";
  if (strength < 75) return "Strong wind";
  return "Gale";
}

type WindHold = "first" | "second" | "cross" | "calm";

function windHold(climate: MatchClimate, period: "first" | "second"): WindHold {
  const along = parallelWind(climate) * (period === "second" ? -1 : 1);
  const across = crossWind(climate);
  if (climate.windStrength < 20) return "calm";
  if (across >= Math.abs(along) + 0.1) return "cross";
  if (along > 0.15) return "first";
  if (along < -0.15) return "second";
  return "cross";
}

function nameOf(hold: "first" | "second", sides: WindSides): string {
  return hold === "first" ? sides.first : sides.second;
}

export function matchWindBlurb(climate: MatchClimate, sides: WindSides): string {
  const hold = windHold(climate, "first");
  if (hold === "calm") return "The flags are barely moving.";
  if (hold === "cross") {
    return "Crossfield wind — neither side has it at their backs, and distance shooting will wander.";
  }
  const firstHalf = nameOf(hold, sides);
  const secondHalf = nameOf(hold === "first" ? "second" : "first", sides);
  return `${firstHalf} have the wind in the first half; ${secondHalf} have it in the second.`;
}

export function halfWindBlurb(
  climate: MatchClimate,
  period: "first" | "second",
  sides: WindSides,
): string {
  const hold = windHold(climate, period);
  if (hold === "calm") return "The flags are barely moving.";
  if (hold === "cross") {
    return "Crossfield wind — neither side has it at their backs, and distance shooting will wander.";
  }
  const thisName = nameOf(hold, sides);
  const otherName = nameOf(hold === "first" ? "second" : "first", sides);
  if (period === "first") {
    return `${thisName} have the wind in this half; ${otherName} will have it after they switch ends.`;
  }
  return `${thisName} have the wind in this half; ${otherName} had it before they switched ends.`;
}

/** Coarse outlook for the home screen — no strength or direction. */
export function forecastBlurb(climate: MatchClimate): string {
  if (climate.sky === "windy") return "Expected to be windy";
  if (climate.sky === "wet") return "Expected to be wet";
  if (climate.sky === "cold") return "Expected to be cold";
  return "Expected to be dry";
}

export function climateSummary(climate: MatchClimate, sides?: WindSides): string {
  const sky = `${skyLabel(climate.sky)} · ${windStrengthLabel(climate.windStrength)}`;
  if (sides) return `${sky}. ${matchWindBlurb(climate, sides)}`;
  const along = parallelWind(climate);
  const across = crossWind(climate);
  if (climate.windStrength < 18) return `${sky}, little movement in the flags`;
  if (across >= Math.abs(along) + 0.12) {
    return `${sky}, ${across > 0.55 ? "a full crossfield wind" : "a partial crossfield breeze"}`;
  }
  return `${sky}. One side have the wind in the first half, the other after they switch ends.`;
}

export function passCompleteChance(climate: MatchClimate, direct: number, teamwork = 12, workrate = 12): number {
  let chance = 0.74 - direct * 0.06;
  if (climate.sky === "wet") chance -= 0.14;
  else if (climate.sky === "cold") chance -= 0.05;
  chance -= crossWind(climate) * 0.04;
  chance += (teamwork - 12) * 0.01;
  chance += (workrate - 12) * 0.006;
  return Math.min(0.86, Math.max(0.42, chance));
}

export function puckoutWindAdjust(climate: MatchClimate, withWind: number): number {
  return withWind * 0.05 - crossWind(climate) * 0.16 - Math.max(0, -withWind) * 0.1;
}
