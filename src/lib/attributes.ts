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
  id: "physical" | "iq" | "mentality" | "setPieces" | "team";
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
      "shooting",
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
    id: "team",
    label: "Team",
    keys: ["teamwork"],
  },
  {
    id: "setPieces",
    label: "Set pieces",
    keys: ["frees", "sidelines", "puckoutReach"],
  },
];

export const MENTAL_KEYS: AttributeKey[] = ["workrate", "underPressure", "composure"];

export const PHYSICAL_KEYS: AttributeKey[] = ["speed", "aerialReach", "stamina", "strength", "acceleration"];

export const DEFENSIVE_KEYS: AttributeKey[] = ["hooking", "manMarking", "puckoutReach"];

export const ATTACKING_KEYS: AttributeKey[] = ["shooting", "firstTouch", "strikingDistance", "offTheBall", "frees"];

/**
 * How much an attribute tracks overall for a natural line.
 * 1 = a star in this position should have this near their overall;
 * ~0.2 = a dump stat that stays modest even for elite players.
 */
export const POSITION_ATTRIBUTE_WEIGHTS: Record<PositionLine, Partial<Record<AttributeKey, number>>> = {
  GK: {
    puckoutReach: 1,
    highFielding: 0.95,
    aerialReach: 0.9,
    composure: 0.92,
    underPressure: 0.9,
    firstTouch: 0.78,
    passing: 0.72,
    teamwork: 0.75,
    stamina: 0.7,
    strength: 0.62,
    vision: 0.55,
    workrate: 0.58,
    acceleration: 0.32,
    speed: 0.32,
    hooking: 0.34,
    manMarking: 0.3,
    strikingDistance: 0.35,
    shooting: 0.22,
    offTheBall: 0.22,
    frees: 0.2,
    sidelines: 0.22,
  },
  FB: {
    manMarking: 1,
    hooking: 0.95,
    strength: 0.92,
    aerialReach: 0.88,
    highFielding: 0.85,
    composure: 0.88,
    underPressure: 0.9,
    workrate: 0.82,
    teamwork: 0.85,
    stamina: 0.8,
    firstTouch: 0.72,
    speed: 0.7,
    acceleration: 0.68,
    passing: 0.55,
    vision: 0.42,
    strikingDistance: 0.32,
    shooting: 0.28,
    offTheBall: 0.3,
    frees: 0.28,
    sidelines: 0.28,
    puckoutReach: 0.18,
  },
  HB: {
    stamina: 0.95,
    passing: 0.9,
    aerialReach: 0.85,
    highFielding: 0.88,
    hooking: 0.82,
    manMarking: 0.78,
    firstTouch: 0.82,
    workrate: 0.88,
    teamwork: 0.88,
    underPressure: 0.85,
    speed: 0.8,
    strikingDistance: 0.72,
    vision: 0.75,
    composure: 0.78,
    acceleration: 0.7,
    strength: 0.72,
    shooting: 0.48,
    sidelines: 0.55,
    offTheBall: 0.4,
    frees: 0.38,
    puckoutReach: 0.2,
  },
  MF: {
    stamina: 1,
    workrate: 0.95,
    highFielding: 0.92,
    teamwork: 0.95,
    passing: 0.88,
    speed: 0.85,
    strikingDistance: 0.82,
    aerialReach: 0.82,
    firstTouch: 0.85,
    vision: 0.82,
    underPressure: 0.88,
    composure: 0.82,
    acceleration: 0.75,
    strength: 0.7,
    shooting: 0.58,
    hooking: 0.52,
    offTheBall: 0.55,
    manMarking: 0.38,
    frees: 0.4,
    sidelines: 0.45,
    puckoutReach: 0.18,
  },
  HF: {
    firstTouch: 0.95,
    vision: 0.92,
    passing: 0.9,
    strikingDistance: 0.92,
    shooting: 0.9,
    offTheBall: 0.85,
    composure: 0.88,
    underPressure: 0.85,
    teamwork: 0.85,
    workrate: 0.82,
    frees: 0.78,
    sidelines: 0.72,
    stamina: 0.8,
    speed: 0.82,
    acceleration: 0.8,
    highFielding: 0.62,
    aerialReach: 0.58,
    strength: 0.65,
    hooking: 0.36,
    manMarking: 0.3,
    puckoutReach: 0.18,
  },
  FF: {
    shooting: 1,
    offTheBall: 0.98,
    firstTouch: 0.95,
    composure: 0.92,
    strikingDistance: 0.9,
    frees: 0.82,
    acceleration: 0.88,
    speed: 0.85,
    underPressure: 0.88,
    aerialReach: 0.75,
    workrate: 0.78,
    stamina: 0.72,
    teamwork: 0.75,
    vision: 0.68,
    passing: 0.62,
    highFielding: 0.58,
    strength: 0.68,
    sidelines: 0.42,
    hooking: 0.32,
    manMarking: 0.28,
    puckoutReach: 0.16,
  },
};

