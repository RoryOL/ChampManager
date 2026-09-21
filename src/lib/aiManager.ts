import { seedChampionship } from "../data/championship";
import type {
  CalendarPhase,
  CareerBook,
  ClubRuntime,
  Difficulty,
  HalfPlan,
  MatchClimate,
  MatchPrep,
  MatchReport,
  PlayerCondition,
  RatedPlayer,
  SimulatedMatch,
  SquadBalance,
  Tactics,
  TeamSheet,
} from "../types";
import { ADJACENT_LINES, clampDial, XV_SLOTS } from "./attributes";
import { compactName } from "./display";
import { applyMatchForm, formValue, withStartingForm } from "./form";
import {
  applyInjury,
  applyMatchSuspensions,
  closingSheetOf,
  injuredNamesFromEvents,
  isUnavailable,
  keepClubSheet,
  sitInjuredPlayers,
} from "./injuries";
import { simulateMatch, straightRedNamesFromEvents } from "./matchEngine";
import { ratingsCtx } from "./balance";
import {
  assumedOpponentTactics,
  blendTactics,
  cpuAdaptWeight,
  cpuDifficulty,
  cpuHalfTimeSkill,
  inferOpponentTactics,
} from "./difficulty";
import {
  clubTactics,
  defaultSheet,
  pickPuckoutTarget,
  ratedSquad,
  sheetPlayers,
  sideProfile,
} from "./players";
import { createRng, seedFrom } from "./rng";
import { scoreTotal } from "./scoring";
import {
  applyMatchFatigue,
  applyTeamwork,
  applyWeekSession,
  averageFitness,
  DEFAULT_INTENSITY,
  defaultCondition,
  ensureCondition,
  fitnessOf,
  isOvertrained,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
  recoverBetweenMatches,
  recoverAfterMatch,
  squadNames,
} from "./training";
import { rollClimate } from "./weather";

export type ManagedOpponent = {
  id: string;
  sheet: TeamSheet;
  tactics: Tactics;
  condition?: Record<string, PlayerCondition>;
};

export type ChallengePair = {
  homeId: string;
  awayId: string;
};

function cpuIntensity(clubId: string): ClubRuntime["intensity"] {
  return seedFrom(clubId) % 4 === 0 ? "light" : "balanced";
}

function managedSessionIntensity(club: ClubRuntime, clubId: string, seed: number): ClubRuntime["intensity"] {
  const names = squadNames(clubId, seed);
  if (averageFitness(club.condition, names) < 62) return "light";
  return club.intensity === "intense" ? "balanced" : (club.intensity ?? DEFAULT_INTENSITY);
}

export function pickCpuMatchPrep(options: {
  clubId: string;
  opponentId?: string;
  seed: number;
  matchKey?: string;
  balance?: SquadBalance;
}): MatchPrep {
  const tactics = clubTactics(options.clubId, options.balance);
  const noise = createRng(seedFrom(`${options.seed}:${options.clubId}:${options.matchKey ?? "prep"}:aspect`));
  const scored: { prep: MatchPrep; score: number }[] = [
    { prep: "puckout", score: tactics.puckout + noise() * 18 },
    { prep: "shooting", score: 100 - tactics.shooting + noise() * 18 },
    { prep: "marking", score: tactics.pressure + noise() * 18 },
    { prep: "running", score: 100 - tactics.build + noise() * 18 },
  ];
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.prep ?? "marking";
}

export function restAndPrepManagedClub(
  club: ClubRuntime,
  clubId: string,
  options: { seed: number; opponentId?: string; matchKey?: string; balance?: SquadBalance; careers?: CareerBook },
): ClubRuntime {
  const squad = ratedSquad(clubId, ratingsCtx(options.seed, options.balance, options.careers));
  return {
    ...club,
    condition: recoverBetweenMatches(club.condition, squad),
    nextMatchPrep: pickCpuMatchPrep({ ...options, clubId }),
    trainingDue: false,
    sessionsDone: 0,
  };
}

