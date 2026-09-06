import type { MatchClimate, WeatherSky } from "../types";

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

/** +1 = blowing toward the away end. */
export function parallelWind(climate: MatchClimate): number {
  const rad = (climate.windAngle * Math.PI) / 180;
  return Math.cos(rad) * (climate.windStrength / 100);
}

export function crossWind(climate: MatchClimate): number {
  const rad = (climate.windAngle * Math.PI) / 180;
  return Math.abs(Math.sin(rad)) * (climate.windStrength / 100);
}

/** Positive means this team is shooting with the wind. */
export function withWindFor(
  climate: MatchClimate,
  teamId: string,
  homeId: string,
  period: "first" | "second" | "full",
): number {
  const along = parallelWind(climate);
  const homeAttacksAwayEnd = period !== "second";
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

export function windDirectionLabel(climate: MatchClimate): string {
  const along = parallelWind(climate);
  const across = crossWind(climate);
  const strength = climate.windStrength;
  if (strength < 18) return "little movement in the flags";
  if (across >= Math.abs(along) + 0.12) {
    return across > 0.55 ? "a full crossfield wind" : "a partial crossfield breeze";
  }
  if (along > 0.12) return "down the pitch toward the far end";
  if (along < -0.12) return "down the pitch toward the near end";
  return "swirling across the square";
}

export function climateSummary(climate: MatchClimate): string {
  return `${skyLabel(climate.sky)} · ${windStrengthLabel(climate.windStrength)}, ${windDirectionLabel(climate)}`;
}

export function halfWindBlurb(climate: MatchClimate, period: "first" | "second"): string {
  const along = parallelWind(climate) * (period === "second" ? -1 : 1);
  const across = crossWind(climate);
  if (climate.windStrength < 20) return "The flags are barely moving.";
  if (across >= Math.abs(along) + 0.1) {
    return "Crossfield wind — neither side has it at their backs, and distance shooting will wander.";
  }
  if (along > 0.15) return "Home have the wind in this half.";
  if (along < -0.15) return "Away have the wind in this half.";
  return "A mixed breeze, more across than down the pitch.";
}

export function passCompleteChance(climate: MatchClimate, direct: number): number {
  let chance = 0.74 - direct * 0.06;
  if (climate.sky === "wet") chance -= 0.14;
  else if (climate.sky === "cold") chance -= 0.05;
  chance -= crossWind(climate) * 0.04;
  return Math.min(0.86, Math.max(0.42, chance));
}

export function puckoutWindAdjust(climate: MatchClimate, withWind: number): number {
  return withWind * 0.05 - crossWind(climate) * 0.16 - Math.max(0, -withWind) * 0.1;
}
