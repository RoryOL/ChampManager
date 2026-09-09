import type { PlayerRatings } from "../types";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, type AttributeKey } from "./attributes";

/** Show a badge when a displayed rating is 15 or more. */
export const ELITE_STAT_MIN = 15;
export const ELITE_STAT_LIMIT = 3;

export function eliteStatKeys(ratings: Pick<PlayerRatings, AttributeKey>): AttributeKey[] {
  return ATTRIBUTE_KEYS.map((key) => ({ key, value: ratings[key] }))
    .filter((row) => row.value >= ELITE_STAT_MIN)
    .sort((left, right) => right.value - left.value || ATTRIBUTE_KEYS.indexOf(left.key) - ATTRIBUTE_KEYS.indexOf(right.key))
    .slice(0, ELITE_STAT_LIMIT)
    .map((row) => row.key);
}

export function eliteStatTitle(key: AttributeKey, value: number): string {
  return `${ATTRIBUTE_LABELS[key]} ${value}`;
}