export function createManagedClub(clubId: string, seed = 1, balance?: SquadBalance): ClubRuntime {
  const names = squadNames(clubId, seed);
  return {
    tactics: clubTactics(clubId, balance),
    sheet: defaultSheet(clubId),
    condition: withStartingForm(ensureCondition(names, {}, defaultCondition()), names, seed),
    inbox: [],
    trainingDue: true,
    plans: {},
    intensity: cpuIntensity(clubId),
    weekShape: "challenge",
    sessionsDone: 0,
    trainingDeltas: {},
    weekDeltas: {},
  };
}

export function managedTeamIds(userClubId?: string): string[] {
  return seedChampionship.teams.map((team) => team.id).filter((id) => id !== userClubId);
}

export function ensureManagedClubs(
  clubs: Record<string, ClubRuntime>,
  seed: number,
  balance?: SquadBalance,
): Record<string, ClubRuntime> {
  const next = { ...clubs };
  for (const team of seedChampionship.teams) {
    next[team.id] ??= createManagedClub(team.id, seed, balance);
  }
  return next;
}

export function seedRivals(userClubId: string, seed: number, balance?: SquadBalance): Record<string, ClubRuntime> {
  const rivals: Record<string, ClubRuntime> = {};
  for (const id of managedTeamIds(userClubId)) {
    rivals[id] = createManagedClub(id, seed, balance);
  }
  return rivals;
}

function slotScore(
  player: RatedPlayer,
  slotIndex: number,
  condition: PlayerCondition | undefined,
  preferred: boolean,
): number {
  const slot = XV_SLOTS[slotIndex] ?? "MF";
  const familiarity = player.ratings.familiarity[slot] ?? 0;
  let bonus = 0;
  if (player.position === slot) bonus += 40;
  else if ((ADJACENT_LINES[slot] ?? []).includes(player.position)) bonus += 12;
  const form = formValue(condition);
  const fitness = condition ? fitnessOf(condition) : 70;
  let score = bonus * 10 + familiarity * 8 + player.ratings.overall * 6 + form * 0.4 + fitness * 0.45;
  if (preferred) score += 18;
  if (isUnavailable(condition)) score -= 1000;
  if (slotIndex !== 0 && condition) {
    if (isOvertrained(condition)) score -= 48;
    else if (fitness <= 58) score -= 24;
    else if (fitness <= 72) score -= 10;
  }
  return score;
}

export function pickCpuSheet(options: {
  teamId: string;
  condition: Record<string, PlayerCondition>;
  seed: number;
  matchKey: string;
  lastSheet?: TeamSheet;
  extraNames?: string[];
  balance?: SquadBalance;
  careers?: CareerBook;
}): TeamSheet {
  const squad = ratedSquad(options.teamId, ratingsCtx(options.seed, options.balance, options.careers));
  const preferred = options.lastSheet ?? defaultSheet(options.teamId);
  const extra = options.extraNames ?? [];
  const seated = sitInjuredPlayers(preferred, squad, options.condition, extra);
  const unavailable = new Set([
    ...extra,
    ...squad.filter((player) => isUnavailable(options.condition[player.name])).map((player) => player.name),
  ]);
  const used = new Set<string>();
  const starters: string[] = [];
  for (let index = 0; index < 15; index += 1) {
    const incumbent = seated.starters[index];
    const candidates = squad.filter((player) => !used.has(player.name) && !unavailable.has(player.name));
    const ranked = [...candidates].sort(
      (left, right) =>
        slotScore(right, index, options.condition[right.name], right.name === incumbent) -
        slotScore(left, index, options.condition[left.name], left.name === incumbent),
    );
    const pick =
      ranked[0]?.name ??
      (incumbent && !used.has(incumbent) ? incumbent : undefined) ??
      squad.find((player) => !used.has(player.name))?.name;
    if (!pick) continue;
    starters.push(pick);
    used.add(pick);
  }
  const leftover = squad.filter((player) => !used.has(player.name));
  const healthyRest = leftover.filter((player) => !unavailable.has(player.name));
  const injuredRest = leftover.filter((player) => unavailable.has(player.name));
  const rankedSubs = [...healthyRest].sort((left, right) => {
    const leftKeep = seated.subs.includes(left.name) ? 8 : 0;
    const rightKeep = seated.subs.includes(right.name) ? 8 : 0;
    const leftGk = left.position === "GK" ? 6 : 0;
    const rightGk = right.position === "GK" ? 6 : 0;
    return (
      right.ratings.overall + formValue(options.condition[right.name]) * 0.08 + rightKeep + rightGk -
      (left.ratings.overall + formValue(options.condition[left.name]) * 0.08 + leftKeep + leftGk)
    );
  });
  return { starters, subs: [...rankedSubs.map((player) => player.name), ...injuredRest.map((player) => player.name)] };
}

