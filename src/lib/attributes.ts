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
  { value: "contain", title: "Contain", copy: "Sit in, foul less in the scoring zone, and play for the next ball." },
  { value: "balanced", title: "Balanced", copy: "Standard championship shape — contest both ends." },
  { value: "attacking", title: "Attacking", copy: "Push up, leave space behind, and hunt a score from every possession." },
];

export const BUILD_OPTIONS: { value: Tactics["build"]; title: string; copy: string }[] = [
  {
    value: "direct",
    title: "Direct long ball",
    copy: "Go long early. Aerials, striking from distance, goals and 65s decide it.",
  },
  {
    value: "running",
    title: "Running through midfield",
    copy: "Carry and support through the middle. First touch, passing and off-the-ball running.",
  },
];

export const PUCKOUT_OPTIONS: { value: Tactics["puckout"]; title: string; copy: string }[] = [
  {
    value: "contest",
    title: "Contest the middle",
    copy: "Launch on the midfielders. Puck-out reach and high fielding win primary possession.",
  },
  {
    value: "short",
    title: "Short to the half-backs",
    copy: "Work it short. Half-back first touch and passing keep the sliotar; fewer long scores.",
  },
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
