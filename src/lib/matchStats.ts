import type {
  MatchEvent,
  MatchReport,
  PlayerCondition,
  PlayerMatchStats,
  SimulatedMatch,
  StatCredit,
  Tactics,
  TeamMatchStats,
  TeamSheet,
} from "../types";
import { XV_SLOTS, type AttributeKey } from "./attributes";
import { buildCoachReport } from "./coach";
import { ratedSquad } from "./players";
import { conditionFor, fitnessOf, matchFatigueDelta, matchRatings } from "./training";

const STAT_FIELDS = [
  "possessions",
  "passesAttempted",
  "passesCompleted",
  "shots",
  "scores",
  "highFieldingAttempted",
  "highFieldingWon",
  "puckoutsWon",
  "tacklesAttempted",
  "tacklesWon",
  "minutes",
] as const;

function emptyPlayer(name: string, teamId: string, started: boolean): PlayerMatchStats {
  return {
    name,
    teamId,
    started,
    minutes: 0,
    possessions: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    shots: 0,
    scores: 0,
    highFieldingAttempted: 0,
    highFieldingWon: 0,
    puckoutsWon: 0,
    tacklesAttempted: 0,
    tacklesWon: 0,
    groundCovered: 0,
    fatigue: 0,
    fitness: 100,
    overall: 0,
    rating: 6,
    mood: 58,
  };
}

function applyCredit(row: PlayerMatchStats, credit: StatCredit): void {
  for (const field of STAT_FIELDS) {
    row[field] += credit[field] ?? 0;
  }
}

export function rosterNames(sheet: TeamSheet): string[] {
  return [...sheet.starters, ...sheet.subs];
}

export function emptyTeamStats(teamId: string): TeamMatchStats {
  return {
    teamId,
    possessions: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    shots: 0,
    scores: 0,
    highFieldingAttempted: 0,
    highFieldingWon: 0,
    puckoutsWon: 0,
    tacklesAttempted: 0,
    tacklesWon: 0,
    groundCovered: 0,
    fatigue: 0,
    fitness: 100,
    overall: 0,
    rating: 0,
  };
}

export function sumTeamStats(teamId: string, players: PlayerMatchStats[], sequences = 0): TeamMatchStats {
  const rows = players.filter((player) => player.teamId === teamId);
  const stats = emptyTeamStats(teamId);
  stats.possessions = sequences;
  for (const row of rows) {
    stats.passesAttempted += row.passesAttempted;
    stats.passesCompleted += row.passesCompleted;
    stats.shots += row.shots;
    stats.scores += row.scores;
    stats.highFieldingAttempted += row.highFieldingAttempted;
    stats.highFieldingWon += row.highFieldingWon;
    stats.puckoutsWon += row.puckoutsWon;
    stats.tacklesAttempted += row.tacklesAttempted;
    stats.tacklesWon += row.tacklesWon;
    stats.groundCovered += row.groundCovered;
  }
  stats.groundCovered = Math.round(stats.groundCovered * 10) / 10;
  if (rows.length > 0) {
    stats.fatigue = Math.round(rows.reduce((sum, row) => sum + row.fatigue, 0) / rows.length);
    stats.fitness = Math.round(rows.reduce((sum, row) => sum + row.fitness, 0) / rows.length);
    stats.overall = Math.round((rows.reduce((sum, row) => sum + row.overall, 0) / rows.length) * 10) / 10;
    stats.rating = Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10;
  }
  return stats;
}

export function passChain(
  names: string[],
  teamId: string,
  random: () => number,
  hops: number,
  carrier: string,
  completeChance = 0.72,
): { credits: StatCredit[]; carrier: string; retained: boolean } {
  const credits: StatCredit[] = [];
  let onBall = carrier;
  const pool = names.length > 0 ? names : [carrier];
  for (let i = 0; i < hops; i += 1) {
    const target = pool[Math.floor(random() * pool.length)] ?? onBall;
    const completed = random() < completeChance;
    credits.push({
      name: onBall,
      teamId,
      passesAttempted: 1,
      passesCompleted: completed ? 1 : 0,
    });
    if (!completed) {
      return { credits, carrier: onBall, retained: false };
    }
    if (target && target !== onBall) {
      credits.push({ name: target, teamId, possessions: 1 });
      onBall = target;
    }
  }
  return { credits, carrier: onBall, retained: true };
}

export function deliverTo(
  teamId: string,
  carrier: string,
  target: string,
): StatCredit[] {
  if (!target || target === carrier) return [];
  return [
    { name: carrier, teamId, passesAttempted: 1, passesCompleted: 1 },
    { name: target, teamId, possessions: 1 },
  ];
}

export function mergeCredits(credits: StatCredit[]): StatCredit[] {
  const byKey = new Map<string, StatCredit>();
  for (const credit of credits) {
    const key = `${credit.teamId}:${credit.name}`;
    const current = byKey.get(key) ?? { name: credit.name, teamId: credit.teamId };
    for (const field of STAT_FIELDS) {
      const value = (current[field] ?? 0) + (credit[field] ?? 0);
      if (value) current[field] = value;
    }
    current.sequences = (current.sequences ?? 0) + (credit.sequences ?? 0);
    if (!current.sequences) delete current.sequences;
    byKey.set(key, current);
  }
  return [...byKey.values()];
}