export function pickCpuTactics(options: {
  teamId: string;
  opponentId: string;
  seed: number;
  matchKey: string;
  sheet?: TeamSheet;
  condition?: Record<string, PlayerCondition>;
  opponentSheet?: TeamSheet;
  opponentTactics?: Tactics;
  opponentCondition?: Record<string, PlayerCondition>;
  climate?: MatchClimate;
  difficulty?: Difficulty;
  reports?: Record<string, MatchReport>;
  balance?: SquadBalance;
  careers?: CareerBook;
}): Tactics {
  const difficulty = cpuDifficulty(options.difficulty);
  const base = clubTactics(options.teamId, options.balance);
  const weight = cpuAdaptWeight(difficulty);
  if (weight <= 0) return { ...base };

  const climate = options.climate ?? rollClimate(options.seed, options.matchKey);
  const sheet = options.sheet ?? defaultSheet(options.teamId);
  const condition = options.condition ?? {};
  const opponentSheet = options.opponentSheet ?? defaultSheet(options.opponentId);
  const inferred = inferOpponentTactics(options.reports ?? {}, options.opponentId, options.teamId);
  const opponentTactics = assumedOpponentTactics(
    difficulty,
    options.opponentTactics,
    inferred,
    clubTactics(options.opponentId, options.balance),
  );
  const panel = ratingsCtx(options.seed, options.balance, options.careers);
  const ours = sideProfile(options.teamId, sheet, base, condition, panel, climate);
  const theirs = sideProfile(
    options.opponentId,
    opponentSheet,
    opponentTactics,
    options.opponentCondition ?? {},
    panel,
    climate,
  );

  let mentality = base.mentality;
  let shape = base.shape;
  let build = base.build;
  let puckout = base.puckout;
  let aggression = base.aggression;
  let pressure = base.pressure;
  let shooting = base.shooting;

  if (theirs.attack > ours.defence + 0.85) {
    mentality = mentality === "attacking" ? "balanced" : "contain";
    shape = "sweeper";
    pressure = Math.min(pressure, 54);
  }
  if (ours.attack > theirs.defence + 0.85) {
    mentality = mentality === "contain" ? "balanced" : "attacking";
  }
  if (opponentTactics.puckout <= 38) {
    pressure = Math.max(pressure, 72);
  }
  if (opponentTactics.build >= 68 && ours.aerial > theirs.aerial + 0.25) {
    pressure = Math.max(pressure, 64);
  }
  if (opponentTactics.shape === "sweeper") {
    shooting = Math.min(shooting, 36);
    build = Math.min(build, 46);
    pressure = Math.max(pressure, 58);
  }
  if (climate.sky === "wet") {
    build = Math.max(build, 64);
    aggression = Math.max(aggression, 58);
    shooting = Math.max(shooting, 54);
    puckout = Math.max(puckout, 56);
  } else if (climate.sky === "windy") {
    shooting = Math.max(shooting, 58);
    build = Math.max(build, 52);
  }

  const jitter = (seedFrom(`${options.seed}:${options.matchKey}:cpu-tactics`) % 9) - 4;
  const xv = sheetPlayers(options.teamId, sheet, panel);
  const target = pickPuckoutTarget(xv, base.puckoutTarget, condition);
  const adapted: Tactics = {
    mentality,
    shape,
    build: clampDial(build + jitter),
    puckout: clampDial(puckout + Math.round(jitter / 2)),
    aggression: clampDial(aggression),
    pressure: clampDial(pressure),
    shooting: clampDial(shooting),
    puckoutTarget: clampDial(puckout) >= 55 ? target?.name : undefined,
  };
  return blendTactics(base, adapted, weight);
}