/** Attributes at or above this weight drive overall for that line. */
export const OVERALL_WEIGHT_MIN = 0.86;

export function positionWeight(line: PositionLine, key: AttributeKey): number {
  return POSITION_ATTRIBUTE_WEIGHTS[line][key] ?? 0.5;
}

export function isRoleAttribute(line: PositionLine, key: AttributeKey): boolean {
  return positionWeight(line, key) >= OVERALL_WEIGHT_MIN;
}

/**
 * Keep 1–18 roughly linear, then squeeze the tail so 19 is scarce and 20 is rare.
 * Going 18 → 19 is a bigger step than 10 → 11.
 */
export function compressHighEnd(value: number): number {
  if (value <= 18) return value;
  const excess = value - 18;
  return 18 + (2 * excess) / (excess + 3);
}

export const ATTRIBUTE_KEYS: AttributeKey[] = ATTRIBUTE_GROUPS.flatMap((group) => group.keys);

export const ATTRIBUTE_SHORT: Record<AttributeKey, string> = {
  speed: "Spd",
  aerialReach: "Aer",
  stamina: "Sta",
  strength: "Str",
  acceleration: "Acc",
  firstTouch: "1st",
  highFielding: "Fld",
  strikingDistance: "Dst",
  shooting: "Sht",
  vision: "Vis",
  hooking: "Hk",
  passing: "Pas",
  offTheBall: "Off",
  manMarking: "Mrk",
  workrate: "WR",
  underPressure: "Prs",
  composure: "Cmp",
  teamwork: "Tmw",
  frees: "Fr",
  sidelines: "Sid",
  puckoutReach: "Pk",
};

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  speed: "Speed",
  aerialReach: "Aerial reach",
  stamina: "Stamina",
  strength: "Strength / aggression",
  acceleration: "Acceleration",
  firstTouch: "First touch",
  highFielding: "High fielding",
  strikingDistance: "Striking from distance",
  shooting: "Shooting",
  vision: "Vision",
  hooking: "Tackling / hooking",
  passing: "Passing",
  offTheBall: "Off the ball",
  manMarking: "Man marking",
  workrate: "Workrate",
  underPressure: "Ability under pressure",
  composure: "Composure",
  teamwork: "Teamwork",
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
    copy: "Drop a seventh defender, leaving five forwards. The extra man at the back makes a goal a rare look; those forwards cover more ground and lose match fitness faster.",
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
  if (value < 25) return "Short to the full-back line";
  if (value < 45) return "Mostly short";
  if (value < 60) return "Mixed restarts";
  if (value < 80) return "Mostly long to a target";
  return "Long to a midfielder or half-forward";
}

export function aggressionLabel(value: number): string {
  if (value < 25) return "Light";
  if (value < 45) return "Mostly light";
  if (value < 60) return "Measured";
  if (value < 80) return "Physical";
  return "Aggressive";
}

export function pressureLabel(value: number): string {
  if (value < 25) return "Sit off";
  if (value < 45) return "Stand off";
  if (value < 60) return "Standard press";
  if (value < 80) return "Hunt the ball";
  return "All-out press";
}
