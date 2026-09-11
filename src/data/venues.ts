import type { MatchStage } from "../types";

/** County HQ. Semi-finals and the county final are always here. */
export const ENNIS_VENUE = "Zimmer Biomet Páirc Chíosóg, Ennis";

/**
 * Neutral grounds used in the 2026 TUS Clare SHC.
 * Group ties and earlier knockout rounds rotate around these;
 * only the semi-finals and county final are locked to Ennis.
 */
export const CHAMPIONSHIP_GROUNDS = [
  ENNIS_VENUE,
  "Dr Daly Park, Tulla",
  "O'Garney Park, Sixmilebridge",
  "Páirc Michael Uí hEithir, Cratloe",
  "Páirc na Gael, Ruan",
  "Clarecastle",
  "Newmarket-on-Fergus",
  "Shannon",
  "Broadford",
] as const;

export type ChampionshipGround = (typeof CHAMPIONSHIP_GROUNDS)[number];

export function isEnnisStage(stage: MatchStage): boolean {
  return stage === "semi-final" || stage === "final";
}

export function venueForStage(stage: MatchStage, assigned?: string): string {
  if (isEnnisStage(stage)) return ENNIS_VENUE;
  return assigned ?? ENNIS_VENUE;
}