export function pickCpuHalfPlan(options: {
  teamId: string;
  first: SimulatedMatch;
  side: "home" | "away";
  condition: Record<string, PlayerCondition>;
  seed: number;
  difficulty?: Difficulty;
  balance?: SquadBalance;
  careers?: CareerBook;
}): HalfPlan {
  const skill = cpuHalfTimeSkill(cpuDifficulty(options.difficulty));
  const ours = options.side === "home";
  const ourScore = ours ? options.first.homeScore : options.first.awayScore;
  const theirScore = ours ? options.first.awayScore : options.first.homeScore;
  const gap = scoreTotal(theirScore) - scoreTotal(ourScore);
  const lastSheet = closingSheetOf(options.first, options.teamId);
  const openingTactics = ours ? options.first.homeTactics : options.first.awayTactics;
  const theirTactics = ours ? options.first.awayTactics : options.first.homeTactics;
  const hurt = injuredNamesFromEvents(options.first.events, options.teamId);
  let sheet = pickCpuSheet({
    teamId: options.teamId,
    condition: options.condition,
    seed: options.seed,
    matchKey: `${options.first.matchId}:second`,
    lastSheet,
    extraNames: hurt,
    balance: options.balance,
    careers: options.careers,
  });
  if (skill === "scout") {
    sheet = subPoorPerformers(
      sheet,
      options.first,
      options.teamId,
      options.condition,
      options.seed,
      options.balance,
      options.careers,
    );
  }
  let tactics: Tactics = { ...openingTactics };
  if (skill === "none") {
    return { tactics, sheet, submittedAt: 0 };
  }
  const chaseGap = skill === "late" ? 8 : skill === "scout" ? 3 : 4;
  const sitGap = skill === "late" ? -12 : skill === "scout" ? -5 : -6;
  if (skill === "scout") {
    if (theirTactics.shape === "sweeper") {
      tactics = {
        ...tactics,
        shooting: clampDial(Math.min(tactics.shooting, 36)),
        build: clampDial(Math.min(tactics.build, 46)),
        pressure: clampDial(Math.max(tactics.pressure, 58)),
      };
    }
    if (theirTactics.puckout <= 38) {
      tactics = { ...tactics, pressure: clampDial(Math.max(tactics.pressure, 72)) };
    }
    if (theirTactics.mentality === "attacking" && gap <= 2) {
      tactics = {
        ...tactics,
        mentality: tactics.mentality === "attacking" ? "balanced" : tactics.mentality,
        shape: "sweeper",
      };
    }
  }
  if (gap >= chaseGap) {
    tactics = {
      ...tactics,
      mentality: "attacking",
      shape: "traditional",
      shooting: clampDial(Math.min(tactics.shooting, 34)),
      pressure: clampDial(Math.max(tactics.pressure, 62)),
      build: clampDial(Math.min(tactics.build, 48)),
    };
  } else if (gap <= sitGap) {
    tactics = {
      ...tactics,
      mentality: "contain",
      pressure: clampDial(Math.min(tactics.pressure, 44)),
      shooting: clampDial(Math.max(tactics.shooting, 56)),
    };
  }
  return { tactics, sheet, submittedAt: 0 };
}

function subPoorPerformers(
  sheet: TeamSheet,
  first: SimulatedMatch,
  teamId: string,
  condition: Record<string, PlayerCondition>,
  seed: number,
  balance?: SquadBalance,
  careers?: CareerBook,
): TeamSheet {
  const rows = first.players.filter((row) => row.teamId === teamId && row.started);
  if (rows.length === 0) return sheet;
  const worst = [...rows]
    .filter((row) => row.rating <= 5.8 && sheet.starters.includes(row.name))
    .sort((left, right) => left.rating - right.rating);
  if (worst.length === 0) return sheet;
  const squad = ratedSquad(teamId, ratingsCtx(seed, balance, careers));
  const starters = [...sheet.starters];
  const subs = [...sheet.subs];
  const bench = sheet.subs.filter((name) => !isUnavailable(condition[name]));
  let swaps = 0;
  for (const poor of worst) {
    if (swaps >= 2) break;
    const slot = starters.indexOf(poor.name);
    if (slot < 0) continue;
    const incoming = bench.find((name) => {
      const player = squad.find((item) => item.name === name);
      const outgoing = squad.find((item) => item.name === poor.name);
      return Boolean(player) && (player?.ratings.overall ?? 0) >= (outgoing?.ratings.overall ?? 0) - 2;
    });
    if (!incoming) continue;
    starters[slot] = incoming;
    const subIndex = subs.indexOf(incoming);
    if (subIndex >= 0) subs[subIndex] = poor.name;
    bench.splice(bench.indexOf(incoming), 1);
    swaps += 1;
  }
  return { starters, subs };
}

