import type {
  MatchEvent,
  MatchEventKind,
  PlayerCondition,
  Score,
  SimulatedMatch,
  Tactics,
  TeamSheet,
} from "../types";
import { clampDial } from "./attributes";
import { clubTactics, defaultSheet, sideProfile, type SideProfile } from "./players";

const POINT_KINDS: ReadonlySet<MatchEventKind> = new Set(["point", "free", "sixtyFive", "sideline"]);

export function createRng(seed: number): () => number {
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

function addScore(score: Score, kind: "point" | "goal"): Score {
  if (kind === "goal") return { goals: score.goals + 1, points: score.points };
  return { goals: score.goals, points: score.points + 1 };
}

export function scoreKindOf(kind: MatchEventKind): "goal" | "point" | null {
  if (kind === "goal") return "goal";
  if (POINT_KINDS.has(kind)) return "point";
  return null;
}

export function freeConversionChance(frees: number, composure: number, underPressure: number): number {
  return Math.min(0.94, Math.max(0.28, 0.2 + frees * 0.032 + composure * 0.008 + underPressure * 0.004));
}

export function sixtyFiveChance(frees: number, strikingDistance: number, composure: number): number {
  return Math.min(0.86, Math.max(0.18, 0.1 + frees * 0.028 + strikingDistance * 0.01 + composure * 0.006));
}

export function sidelineChance(sidelines: number, strikingDistance: number): number {
  return Math.min(0.72, Math.max(0.1, 0.06 + sidelines * 0.028 + strikingDistance * 0.008));
}

export function tackleChance(hooking: number, aggression: number): number {
  const physical = clampDial(aggression) / 100;
  return Math.min(0.36, Math.max(0.06, 0.08 + hooking * 0.005 + physical * 0.09));
}

export function mistimedFoulChance(aggression: number): number {
  return Math.min(0.32, Math.max(0.03, 0.035 + (clampDial(aggression) / 100) * 0.22));
}

export function yellowOnFoulChance(aggression: number): number {
  return Math.min(0.4, Math.max(0.02, 0.04 + (clampDial(aggression) / 100) * 0.3));
}

export function nextMomentum(
  current: number,
  event: Pick<MatchEvent, "kind" | "teamId" | "text">,
  homeId: string,
): number {
  const towardHome = event.teamId === homeId ? 1 : -1;
  let delta = 0;
  switch (event.kind) {
    case "goal":
      delta = 18;
      break;
    case "point":
    case "free":
    case "sixtyFive":
    case "sideline":
      delta = 8;
      break;
    case "save":
    case "hook":
      delta = -5;
      break;
    case "booking":
      delta = -7;
      break;
    case "wide":
      delta = -3;
      break;
    case "puckout":
      delta = /broken|turned over/i.test(event.text) ? -6 : 4;
      break;
    default:
      delta = 0;
  }
  const drifted = current + (50 - current) * 0.05 + towardHome * delta;
  return Math.max(4, Math.min(96, Math.round(drifted)));
}

function pickForward(profile: SideProfile, names: string[], random: () => number): string {
  const named = profile.freeTaker?.name;
  if (named && random() < 0.22) return named;
  const pool = names.slice(Math.max(0, names.length - 8));
  return pool[Math.floor(random() * Math.max(pool.length, 1))] ?? named ?? "a substitute";
}

function pickName(names: string[], random: () => number): string {
  return names[Math.floor(random() * Math.max(names.length, 1))] ?? "a substitute";
}

export function simulateMatch(options: {
  matchId: string;
  homeId: string;
  awayId: string;
  homeSheet?: TeamSheet;
  awaySheet?: TeamSheet;
  homeTactics?: Tactics;
  awayTactics?: Tactics;
  homeCondition?: Record<string, PlayerCondition>;
  awayCondition?: Record<string, PlayerCondition>;
  period?: "first" | "second" | "full";
  startHome?: Score;
  startAway?: Score;
  startMomentum?: number;
  seed: number;
}): SimulatedMatch {
  const period = options.period ?? "full";
  const seedKey = period === "second" ? `${options.seed}:${options.matchId}:second` : `${options.seed}:${options.matchId}`;
  const random = createRng(seedFrom(seedKey));
  const homeSheet = options.homeSheet ?? defaultSheet(options.homeId);
  const awaySheet = options.awaySheet ?? defaultSheet(options.awayId);
  const homeTactics = options.homeTactics ?? clubTactics(options.homeId);
  const awayTactics = options.awayTactics ?? clubTactics(options.awayId);
  const home = sideProfile(options.homeId, homeSheet, homeTactics, options.homeCondition);
  const away = sideProfile(options.awayId, awaySheet, awayTactics, options.awayCondition);
  const homeDirect = clampDial(homeTactics.build) / 100;
  const awayDirect = clampDial(awayTactics.build) / 100;
  const homeLongPuck = clampDial(homeTactics.puckout) / 100;
  const awayLongPuck = clampDial(awayTactics.puckout) / 100;

  let homeScore: Score = options.startHome ?? { goals: 0, points: 0 };
  let awayScore: Score = options.startAway ?? { goals: 0, points: 0 };
  let momentum = options.startMomentum ?? 50;
  const events: MatchEvent[] = [];
  const homeNames = homeSheet.starters;
  const awayNames = awaySheet.starters;

  const push = (event: Omit<MatchEvent, "momentum">) => {
    momentum = nextMomentum(momentum, event, options.homeId);
    events.push({ ...event, momentum });
  };

  const credit = (teamId: string, kind: "point" | "goal") => {
    if (teamId === options.homeId) homeScore = addScore(homeScore, kind);
    else awayScore = addScore(awayScore, kind);
  };

  const attackChance = (attack: number, defence: number, toward: number) =>
    Math.min(0.6, Math.max(0.18, 0.26 + (attack - defence) * 0.026 + toward * 0.06));

  const attemptSetPiece = (
    teamId: string,
    kind: "free" | "sixtyFive" | "sideline",
    profile: SideProfile,
    minute: number,
  ) => {
    const taker = kind === "sideline" ? profile.sidelineTaker : profile.freeTaker;
    const playerName = taker?.name ?? pickName(teamId === options.homeId ? homeNames : awayNames, random);
    const chance =
      kind === "free"
        ? freeConversionChance(
            taker?.ratings.frees ?? 11,
            taker?.ratings.composure ?? 11,
            taker?.ratings.underPressure ?? 11,
          )
        : kind === "sixtyFive"
          ? sixtyFiveChance(
              taker?.ratings.frees ?? 11,
              taker?.ratings.strikingDistance ?? 11,
              taker?.ratings.composure ?? 11,
            )
          : sidelineChance(taker?.ratings.sidelines ?? 11, taker?.ratings.strikingDistance ?? 11);

    if (random() < chance) {
      credit(teamId, "point");
      const text =
        kind === "free"
          ? `${playerName} points from a free.`
          : kind === "sixtyFive"
            ? `65 — ${playerName} splits the posts.`
            : `Sideline cut from ${playerName}.`;
      push({ minute, teamId, playerName, kind, text });
      return;
    }
    push({
      minute,
      teamId,
      playerName,
      kind: "wide",
      text:
        kind === "free"
          ? `Free out wide from ${playerName}.`
          : kind === "sixtyFive"
            ? `${playerName}'s 65 drops short.`
            : `${playerName}'s sideline drifts wide.`,
    });
  };

  const tryScore = (
    teamId: string,
    names: string[],
    profile: SideProfile,
    opp: SideProfile,
    oppTactics: Tactics,
    oppNames: string[],
    minute: number,
    direct: number,
    longPuck: number,
  ) => {
    if (random() < 0.16 + longPuck * 0.28) {
      const win =
        random() <
        Math.min(0.78, Math.max(0.28, 0.5 + (profile.puckout + profile.aerial - opp.aerial * 1.05 - 12) * 0.03));
      const fielder = pickName(names.slice(4, 9), random);
      if (!win) {
        push({
          minute,
          teamId,
          playerName: fielder,
          kind: "puckout",
          text: `Puck-out broken — ${fielder} loses the aerial contest.`,
        });
        return;
      }
      if (random() < 0.45) {
        push({
          minute,
          teamId,
          playerName: fielder,
          kind: "puckout",
          text: `${fielder} fields the puck-out around midfield.`,
        });
      }
    } else if (random() < 0.12 + (1 - longPuck) * 0.28) {
      const safe = Math.min(0.82, Math.max(0.35, 0.42 + (profile.halfBackHands - 12) * 0.04));
      const halfBack = pickName(names.slice(4, 7), random);
      if (random() > safe) {
        push({
          minute,
          teamId,
          playerName: halfBack,
          kind: "puckout",
          text: `Short puck-out turned over on ${halfBack}.`,
        });
        return;
      }
    }

    if (random() < tackleChance(opp.hooking, oppTactics.aggression ?? 46)) {
      const defender = pickName(oppNames.slice(0, 7), random);
      push({
        minute,
        teamId,
        playerName: defender,
        kind: "hook",
        text: `Hooked and blocked — ${defender} kills the attack.`,
      });
      return;
    }

    if (random() < mistimedFoulChance(oppTactics.aggression ?? 46)) {
      const defender = pickName(oppNames.slice(0, 7), random);
      const defendingId = teamId === options.homeId ? options.awayId : options.homeId;
      if (random() < yellowOnFoulChance(oppTactics.aggression ?? 46)) {
        push({
          minute,
          teamId: defendingId,
          playerName: defender,
          kind: "booking",
          text: `Yellow card — ${defender} overcooks the challenge.`,
        });
      }
      attemptSetPiece(teamId, "free", profile, minute);
      return;
    }

    const deadBallShare = 0.2 + profile.deadBall * 0.012 + direct * 0.06;
    if (random() < deadBallShare) {
      const roll = random();
      if (roll < 0.18) attemptSetPiece(teamId, "sixtyFive", profile, minute);
      else if (roll < 0.28) attemptSetPiece(teamId, "sideline", profile, minute);
      else attemptSetPiece(teamId, "free", profile, minute);
      return;
    }

    const playerName = pickForward(profile, names, random);
    const sweeperCut = oppTactics.shape === "sweeper" ? 0.62 : 1;
    const directGoal = 0.09 + direct * 0.09;
    const aerialGoal = direct * (profile.aerial - 12) * 0.006;
    const goalChance = Math.min(
      0.28,
      Math.max(0.05, (directGoal + aerialGoal + (profile.attack - 12) * 0.008) * sweeperCut),
    );

    if (random() < goalChance) {
      if (random() < 0.3 + opp.defence * 0.008) {
        const keeper = opp.keeper?.name ?? "the goalkeeper";
        push({
          minute,
          teamId,
          playerName,
          kind: "save",
          text: `Saved — ${keeper} keeps out ${playerName}.`,
        });
        if (random() < 0.35 + direct * 0.1) {
          attemptSetPiece(teamId, "sixtyFive", profile, minute);
        }
        return;
      }
      credit(teamId, "goal");
      push({
        minute,
        teamId,
        playerName,
        kind: "goal",
        text: `GOAL! ${playerName} finds the net.`,
      });
      return;
    }

    if (random() < 0.3) {
      push({
        minute,
        teamId,
        playerName,
        kind: "wide",
        text: `Wide from ${playerName}.`,
      });
      if (direct > 0.55 && random() < 0.12 + direct * 0.12) {
        attemptSetPiece(teamId, "sixtyFive", profile, minute);
      }
      return;
    }

    credit(teamId, "point");
    const fromPlay =
      direct < 0.45
        ? `${playerName} points from play, worked through midfield.`
        : `${playerName} points from distance.`;
    push({
      minute,
      teamId,
      playerName,
      kind: "point",
      text: fromPlay,
    });
  };

  const startMinute = period === "second" ? 32 : 1;
  const endMinute = period === "first" ? 31 : 62;

  for (let minute = startMinute; minute <= endMinute; minute += 1) {
    if (period !== "second" && minute === 31) {
      push({
        minute,
        teamId: options.homeId,
        playerName: "",
        kind: "half",
        text: "Half-time whistle.",
      });
      if (period === "first") break;
      continue;
    }
    const tilt = (momentum - 50) / 50;
    if (random() < attackChance(home.attack, away.defence, tilt) * 0.86) {
      tryScore(
        options.homeId,
        homeNames,
        home,
        away,
        awayTactics,
        awayNames,
        minute,
        homeDirect,
        homeLongPuck,
      );
    }
    if (random() < attackChance(away.attack, home.defence, -tilt) * 0.81) {
      tryScore(
        options.awayId,
        awayNames,
        away,
        home,
        homeTactics,
        homeNames,
        minute,
        awayDirect,
        awayLongPuck,
      );
    }
  }

  if (period !== "first") {
    push({
      minute: 62,
      teamId: options.homeId,
      playerName: "",
      kind: "full",
      text: "Full-time.",
    });
  }

  return { matchId: options.matchId, homeScore, awayScore, events };
}

export function scoreFromEvents(
  events: MatchEvent[],
  homeId: string,
  upTo = events.length,
): { home: Score; away: Score } {
  let home: Score = { goals: 0, points: 0 };
  let away: Score = { goals: 0, points: 0 };
  for (const event of events.slice(0, upTo)) {
    const kind = scoreKindOf(event.kind);
    if (!kind) continue;
    if (event.teamId === homeId) home = addScore(home, kind);
    else away = addScore(away, kind);
  }
  return { home, away };
}

export function momentumAt(events: MatchEvent[], upTo = events.length): number {
  const slice = events.slice(0, upTo);
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const value = slice[i]?.momentum;
    if (typeof value === "number") return value;
  }
  return 50;
}
