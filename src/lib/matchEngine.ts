import type { MatchEvent, Score, SimulatedMatch, Tactics, TeamSheet } from "../types";
import { DEFAULT_TACTICS, defaultSheet, sideStrength } from "./players";

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
  const homeTactics = options.homeTactics ?? DEFAULT_TACTICS;
  const awayTactics = options.awayTactics ?? DEFAULT_TACTICS;
  const home = sideStrength(options.homeId, homeSheet, homeTactics);
  const away = sideStrength(options.awayId, awaySheet, awayTactics);

  let homeScore: Score = { goals: 0, points: 0 };
  let awayScore: Score = { goals: 0, points: 0 };
  const events: MatchEvent[] = [];
  const homeNames = homeSheet.starters;
  const awayNames = awaySheet.starters;

  const pick = (names: string[]) => names[Math.floor(random() * Math.max(names.length, 1))] ?? "a substitute";

  const attackChance = (attack: number, defence: number) =>
    Math.min(0.62, Math.max(0.22, 0.28 + (attack - defence) * 0.028));

  const tryScore = (teamId: string, names: string[], attack: number, style: Tactics["style"], minute: number) => {
    const playerName = pick(names.slice(Math.max(0, names.length - 6)));
    const goalChance = style === "direct" ? 0.16 : 0.1;
    const isGoal = random() < goalChance + (attack - 12) * 0.008;
    if (isGoal) {
      if (random() < 0.28) {
        events.push({
          minute,
          teamId,
          playerName,
          kind: "save",
          text: `Saved — ${playerName}'s goal chance is kept out.`,
        });
        return;
      }
      if (teamId === options.homeId) homeScore = addScore(homeScore, "goal");
      else awayScore = addScore(awayScore, "goal");
      events.push({
        minute,
        teamId,
        playerName,
        kind: "goal",
        text: `GOAL! ${playerName} finds the net.`,
      });
      return;
    }
    if (random() < 0.32) {
      events.push({
        minute,
        teamId,
        playerName,
        kind: "wide",
        text: `Wide from ${playerName}.`,
      });
      return;
    }
    if (teamId === options.homeId) homeScore = addScore(homeScore, "point");
    else awayScore = addScore(awayScore, "point");
    events.push({
      minute,
      teamId,
      playerName,
      kind: "point",
      text: `${playerName} points.`,
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
    if (random() < attackChance(home.attack, away.defence) * 0.85) {
      tryScore(options.homeId, homeNames, home.attack, homeTactics.style, minute);
    }
    if (random() < attackChance(away.attack, home.defence) * 0.8) {
      tryScore(options.awayId, awayNames, away.attack, awayTactics.style, minute);
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
    if (event.kind !== "goal" && event.kind !== "point") continue;
    if (event.teamId === homeId) home = addScore(home, event.kind);
    else away = addScore(away, event.kind);
  }
  return { home, away };
}