export function trainManagedClub(
  club: ClubRuntime,
  clubId: string,
  options: {
    seed: number;
    phase: CalendarPhase;
    preseasonWeek: number;
    date: string;
    remainingWeeks: number;
    session?: "mixed" | "challenge" | "recovery";
    balance?: SquadBalance;
    careers?: CareerBook;
  },
): ClubRuntime {
  if (options.phase === "season") {
    return restAndPrepManagedClub(club, clubId, {
      seed: options.seed,
      matchKey: options.date,
      balance: options.balance,
      careers: options.careers,
    });
  }
  const squad = ratedSquad(clubId, ratingsCtx(options.seed, options.balance, options.careers));
  const sessionsDone = club.sessionsDone ?? 0;
  const result = applyWeekSession({
    squad,
    condition: club.condition,
    sheet: club.sheet,
    lastSheet: club.lastSheet,
    plans: club.plans ?? {},
    phase: options.phase,
    preseasonWeek: options.preseasonWeek,
    sessionsDone,
    intensity: managedSessionIntensity(club, clubId, options.seed),
    weekShape: options.phase === "preseason" ? "triple" : (club.weekShape ?? "challenge"),
    requestedSession: options.session ?? "mixed",
    seed: options.seed,
    weekKey: `${clubId}-${options.phase}-${options.preseasonWeek}-${options.date}-${sessionsDone}`,
    remainingWeeks: options.remainingWeeks,
    weekDeltas: club.weekDeltas ?? {},
  });
  return {
    ...club,
    condition: result.condition,
    sheet: result.sheet,
    lastSheet: result.lastSheet ?? club.lastSheet,
    trainingDue: result.trainingDue,
    sessionsDone: result.sessionsDone,
    trainingDeltas: result.visibleDeltas,
    weekDeltas: result.weekComplete ? {} : result.weekDeltas,
  };
}

export function pairChallengeMatches(clubIds: string[], week: number, seed: number): ChallengePair[] {
  const ordered = [...clubIds].sort();
  let pool = [...ordered];
  if (pool.length % 2 === 1 && pool.length > 0) {
    pool.splice((Math.max(1, week) - 1) % pool.length, 1);
  }
  const random = createRng(seedFrom(`${seed}:challenge-pairs:${week}`));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = pool[index]!;
    pool[index] = pool[swap]!;
    pool[swap] = current;
  }
  const pairs: ChallengePair[] = [];
  for (let index = 0; index + 1 < pool.length; index += 2) {
    pairs.push({ homeId: pool[index]!, awayId: pool[index + 1]! });
  }
  return pairs;
}

function teamName(teamId: string): string {
  const team = seedChampionship.teams.find((item) => item.id === teamId);
  return team ? compactName(team) : teamId;
}

export function applySimToClub(
  club: ClubRuntime,
  clubId: string,
  sim: SimulatedMatch,
  seed: number,
  kind: "challenge" | "competitive" = "competitive",
  openingSheet?: TeamSheet,
  balance?: SquadBalance,
  careers?: CareerBook,
): ClubRuntime {
  if (clubId !== sim.homeId && clubId !== sim.awayId) return club;
  const ours = clubId === sim.homeId;
  const squad = ratedSquad(clubId, ratingsCtx(seed, balance, careers));
  const closing = keepClubSheet(closingSheetOf(sim, clubId), squad);
  const opening = keepClubSheet(openingSheet ?? (ours ? sim.homeSheet : sim.awaySheet), squad);
  const tactics = ours ? sim.homeTactics : sim.awayTactics;
  const ourScore = ours ? sim.homeScore : sim.awayScore;
  const theirScore = ours ? sim.awayScore : sim.homeScore;
  const result =
    scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
  const chase = ours ? (sim.homeChaseEffort ?? 0) : (sim.awayChaseEffort ?? 0);
  let condition = applyMatchFatigue(
    club.condition,
    closing.starters,
    closing.subs,
    tactics,
    squad,
    sim.events.some((event) => event.kind === "red" && event.teamId === clubId),
    chase,
  );
  condition = applyMatchForm(condition, squad, opening, closing, sim.players, result, seed, sim.matchId);
  const teamworked = applyTeamwork(condition, closing, club.lastSheet, kind);
  condition = teamworked.condition;
  for (const item of sim.matchInjuries ?? []) {
    if (item.teamId !== clubId) continue;
    condition = applyInjury(condition, item.name, item.injury);
  }
  if (kind === "competitive") {
    const rested = recoverAfterMatch(condition, squad);
    condition = applyMatchSuspensions(rested.condition, straightRedNamesFromEvents(sim.events, clubId));
  }
  return {
    ...club,
    tactics,
    condition,
    sheet: sitInjuredPlayers(closing, squad, condition),
    lastSheet: teamworked.lastSheet,
    trainingDue: true,
    sessionsDone: 0,
    weekDeltas: {},
    nextMatchPrep: kind === "competitive" ? undefined : club.nextMatchPrep,
  };
}