function matchRating(row: PlayerMatchStats): number {
  const passRate = row.passesAttempted > 0 ? row.passesCompleted / row.passesAttempted : 0.7;
  const tackleRate = row.tacklesAttempted > 0 ? row.tacklesWon / row.tacklesAttempted : 0.5;
  const shotRate = row.shots > 0 ? row.scores / row.shots : 0.4;
  const raw =
    5.4 +
    row.scores * 0.55 +
    row.puckoutsWon * 0.12 +
    row.highFieldingWon * 0.1 +
    (passRate - 0.65) * 2.2 +
    (tackleRate - 0.45) * 1.6 +
    (shotRate - 0.4) * 1.4 +
    Math.min(row.possessions, 12) * 0.04 -
    Math.max(0, row.shots - row.scores) * 0.12;
  return Math.max(1, Math.min(10, Math.round(raw * 10) / 10));
}

export function statsFromEvents(
  events: MatchEvent[],
  options: {
    homeId: string;
    awayId: string;
    homeSheet: TeamSheet;
    awaySheet: TeamSheet;
    homeCondition?: Record<string, PlayerCondition>;
    awayCondition?: Record<string, PlayerCondition>;
    homeTactics?: Tactics;
    awayTactics?: Tactics;
    upTo?: number;
  },
): { players: PlayerMatchStats[]; homeStats: TeamMatchStats; awayStats: TeamMatchStats } {
  const rows = new Map<string, PlayerMatchStats>();
  const seed = (teamId: string, sheet: TeamSheet) => {
    for (const name of sheet.starters) {
      rows.set(`${teamId}:${name}`, emptyPlayer(name, teamId, true));
    }
    for (const name of sheet.subs) {
      rows.set(`${teamId}:${name}`, emptyPlayer(name, teamId, false));
    }
  };
  seed(options.homeId, options.homeSheet);
  seed(options.awayId, options.awaySheet);

  const sequences = { [options.homeId]: 0, [options.awayId]: 0 };
  const slice = events.slice(0, options.upTo ?? events.length);
  for (const event of slice) {
    for (const credit of event.credits ?? []) {
      const key = `${credit.teamId}:${credit.name}`;
      const row = rows.get(key) ?? emptyPlayer(credit.name, credit.teamId, false);
      applyCredit(row, credit);
      rows.set(key, row);
      if (credit.sequences) {
        sequences[credit.teamId] = (sequences[credit.teamId] ?? 0) + credit.sequences;
      }
    }
  }

  const homeSquad = ratedSquad(options.homeId);
  const awaySquad = ratedSquad(options.awayId);
  const byName = new Map(
    [...homeSquad.map((player) => [player.name, { player, teamId: options.homeId }] as const),
     ...awaySquad.map((player) => [player.name, { player, teamId: options.awayId }] as const)],
  );

  const slotOf = (teamId: string, name: string) => {
    const sheet = teamId === options.homeId ? options.homeSheet : options.awaySheet;
    const index = sheet.starters.indexOf(name);
    return index >= 0 ? (XV_SLOTS[index] ?? "MF") : "MF";
  };

  const players = [...rows.values()].map((row) => {
    const found = byName.get(row.name);
    const condition =
      row.teamId === options.homeId
        ? conditionFor(row.name, options.homeCondition ?? {})
        : conditionFor(row.name, options.awayCondition ?? {});
    const tactics = row.teamId === options.homeId ? options.homeTactics : options.awayTactics;
    const overall = found ? matchRatings(found.player, condition).overall : 12;
    const workrate = found ? found.player.ratings.workrate : 12;
    const minutes = Math.max(row.minutes, row.started ? 1 : 0);
    const position = found?.player.position ?? slotOf(row.teamId, row.name);
    const drain = matchFatigueDelta(minutes, tactics, position, row.started, found?.player.age);
    const fatigue = Math.max(0, Math.min(100, condition.fatigue + drain));
    const groundCovered = Math.round(minutes * (0.072 + workrate * 0.0032) * 10) / 10;
    return {
      ...row,
      minutes,
      groundCovered,
      fatigue,
      fitness: Math.max(0, Math.min(100, 100 - fatigue)),
      overall,
      rating: matchRating({ ...row, minutes }),
      mood: condition.mood ?? 58,
    };
  });

  players.sort((a, b) => Number(b.started) - Number(a.started) || b.rating - a.rating);
  return {
    players,
    homeStats: sumTeamStats(options.homeId, players, sequences[options.homeId] ?? 0),
    awayStats: sumTeamStats(options.awayId, players, sequences[options.awayId] ?? 0),
  };
}

