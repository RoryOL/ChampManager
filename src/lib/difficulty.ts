import type {
  Difficulty,
  MatchReport,
  PlayerCondition,
  RatedPlayer,
  Tactics,
} from "../types";
import { ATTRIBUTE_KEYS } from "./attributes";
import { clampDial } from "./attributes";
import { clampStat } from "./players";
import { clampBoost, defaultCondition } from "./training";

export type { Difficulty };

export const DIFFICULTY_OPTIONS: {
  value: Difficulty;
  title: string;
  subtitle: string;
  copy: string;
}[] = [
  {
    value: "junior",
    title: "Junior",
    subtitle: "Easy",
    copy: "Your panel gets a lift on championship days. The other managers keep a simple shape and rarely change it.",
  },
  {
    value: "intermediate",
    title: "Intermediate",
    subtitle: "Medium",
    copy: "A smaller lift. Computer managers tweak a little for the opposition and only chase the game if they are well behind.",
  },
  {
    value: "senior",
    title: "Senior",
    subtitle: "Difficult",
    copy: "No helping hand. The other managers pick a fifteen and a plan for each match, and they will change at half-time.",
  },
  {
    value: "intercounty",
    title: "Intercounty",
    subtitle: "Very difficult",
    copy: "No lift. They read previous days, injuries and strengths, then review the first half and chase the match.",
  },
];

export const DEFAULT_DIFFICULTY: Difficulty = "intermediate";
export const LEGACY_DIFFICULTY: Difficulty = "senior";

export const WELCOME_STORAGE_KEY = "champ-manager:canon-welcome";

export function migrateDifficulty(raw: unknown): Difficulty {
  return DIFFICULTY_OPTIONS.some((option) => option.value === raw) ? (raw as Difficulty) : LEGACY_DIFFICULTY;
}

export function difficultyTitle(difficulty: Difficulty): string {
  return DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.title ?? "Senior";
}

export function difficultyCopy(difficulty: Difficulty): string {
  return DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.copy ?? "";
}

/** Extra match-stat lift for the human manager's panel. Senior and intercounty are 0. */
export function performanceLift(difficulty: Difficulty): number {
  if (difficulty === "junior") return 2;
  if (difficulty === "intermediate") return 1;
  return 0;
}

/** How far a computer manager moves off their club personality toward a match-specific plan. */
export function cpuAdaptWeight(difficulty: Difficulty): number {
  if (difficulty === "junior") return 0;
  if (difficulty === "intermediate") return 0.4;
  return 1;
}

export function cpuReadsHistory(difficulty: Difficulty): boolean {
  return difficulty === "intercounty";
}

export type CpuHalfSkill = "none" | "late" | "full" | "scout";

export function cpuHalfTimeSkill(difficulty: Difficulty): CpuHalfSkill {
  if (difficulty === "junior") return "none";
  if (difficulty === "intermediate") return "late";
  if (difficulty === "intercounty") return "scout";
  return "full";
}

export function blendTactics(base: Tactics, adapted: Tactics, weight: number): Tactics {
  const t = Math.max(0, Math.min(1, weight));
  if (t <= 0) return { ...base };
  if (t >= 1) return { ...adapted };
  const mix = (from: number, to: number) => clampDial(from + (to - from) * t);
  return {
    mentality: t >= 0.5 ? adapted.mentality : base.mentality,
    shape: t >= 0.5 ? adapted.shape : base.shape,
    build: mix(base.build, adapted.build),
    puckout: mix(base.puckout, adapted.puckout),
    aggression: mix(base.aggression, adapted.aggression),
    pressure: mix(base.pressure, adapted.pressure),
    shooting: mix(base.shooting, adapted.shooting),
    longFreeTaker: t >= 0.5 ? adapted.longFreeTaker : base.longFreeTaker,
    shortFreeTaker: t >= 0.5 ? adapted.shortFreeTaker : base.shortFreeTaker,
    sidelineTaker: t >= 0.5 ? adapted.sidelineTaker : base.sidelineTaker,
    puckoutTarget: t >= 0.5 ? adapted.puckoutTarget : base.puckoutTarget,
  };
}

export function applyPerformanceLift(
  condition: Record<string, PlayerCondition> | undefined,
  names: string[],
  amount: number,
): Record<string, PlayerCondition> | undefined {
  if (amount <= 0) return condition;
  const next: Record<string, PlayerCondition> = { ...(condition ?? {}) };
  for (const name of names) {
    const current = next[name] ?? defaultCondition();
    const boosts = { ...(current.boosts ?? {}) };
    for (const key of ATTRIBUTE_KEYS) {
      boosts[key] = clampBoost((boosts[key] ?? 0) + amount);
    }
    next[name] = { ...current, boosts };
  }
  return next;
}

export function liftSquadRatings(squad: RatedPlayer[], amount: number): RatedPlayer[] {
  if (amount <= 0) return squad;
  return squad.map((player) => {
    const ratings = { ...player.ratings };
    for (const key of ATTRIBUTE_KEYS) {
      ratings[key] = clampStat(player.ratings[key] + amount);
    }
    ratings.overall = clampStat(player.ratings.overall + amount);
    return { ...player, ratings };
  });
}

export function performanceBoostFor(
  difficulty: Difficulty,
  clubIds: string[],
): { clubIds: string[]; amount: number } | undefined {
  const amount = performanceLift(difficulty);
  if (amount <= 0 || clubIds.length === 0) return undefined;
  return { clubIds, amount };
}

export function cpuDifficulty(raw?: Difficulty): Difficulty {
  return raw ?? LEGACY_DIFFICULTY;
}

export function inferOpponentTactics(
  reports: Record<string, MatchReport>,
  opponentId: string,
  vsClubId?: string,
): Tactics | undefined {
  const rows = Object.values(reports).filter((report) => report.homeId === opponentId || report.awayId === opponentId);
  if (rows.length === 0) return undefined;
  const vs = vsClubId
    ? rows.filter((report) => report.homeId === vsClubId || report.awayId === vsClubId)
    : [];
  const chosen = (vs.length > 0 ? vs : rows).at(-1);
  if (!chosen) return undefined;
  return chosen.homeId === opponentId ? chosen.homeTactics : chosen.awayTactics;
}

export function assumedOpponentTactics(
  difficulty: Difficulty,
  live: Tactics | undefined,
  inferred: Tactics | undefined,
  personality: Tactics,
): Tactics {
  if (cpuReadsHistory(difficulty)) {
    return inferred ?? personality;
  }
  return live ?? personality;
}