export function playManagedChallenge(options: {
  homeId: string;
  awayId: string;
  home: ClubRuntime;
  away: ClubRuntime;
  seed: number;
  week: number;
  remainingWeeks: number;
  difficulty?: Difficulty;
  reports?: Record<string, MatchReport>;
  balance?: SquadBalance;
  careers?: CareerBook;
}): { home: ClubRuntime; away: ClubRuntime; sim: SimulatedMatch } {
  const matchId = `pre:${options.week}:${options.homeId}:${options.awayId}`;
  const climate = rollClimate(options.seed, matchId);
  const homeSheet = pickCpuSheet({
    teamId: options.homeId,
    condition: options.home.condition,
    seed: options.seed,
    matchKey: matchId,
    lastSheet: options.home.lastSheet ?? options.home.sheet,
    balance: options.balance,
    careers: options.careers,
  });
  const awaySheet = pickCpuSheet({
    teamId: options.awayId,
    condition: options.away.condition,
    seed: options.seed,
    matchKey: matchId,
    lastSheet: options.away.lastSheet ?? options.away.sheet,
    balance: options.balance,
    careers: options.careers,
  });
  const homeTactics = pickCpuTactics({
    teamId: options.homeId,
    opponentId: options.awayId,
    seed: options.seed,
    matchKey: matchId,
    sheet: homeSheet,
    condition: options.home.condition,
    opponentSheet: awaySheet,
    opponentTactics: clubTactics(options.awayId, options.balance),
    opponentCondition: options.away.condition,
    climate,
    difficulty: options.difficulty,
    reports: options.reports,
    balance: options.balance,
    careers: options.careers,
  });
  const awayTactics = pickCpuTactics({
    teamId: options.awayId,
    opponentId: options.homeId,
    seed: options.seed,
    matchKey: matchId,
    sheet: awaySheet,
    condition: options.away.condition,
    opponentSheet: homeSheet,
    opponentTactics: clubTactics(options.homeId, options.balance),
    opponentCondition: options.home.condition,
    climate,
    difficulty: options.difficulty,
    reports: options.reports,
    balance: options.balance,
    careers: options.careers,
  });
  const sim = simulateMatch({
    matchId,
    homeId: options.homeId,
    awayId: options.awayId,
    homeSheet,
    awaySheet,
    homeTactics,
    awayTactics,
    homeCondition: options.home.condition,
    awayCondition: options.away.condition,
    homeSquad: ratedSquad(options.homeId, ratingsCtx(options.seed, options.balance, options.careers)),
    awaySquad: ratedSquad(options.awayId, ratingsCtx(options.seed, options.balance, options.careers)),
    remainingWeeks: options.remainingWeeks,
    clubId: options.homeId,
    homeName: teamName(options.homeId),
    awayName: teamName(options.awayId),
    period: "full",
    seed: options.seed,
    gameSeed: options.seed,
    balance: options.balance,
    climate,
  });
  return {
    home: applySimToClub({ ...options.home, sheet: homeSheet, tactics: homeTactics }, options.homeId, sim, options.seed, "challenge", undefined, options.balance, options.careers),
    away: applySimToClub({ ...options.away, sheet: awaySheet, tactics: awayTactics }, options.awayId, sim, options.seed, "challenge", undefined, options.balance, options.careers),
    sim,
  };
}

