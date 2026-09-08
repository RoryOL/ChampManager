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
import { formValue } from "./form";
import { ratedSquad, sideTeamwork } from "./players";
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
  "freesConceded",
  "freesAttempted",
  "freesScored",
  "sixtyFivesAttempted",
  "sixtyFivesScored",
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
    freesConceded: 0,
    freesAttempted: 0,
    freesScored: 0,
    sixtyFivesAttempted: 0,
    sixtyFivesScored: 0,
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
    freesConceded: 0,
    freesAttempted: 0,
    freesScored: 0,
    sixtyFivesAttempted: 0,
    sixtyFivesScored: 0,
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
    stats.freesConceded = (stats.freesConceded ?? 0) + (row.freesConceded ?? 0);
    stats.freesAttempted = (stats.freesAttempted ?? 0) + (row.freesAttempted ?? 0);
    stats.freesScored = (stats.freesScored ?? 0) + (row.freesScored ?? 0);
    stats.sixtyFivesAttempted = (stats.sixtyFivesAttempted ?? 0) + (row.sixtyFivesAttempted ?? 0);
    stats.sixtyFivesScored = (stats.sixtyFivesScored ?? 0) + (row.sixtyFivesScored ?? 0);
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
  completeChance: number | ((name: string) => number) = 0.72,
  fumbleFor?: (name: string) => number,
): { credits: StatCredit[]; carrier: string; retained: boolean; copy?: string } {
  const credits: StatCredit[] = [];
  let onBall = carrier;
  const pool = names.length > 0 ? names : [carrier];
  const completeOf = (name: string) => (typeof completeChance === "function" ? completeChance(name) : completeChance);
  for (let i = 0; i < hops; i += 1) {
    const fumble = fumbleFor?.(onBall) ?? 0;
    if (fumble > 0 && random() < fumble) {
      return {
        credits,
        carrier: onBall,
        retained: false,
        copy: `${onBall} miscontrols the ball.`,
      };
    }
    const target = pool[Math.floor(random() * pool.length)] ?? onBall;
    const completed = random() < completeOf(onBall);
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

function taper(count: number, first: number, cap: number): number {
  if (count <= 0 || cap <= 0) return 0;
  return cap * (1 - Math.exp((-first * count) / cap));
}

function rateDelta(made: number, attempted: number, baseline: number, weight: number): number {
  if (attempted < 3) return 0;
  const confidence = Math.min(1, attempted / 8);
  return ((made / attempted) - baseline) * confidence * weight;
}

function squashHigh(raw: number): number {
  if (raw <= 8.8) return raw;
  const extra = raw - 8.8;
  return 8.8 + extra / (1 + extra * 0.22);
}

/** Championship match rating on a 1–10 scale. A 10 is a once-in-a-season hour. */
export function playerMatchRating(row: PlayerMatchStats): number {
  const minutes = Math.max(0, row.minutes);
  if (minutes < 8) {
    const cameo = 5.6 + (row.scores + row.tacklesWon + row.puckoutsWon) * 0.15;
    return Math.max(1, Math.min(6.8, Math.round(cameo * 10) / 10));
  }

  const setPieceScores = (row.freesScored ?? 0) + (row.sixtyFivesScored ?? 0);
  const openScores = Math.max(0, row.scores - setPieceScores);
  const misses = Math.max(0, row.shots - row.scores);

  let raw =
    5.9 +
    taper(openScores, 0.4, 1.85) +
    taper(Math.max(0, openScores - 4), 0.28, 1.15) +
    taper(setPieceScores, 0.16, 0.55) +
    taper(row.puckoutsWon, 0.08, 0.55) +
    taper(row.highFieldingWon, 0.07, 0.45) +
    taper(Math.min(row.possessions, 16), 0.025, 0.4) +
    rateDelta(row.passesCompleted, row.passesAttempted, 0.68, 1.35) +
    rateDelta(row.tacklesWon, row.tacklesAttempted, 0.48, 1.05) +
    rateDelta(row.scores, row.shots, 0.48, 0.9) -
    Math.min(0.85, misses * 0.1) -
    Math.min(0.45, (row.freesConceded ?? 0) * 0.1);

  if (minutes >= 50 && row.possessions <= 2 && row.scores === 0 && row.tacklesWon <= 1) {
    raw -= 0.55;
  }

  return Math.max(1, Math.min(10, Math.round(squashHigh(raw) * 10) / 10));
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
    gameSeed?: number;
    homeChaseEffort?: number;
    awayChaseEffort?: number;
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

  const homeSquad = ratedSquad(options.homeId, options.gameSeed);
  const awaySquad = ratedSquad(options.awayId, options.gameSeed);
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
    const chaseEffort = row.teamId === options.homeId ? (options.homeChaseEffort ?? 0) : (options.awayChaseEffort ?? 0);
    const drain = matchFatigueDelta(minutes, tactics, position, row.started, found?.player.age, false, chaseEffort);
    const fatigue = Math.max(0, Math.min(100, condition.fatigue + drain));
    const groundCovered = Math.round(minutes * (0.072 + workrate * 0.0032) * 10) / 10;
    return {
      ...row,
      minutes,
      groundCovered,
      fatigue,
      fitness: Math.max(0, Math.min(100, 100 - fatigue)),
      overall,
      rating: playerMatchRating({ ...row, minutes }),
      mood: formValue(condition),
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
    events: sim.events.filter((event) => event.kind === "sub" || event.kind === "injury" || event.kind === "red"),
    homeClosingSheet: sim.homeClosingSheet,
    awayClosingSheet: sim.awayClosingSheet,
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
    combined.puckoutsWon += row.puckoutsWon ?? 0;
    combined.tacklesAttempted += row.tacklesAttempted ?? 0;
    combined.tacklesWon += row.tacklesWon ?? 0;
    combined.freesConceded = (combined.freesConceded ?? 0) + (row.freesConceded ?? 0);
    combined.freesAttempted = (combined.freesAttempted ?? 0) + (row.freesAttempted ?? 0);
    combined.freesScored = (combined.freesScored ?? 0) + (row.freesScored ?? 0);
    combined.sixtyFivesAttempted =
      (combined.sixtyFivesAttempted ?? 0) + (row.sixtyFivesAttempted ?? 0);
    combined.sixtyFivesScored = (combined.sixtyFivesScored ?? 0) + (row.sixtyFivesScored ?? 0);
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

export function lastMatchRating(
  reports: Record<string, MatchReport>,
  teamId: string,
  name: string,
  matchIds?: string[],
): number | undefined {
  const ids = matchIds ?? Object.keys(reports);
  for (let i = ids.length - 1; i >= 0; i--) {
    const row = reports[ids[i]]?.players.find((player) => player.teamId === teamId && player.name === name);
    if (row) return row.rating;
  }
  return undefined;
}

export function formatMatchRating(value: number | undefined): string {
  if (value === undefined || value <= 0) return "–";
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function formatPair(made: number, attempted: number): string {
  if (attempted <= 0) return `${made}`;
  return `${made}/${attempted}`;
}

export function combineHalves(
  first: SimulatedMatch,
  second: SimulatedMatch,
  names: {
    homeName: string;
    awayName: string;
    clubId?: string;
    condition?: Record<string, PlayerCondition>;
  },
): SimulatedMatch {
  const events = [...first.events, ...second.events];
  const homeCondition = names.clubId === second.homeId ? names.condition : undefined;
  const awayCondition = names.clubId === second.awayId ? names.condition : undefined;
  const tallied = statsFromEvents(events, {
    homeId: second.homeId,
    awayId: second.awayId,
    homeSheet: first.homeSheet,
    awaySheet: first.awaySheet,
    homeCondition,
    awayCondition,
    homeTactics: second.homeTactics,
    awayTactics: second.awayTactics,
    gameSeed: first.gameSeed ?? second.gameSeed,
    homeChaseEffort: Math.min(1, (first.homeChaseEffort ?? 0) + (second.homeChaseEffort ?? 0)),
    awayChaseEffort: Math.min(1, (first.awayChaseEffort ?? 0) + (second.awayChaseEffort ?? 0)),
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
    homeTeamwork: sideTeamwork(second.homeId, first.homeSheet, homeCondition ?? {}, first.gameSeed ?? second.gameSeed),
    awayTeamwork: sideTeamwork(second.awayId, first.awaySheet, awayCondition ?? {}, first.gameSeed ?? second.gameSeed),
    condition: names.condition,
  });
  return {
    ...second,
    events,
    homeScore: second.homeScore,
    awayScore: second.awayScore,
    homeSheet: first.homeSheet,
    awaySheet: first.awaySheet,
    homeClosingSheet: second.homeClosingSheet ?? second.homeSheet,
    awayClosingSheet: second.awayClosingSheet ?? second.awaySheet,
    homeStats: tallied.homeStats,
    awayStats: tallied.awayStats,
    players: tallied.players,
    coachReport,
    climate: first.climate,
    shots: [...first.shots, ...second.shots],
    homeChaseEffort: Math.min(1, (first.homeChaseEffort ?? 0) + (second.homeChaseEffort ?? 0)),
    awayChaseEffort: Math.min(1, (first.awayChaseEffort ?? 0) + (second.awayChaseEffort ?? 0)),
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
    gameSeed: sim.gameSeed,
    homeChaseEffort: sim.homeChaseEffort,
    awayChaseEffort: sim.awayChaseEffort,
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
  "shooting",
  "workrate",
  "underPressure",
  "composure",
  "teamwork",
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
  shooting: "Sht",
  workrate: "WR",
  underPressure: "Prs",
  composure: "Cmp",
  teamwork: "Tm",
  frees: "Fr",
  sidelines: "SL",
  puckoutReach: "PO",
};