export function reportFromSim(sim: SimulatedMatch): MatchReport {
  return {
    matchId: sim.matchId,
    homeId: sim.homeId,
    awayId: sim.awayId,
    homeScore: sim.homeScore,
    awayScore: sim.awayScore,
    homeTactics: sim.homeTactics,
    awayTactics: sim.awayTactics,
    homeSheet: sim.homeSheet,
    awaySheet: sim.awaySheet,
    homeStats: sim.homeStats,
    awayStats: sim.awayStats,
    players: sim.players,
    coachReport: sim.coachReport,
    climate: sim.climate,
    shots: sim.shots,
  };
}

export function seasonStatsFor(
  reports: Record<string, MatchReport>,
  teamId: string,
  name: string,
): PlayerMatchStats {
  const combined = emptyPlayer(name, teamId, false);
  let matches = 0;
  let ratingTotal = 0;
  for (const report of Object.values(reports)) {
    const row = report.players.find((player) => player.teamId === teamId && player.name === name);
    if (!row) continue;
    matches += 1;
    combined.started = combined.started || row.started;
    combined.minutes += row.minutes;
    combined.possessions += row.possessions;
    combined.passesAttempted += row.passesAttempted;
    combined.passesCompleted += row.passesCompleted;
    combined.shots += row.shots;
    combined.scores += row.scores;
    combined.highFieldingAttempted += row.highFieldingAttempted;
    combined.highFieldingWon += row.highFieldingWon;
    combined.puckoutsWon += row.puckoutsWon;
    combined.tacklesAttempted += row.tacklesAttempted;
    combined.tacklesWon += row.tacklesWon;
    combined.groundCovered += row.groundCovered;
    combined.fatigue = row.fatigue;
    combined.fitness = row.fitness ?? fitnessOf({ fatigue: row.fatigue, sharpness: 50 });
    combined.overall = row.overall;
    combined.mood = row.mood;
    ratingTotal += row.rating;
  }
  combined.groundCovered = Math.round(combined.groundCovered * 10) / 10;
  combined.rating = matches > 0 ? Math.round((ratingTotal / matches) * 10) / 10 : 0;
  return combined;
}

export function formatPair(made: number, attempted: number): string {
  if (attempted <= 0) return `${made}`;
  return `${made}/${attempted}`;
}

export function combineHalves(
  first: SimulatedMatch,
  second: SimulatedMatch,
  names: { homeName: string; awayName: string; clubId?: string },
): SimulatedMatch {
  const events = [...first.events, ...second.events];
  const tallied = statsFromEvents(events, {
    homeId: second.homeId,
    awayId: second.awayId,
    homeSheet: second.homeSheet,
    awaySheet: second.awaySheet,
    homeTactics: second.homeTactics,
    awayTactics: second.awayTactics,
  });
  const coachReport = buildCoachReport({
    clubId: names.clubId,
    homeId: second.homeId,
    awayId: second.awayId,
    homeName: names.homeName,
    awayName: names.awayName,
    homeTactics: second.homeTactics,
    awayTactics: second.awayTactics,
    homeStats: tallied.homeStats,
    awayStats: tallied.awayStats,
    homeScore: second.homeScore,
    awayScore: second.awayScore,
    players: tallied.players,
    events,
    climate: first.climate,
  });
  return {
    ...second,
    events,
    homeScore: second.homeScore,
    awayScore: second.awayScore,
    homeStats: tallied.homeStats,
    awayStats: tallied.awayStats,
    players: tallied.players,
    coachReport,
    climate: first.climate,
    shots: [...first.shots, ...second.shots],
  };
}

export function liveStats(
  sim: SimulatedMatch,
  cursor: number,
  conditions?: {
    home?: Record<string, PlayerCondition>;
    away?: Record<string, PlayerCondition>;
  },
): { players: PlayerMatchStats[]; homeStats: TeamMatchStats; awayStats: TeamMatchStats } {
  return statsFromEvents(sim.events, {
    homeId: sim.homeId,
    awayId: sim.awayId,
    homeSheet: sim.homeSheet,
    awaySheet: sim.awaySheet,
    homeCondition: conditions?.home,
    awayCondition: conditions?.away,
    homeTactics: sim.homeTactics,
    awayTactics: sim.awayTactics,
    upTo: cursor,
  });
}

export const CHART_RATING_KEYS: AttributeKey[] = [
  "speed",
  "aerialReach",
  "stamina",
  "strength",
  "acceleration",
  "firstTouch",
  "highFielding",
  "strikingDistance",
  "vision",
  "hooking",
  "passing",
  "offTheBall",
  "manMarking",
  "workrate",
  "underPressure",
  "composure",
  "frees",
  "sidelines",
  "puckoutReach",
];

export const CHART_RATING_SHORT: Record<AttributeKey, string> = {
  speed: "Spd",
  aerialReach: "Aer",
  stamina: "Sta",
  strength: "Str",
  acceleration: "Acc",
  firstTouch: "1st",
  highFielding: "HF",
  strikingDistance: "Dst",
  vision: "Vis",
  hooking: "Hk",
  passing: "Pas",
  offTheBall: "Off",
  manMarking: "Mrk",
  workrate: "WR",
  underPressure: "Prs",
  composure: "Cmp",
  frees: "Fr",
  sidelines: "SL",
  puckoutReach: "PO",
};