export function tickManagedPreseasonWeek(
  clubs: Record<string, ClubRuntime>,
  managedIds: string[],
  options: {
    seed: number;
    week: number;
    remainingWeeks: number;
    difficulty?: Difficulty;
    reports?: Record<string, MatchReport>;
    balance?: SquadBalance;
    careers?: CareerBook;
  },
): Record<string, ClubRuntime> {
  const date = PRESEASON_DATES[options.week - 1] ?? PRESEASON_DATES.at(-1) ?? "";
  let next = { ...clubs };
  for (const clubId of managedIds) {
    let club = next[clubId] ?? createManagedClub(clubId, options.seed, options.balance);
    club = trainManagedClub(club, clubId, {
      seed: options.seed,
      phase: "preseason",
      preseasonWeek: options.week,
      date,
      remainingWeeks: options.remainingWeeks,
      balance: options.balance,
      careers: options.careers,
    });
    club = trainManagedClub(club, clubId, {
      seed: options.seed,
      phase: "preseason",
      preseasonWeek: options.week,
      date,
      remainingWeeks: options.remainingWeeks,
      balance: options.balance,
      careers: options.careers,
    });
    next[clubId] = club;
  }
  for (const pair of pairChallengeMatches(managedIds, options.week, options.seed)) {
    const home = next[pair.homeId];
    const away = next[pair.awayId];
    if (!home || !away) continue;
    const played = playManagedChallenge({
      homeId: pair.homeId,
      awayId: pair.awayId,
      home,
      away,
      seed: options.seed,
      week: options.week,
      remainingWeeks: options.remainingWeeks,
      difficulty: options.difficulty,
      reports: options.reports,
      balance: options.balance,
      careers: options.careers,
    });
    next[pair.homeId] = played.home;
    next[pair.awayId] = played.away;
  }
  for (const clubId of managedIds) {
    const club = next[clubId];
    if (!club) continue;
    const championshipWeek = options.week >= PRESEASON_WEEKS;
    const squad = championshipWeek ? ratedSquad(clubId, ratingsCtx(options.seed, options.balance, options.careers)) : [];
    next[clubId] = {
      ...club,
      condition: championshipWeek ? recoverBetweenMatches(club.condition, squad) : club.condition,
      sessionsDone: 0,
      trainingDue: true,
      weekDeltas: {},
      nextMatchPrep: championshipWeek ? undefined : club.nextMatchPrep,
    };
  }
  return next;
}

export function prepareManagedClubForMatch(
  club: ClubRuntime,
  clubId: string,
  opponent: ManagedOpponent,
  matchId: string,
  seed: number,
  climate?: MatchClimate,
  extras?: { difficulty?: Difficulty; reports?: Record<string, MatchReport>; balance?: SquadBalance; careers?: CareerBook },
): ClubRuntime {
  const sheet = pickCpuSheet({
    teamId: clubId,
    condition: club.condition,
    seed,
    matchKey: matchId,
    lastSheet: club.lastSheet ?? club.sheet,
    balance: extras?.balance,
    careers: extras?.careers,
  });
  const tactics = pickCpuTactics({
    teamId: clubId,
    opponentId: opponent.id,
    seed,
    matchKey: matchId,
    sheet,
    condition: club.condition,
    opponentSheet: opponent.sheet,
    opponentTactics: opponent.tactics,
    opponentCondition: opponent.condition,
    climate,
    difficulty: extras?.difficulty,
    reports: extras?.reports,
    balance: extras?.balance,
    careers: extras?.careers,
  });
  return { ...club, sheet, tactics };
}

