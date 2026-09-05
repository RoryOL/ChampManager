import type { PlayerRatings, PositionLine, Tactics } from "../types";

export const POSITION_LINES: PositionLine[] = ["GK", "FB", "HB", "MF", "HF", "FF"];

export const XV_SLOTS: PositionLine[] = [
  "GK",
  "FB",
  "FB",
  "FB",
  "HB",
  "HB",
  "HB",
  "MF",
  "MF",
  "HF",
  "HF",
  "HF",
  "FF",
  "FF",
  "FF",
];

export const LINE_LABELS: Record<PositionLine, string> = {
  GK: "Goalkeeper",
  FB: "Full-back line",
  HB: "Half-back line",
  MF: "Midfield",
  HF: "Half-forward line",
  FF: "Full-forward line",
};

export const ADJACENT_LINES: Record<PositionLine, PositionLine[]> = {
  GK: ["GK", "FB"],
  FB: ["GK", "FB", "HB"],
  HB: ["FB", "HB", "MF"],
  MF: ["HB", "MF", "HF"],
  HF: ["MF", "HF", "FF"],
  FF: ["HF", "FF"],
};

export type AttributeKey = Exclude<keyof PlayerRatings, "familiarity" | "overall">;

export type AttributeGroup = {
  id: "physical" | "iq" | "mentality" | "setPieces";
  label: string;
  keys: AttributeKey[];
};

export const ATTRIBUTE_GROUPS: AttributeGroup[] = [
  {
    id: "physical",
    label: "Physical",
    keys: ["speed", "aerialReach", "stamina", "strength", "acceleration"],
  },
  {
    id: "iq",
    label: "Hurling IQ",
    keys: [
      "firstTouch",
      "highFielding",
      "strikingDistance",
      "vision",
      "hooking",
      "passing",
      "offTheBall",
      "manMarking",
    ],
  },
  {
    id: "mentality",
    label: "Mentality",
    keys: ["workrate", "underPressure", "composure"],
  },
  {
    id: "setPieces",
    label: "Set pieces",
    keys: ["frees", "sidelines", "puckoutReach"],
  },
];

export const ATTRIBUTE_KEYS: AttributeKey[] = ATTRIBUTE_GROUPS.flatMap((group) => group.keys);

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  speed: "Speed",
  aerialReach: "Aerial reach",
  stamina: "Stamina",
  strength: "Strength / aggression",
  acceleration: "Acceleration",
  firstTouch: "First touch",
  highFielding: "High fielding",
  strikingDistance: "Striking from distance",
  vision: "Vision",
  hooking: "Hooking / blocking",
  passing: "Passing",
  offTheBall: "Off the ball",
  manMarking: "Man marking",
  workrate: "Workrate",
  underPressure: "Ability under pressure",
  composure: "Composure",
  frees: "Frees",
  sidelines: "Sidelines",
  puckoutReach: "Puck-out reach",
};

export const MENTALITY_OPTIONS: { value: Tactics["mentality"]; title: string; copy: string }[] = [
  { value: "contain", title: "Contain", copy: "Sit in, keep shape, and play for the next ball." },
  { value: "balanced", title: "Balanced", copy: "Standard championship shape — contest both ends." },
  { value: "attacking", title: "Attacking", copy: "Push up, leave space behind, and hunt a score from every possession." },
];

export const SHAPE_OPTIONS: { value: Tactics["shape"]; title: string; copy: string }[] = [
  {
    value: "traditional",
    title: "Traditional 6-2-6",
    copy: "Six backs, two midfielders, six forwards. More bodies in the scoring zone.",
  },
  {
    value: "sweeper",
    title: "Sweeper (7 backs)",
    copy: "Drop a seventh defender. Cuts goals against you; your own attack has less room.",
  },
];

export function clampDial(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildLabel(value: number): string {
  if (value < 25) return "Short passing";
  if (value < 45) return "Running game";
  if (value < 60) return "Mixed build-up";
  if (value < 80) return "Longer ball";
  return "Direct long ball";
}

export function puckoutLabel(value: number): string {
  if (value < 25) return "Short to the half-backs";
  if (value < 45) return "Mostly short";
  if (value < 60) return "Mixed restarts";
  if (value < 80) return "Mostly long";
  return "Long contest in midfield";
}

export function aggressionLabel(value: number): string {
  if (value < 25) return "Light";
  if (value < 45) return "Mostly light";
  if (value < 60) return "Measured";
  if (value < 80) return "Physical";
  return "Aggressive";
}
