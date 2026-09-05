import type { PlayerCondition, RatedPlayer, TrainingFocus } from "../types";
import { ratedSquad } from "./players";

export const PRESEASON_WEEKS = 6;

export const PRESEASON_DATES = [
  "2026-06-12",
  "2026-06-19",
  "2026-06-26",
  "2026-07-03",
  "2026-07-10",
  "2026-07-17",
];

export const TRAINING_OPTIONS: {
  value: TrainingFocus;
  title: string;
  copy: string;
}[] = [
  {
    value: "fitness",
    title: "Fitness",
    copy: "Miles on the legs. Raises sharpness, but fatigue climbs fast.",
  },
  {
    value: "skills",
    title: "Skills",
    copy: "First touch, striking and support running in tight grids.",
  },
  {
    value: "setpieces",
    title: "Set pieces",
    copy: "Frees, 65s, sidelines and puck-out work. Useful, not a full session.",
  },
  {
    value: "challenge",
    title: "Challenge game",
    copy: "Internal match intensity. Biggest sharpness gain, heaviest legs.",
  },
  {
    value: "recovery",
    title: "Recovery",
    copy: "Pool, stretch, and off the grass. Cuts fatigue; sharpness holds.",
  },
];

export function defaultCondition(): PlayerCondition {
  return { fatigue: 16, sharpness: 38 };
};

export function midSeasonCondition(): PlayerCondition {
  return { fatigue: 28, sharpness: 58 };
};

export function clampCondition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ensureCondition(
  names: string[],
  current: Record<string, PlayerCondition>,
  fallback: PlayerCondition = defaultCondition(),
): Record<string, PlayerCondition> {
  const next = { ...current };
  for (const name of names) {
    next[name] ??= { ...fallback };
  }
  return next;
}

export function squadNames(teamId: string): string[] {
  return ratedSquad(teamId).map((player) => player.name);
}

export function conditionFor(name: string, map: Record<string, PlayerCondition>): PlayerCondition {
  return map[name] ?? defaultCondition();
}

export function freshnessFactor(condition: PlayerCondition): number {
  const tired = condition.fatigue / 100;
  const sharp = condition.sharpness / 100;
  const overtrained = condition.fatigue > 78 ? 0.12 : condition.fatigue > 62 ? 0.05 : 0;
  return Math.max(0.62, 0.78 + sharp * 0.22 - tired * 0.28 - overtrained);
}

export function isOvertrained(condition: PlayerCondition): boolean {
  return condition.fatigue >= 78;
}

export function applyTraining(
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition>,
  focus: TrainingFocus,
): { condition: Record<string, PlayerCondition>; overtrained: string[]; summary: string } {
  const next = { ...condition };
  const overtrained: string[] = [];

  for (const player of squad) {
    const current = { ...(next[player.name] ?? defaultCondition()) };
    const alreadyHeavy = current.fatigue >= 64;
    let fatigue = current.fatigue;
    let sharpness = current.sharpness;

    switch (focus) {
      case "fitness":
        fatigue += alreadyHeavy ? 22 : 15;
        sharpness += alreadyHeavy ? -3 : 7;
        break;
      case "skills":
        fatigue += alreadyHeavy ? 16 : 10;
        sharpness += alreadyHeavy ? 1 : 6;
        break;
      case "setpieces":
        fatigue += alreadyHeavy ? 12 : 8;
        sharpness += alreadyHeavy ? 1 : 5;
        break;
      case "challenge":
        fatigue += alreadyHeavy ? 26 : 18;
        sharpness += alreadyHeavy ? -2 : 9;
        break;
      case "recovery":
        fatigue -= 24;
        sharpness += 1;
        break;
      default:
        break;
    }

    fatigue = clampCondition(fatigue);
    sharpness = clampCondition(sharpness);
    if (fatigue >= 78) {
      sharpness = clampCondition(sharpness - 6);
      overtrained.push(player.name);
    }
    next[player.name] = { fatigue, sharpness };
  }

  const label = TRAINING_OPTIONS.find((item) => item.value === focus)?.title ?? focus;
  const summary =
    overtrained.length > 0
      ? `${label} is done, but ${overtrained.length} player${overtrained.length === 1 ? " is" : "s are"} overtrained. Back off or they will look heavy in championship.`
      : focus === "recovery"
        ? "Recovery week lands. Legs are fresher for the next session."
        : `${label} session is in the book. The panel is a bit sharper, and a bit more tired.`;

  return { condition: next, overtrained, summary };
}

export function applyMatchFatigue(
  condition: Record<string, PlayerCondition>,
  starters: string[],
  subs: string[],
): Record<string, PlayerCondition> {
  const next = { ...condition };
  const bump = (name: string, fatigueAdd: number, sharpAdd: number) => {
    const current = { ...(next[name] ?? defaultCondition()) };
    next[name] = {
      fatigue: clampCondition(current.fatigue + fatigueAdd - 6),
      sharpness: clampCondition(current.sharpness + sharpAdd),
    };
  };
  for (const name of starters) bump(name, 14, 3);
  for (const name of subs) bump(name, 6, 1);
  return next;
}

export function averageFatigue(condition: Record<string, PlayerCondition>, names: string[]): number {
  if (names.length === 0) return 0;
  const total = names.reduce((sum, name) => sum + (condition[name]?.fatigue ?? 0), 0);
  return Math.round(total / names.length);
}