export function prepareRivalsForMatches(options: {
  rivals: Record<string, ClubRuntime>;
  userClubId: string;
  userSheet: TeamSheet;
  userTactics: Tactics;
  matches: { id: string; homeId: string; awayId: string }[];
  seed: number;
  date: string;
  remainingWeeks: number;
  preseasonWeek: number;
  difficulty?: Difficulty;
  reports?: Record<string, MatchReport>;
  userCondition?: Record<string, PlayerCondition>;
  balance?: SquadBalance;
  careers?: CareerBook;
}): Record<string, ClubRuntime> {
  let rivals = { ...options.rivals };
  const involved = new Set<string>();
  for (const match of options.matches) {
    if (match.homeId !== options.userClubId) involved.add(match.homeId);
    if (match.awayId !== options.userClubId) involved.add(match.awayId);
  }
  for (const clubId of involved) {
    let club = rivals[clubId] ?? createManagedClub(clubId, options.seed, options.balance);
    if (club.trainingDue) {
      const match = options.matches.find((item) => item.homeId === clubId || item.awayId === clubId);
      const opponentId = match ? (match.homeId === clubId ? match.awayId : match.homeId) : undefined;
      club = restAndPrepManagedClub(club, clubId, {
        seed: options.seed,
        opponentId,
        matchKey: match?.id ?? options.date,
        balance: options.balance,
        careers: options.careers,
      });
    }
    rivals[clubId] = club;
  }
  for (const match of options.matches) {
    for (const [clubId, opponentId] of [
      [match.homeId, match.awayId],
      [match.awayId, match.homeId],
    ] as const) {
      if (clubId === options.userClubId) continue;
      const club = rivals[clubId];
      if (!club) continue;
      const opponentIsUser = opponentId === options.userClubId;
      const opponentClub = rivals[opponentId];
      rivals[clubId] = prepareManagedClubForMatch(
        club,
        clubId,
        {
          id: opponentId,
          sheet: opponentIsUser ? options.userSheet : (opponentClub?.sheet ?? defaultSheet(opponentId)),
          tactics: opponentIsUser ? options.userTactics : clubTactics(opponentId, options.balance),
          condition: opponentIsUser ? options.userCondition : opponentClub?.condition,
        },
        match.id,
        options.seed,
        undefined,
        { difficulty: options.difficulty, reports: options.reports, balance: options.balance, careers: options.careers },
      );
    }
  }
  return rivals;
}

export function applySimsToRivals(
  rivals: Record<string, ClubRuntime>,
  sims: SimulatedMatch[],
  skipClubId: string,
  seed: number,
  balance?: SquadBalance,
  careers?: CareerBook,
): Record<string, ClubRuntime> {
  let next = { ...rivals };
  for (const sim of sims) {
    for (const clubId of [sim.homeId, sim.awayId]) {
      if (clubId === skipClubId) continue;
      const club = next[clubId];
      if (!club) continue;
      next[clubId] = applySimToClub(club, clubId, sim, seed, "competitive", undefined, balance, careers);
    }
  }
  return next;
}

export function tickRivalsMidweek(
  rivals: Record<string, ClubRuntime>,
  options: {
    seed: number;
    date: string;
    remainingWeeks: number;
    preseasonWeek: number;
    balance?: SquadBalance;
    careers?: CareerBook;
  },
): Record<string, ClubRuntime> {
  const next = { ...rivals };
  for (const [clubId, club] of Object.entries(next)) {
    if (!club.trainingDue) continue;
    next[clubId] = restAndPrepManagedClub(club, clubId, {
      seed: options.seed,
      matchKey: options.date,
      balance: options.balance,
      careers: options.careers,
    });
  }
  return next;
}

export function syncRivalsAfterUserWeek(
  save: {
    clubId: string;
    seed: number;
    phase: CalendarPhase;
    preseasonWeek: number;
    rivals: Record<string, ClubRuntime>;
    difficulty?: Difficulty;
    reports?: Record<string, MatchReport>;
    balance?: SquadBalance;
    careers?: CareerBook;
  },
  remainingWeeks: number,
  date: string,
): Record<string, ClubRuntime> {
  const rivals = save.rivals ?? seedRivals(save.clubId, save.seed, save.balance);
  if (save.phase === "preseason") {
    return tickManagedPreseasonWeek(rivals, managedTeamIds(save.clubId), {
      seed: save.seed,
      week: save.preseasonWeek,
      remainingWeeks,
      difficulty: save.difficulty,
      reports: save.reports,
      balance: save.balance,
      careers: save.careers,
    });
  }
  return tickRivalsMidweek(rivals, {
    seed: save.seed,
    date,
    remainingWeeks,
    preseasonWeek: save.preseasonWeek,
    balance: save.balance,
    careers: save.careers,
  });
}
