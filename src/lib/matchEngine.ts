import type { MatchEvent, MatchEventKind, Score, SimulatedMatch, Tactics, TeamSheet } from "../types";
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
  seed: number;
}): SimulatedMatch {
  const random = createRng(seedFrom(`${options.seed}:${options.matchId}`));
  const homeSheet = options.homeSheet ?? defaultSheet(options.homeId);
  const awaySheet = options.awaySheet ?? defaultSheet(options.awayId);
  const homeTactics = options.homeTactics ?? clubTactics(options.homeId);
  const awayTactics = options.awayTactics ?? clubTactics(options.awayId);
  const home = sideProfile(options.homeId, homeSheet, homeTactics);
  const away = sideProfile(options.awayId, awaySheet, awayTactics);

  let homeScore: Score = { goals: 0, points: 0 };
  let awayScore: Score = { goals: 0, points: 0 };
  const events: MatchEvent[] = [];
  const homeNames = homeSheet.starters;
  const awayNames = awaySheet.starters;

  const credit = (teamId: string, kind: "point" | "goal") => {
    if (teamId === options.homeId) homeScore = addScore(homeScore, kind);
    else awayScore = addScore(awayScore, kind);
  };

  const attackChance = (attack: number, defence: number) =>
    Math.min(0.58, Math.max(0.2, 0.26 + (attack - defence) * 0.026));

  const attemptSetPiece = (
    teamId: string,
    kind: "free" | "sixtyFive" | "sideline",
    profile: SideProfile,
    minute: number,
  ) => {
    const taker =
      kind === "sideline"
        ? profile.sidelineTaker
        : profile.freeTaker;
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
      events.push({ minute, teamId, playerName, kind, text });
      return;
    }
    events.push({
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
    tactics: Tactics,
    opp: SideProfile,
    oppTactics: Tactics,
    oppNames: string[],
    minute: number,
  ) => {
    if (tactics.puckout === "contest") {
      if (random() < 0.34) {
        const win =
          random() <
          Math.min(0.78, Math.max(0.28, 0.5 + (profile.puckout + profile.aerial - opp.aerial * 1.05 - 12) * 0.03));
        const fielder = pickName(names.slice(4, 9), random);
        if (!win) {
          events.push({
            minute,
            teamId,
            playerName: fielder,
            kind: "puckout",
            text: `Puck-out broken — ${fielder} loses the aerial contest.`,
          });
          return;
        }
        if (random() < 0.45) {
          events.push({
            minute,
            teamId,
            playerName: fielder,
            kind: "puckout",
            text: `${fielder} fields the puck-out around midfield.`,
          });
        }
      }
    } else if (random() < 0.28) {
      const safe = Math.min(0.82, Math.max(0.35, 0.42 + (profile.halfBackHands - 12) * 0.04));
      const halfBack = pickName(names.slice(4, 7), random);
      if (random() > safe) {
        events.push({
          minute,
          teamId,
          playerName: halfBack,
          kind: "puckout",
          text: `Short puck-out turned over on ${halfBack}.`,
        });
        return;
      }
    }

    if (random() < 0.1 + opp.hooking * 0.005) {
      const defender = pickName(oppNames.slice(0, 7), random);
      events.push({
        minute,
        teamId,
        playerName: defender,
        kind: "hook",
        text: `Hooked and blocked — ${defender} kills the attack.`,
      });
      return;
    }

    const deadBallShare = 0.2 + profile.deadBall * 0.012 + (tactics.build === "direct" ? 0.06 : 0);
    if (random() < deadBallShare) {
      const roll = random();
      if (roll < 0.18) attemptSetPiece(teamId, "sixtyFive", profile, minute);
      else if (roll < 0.28) attemptSetPiece(teamId, "sideline", profile, minute);
      else attemptSetPiece(teamId, "free", profile, minute);
      return;
    }

    const playerName = pickForward(profile, names, random);
    const sweeperCut = oppTactics.shape === "sweeper" ? 0.62 : 1;
    const directGoal = tactics.build === "direct" ? 0.17 : 0.09;
    const aerialGoal = tactics.build === "direct" ? (profile.aerial - 12) * 0.006 : 0;
    const goalChance = Math.min(0.28, Math.max(0.05, (directGoal + aerialGoal + (profile.attack - 12) * 0.008) * sweeperCut));

    if (random() < goalChance) {
      if (random() < 0.3 + opp.defence * 0.008) {
        const keeper = opp.keeper?.name ?? "the goalkeeper";
        events.push({
          minute,
          teamId,
          playerName,
          kind: "save",
          text: `Saved — ${keeper} keeps out ${playerName}.`,
        });
        if (random() < 0.35 + (tactics.build === "direct" ? 0.1 : 0)) {
          attemptSetPiece(teamId, "sixtyFive", profile, minute);
        }
        return;
      }
      credit(teamId, "goal");
      events.push({
        minute,
        teamId,
        playerName,
        kind: "goal",
        text: `GOAL! ${playerName} finds the net.`,
      });
      return;
    }

    if (random() < 0.3) {
      events.push({
        minute,
        teamId,
        playerName,
        kind: "wide",
        text: `Wide from ${playerName}.`,
      });
      if (tactics.build === "direct" && random() < 0.22) {
        attemptSetPiece(teamId, "sixtyFive", profile, minute);
      }
      return;
    }

    credit(teamId, "point");
    const fromPlay =
      tactics.build === "running"
        ? `${playerName} points from play, worked through midfield.`
        : `${playerName} points from distance.`;
    events.push({
      minute,
      teamId,
      playerName,
      kind: "point",
      text: fromPlay,
    });
  };

  for (let minute = 1; minute <= 62; minute += 1) {
    if (minute === 31) {
      events.push({
        minute,
        teamId: options.homeId,
        playerName: "",
        kind: "half",
        text: "Half-time whistle.",
      });
    }
    if (random() < attackChance(home.attack, away.defence) * 0.86) {
      tryScore(options.homeId, homeNames, home, homeTactics, away, awayTactics, awayNames, minute);
    }
    if (random() < attackChance(away.attack, home.defence) * 0.81) {
      tryScore(options.awayId, awayNames, away, awayTactics, home, homeTactics, homeNames, minute);
    }
  }

  events.push({
    minute: 62,
    teamId: options.homeId,
    playerName: "",
    kind: "full",
    text: "Full-time.",
  });

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
