import { seedChampionship } from "../data/championship";
import type {
  CalendarPhase,
  ClubRuntime,
  HalfPlan,
  MatchClimate,
  PlayerCondition,
  RatedPlayer,
  SimulatedMatch,
  Tactics,
  TeamSheet,
} from "../types";
import { ADJACENT_LINES, clampDial, XV_SLOTS } from "./attributes";
import { compactName } from "./display";
import { applyMatchForm, formValue, withStartingForm } from "./form";
import {
  applyInjury,
  injuredNamesFromEvents,
  isInjured,
  sitInjuredPlayers,
} from "./injuries";
import { simulateMatch } from "./matchEngine";
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
  DEFAULT_INTENSITY,
  defaultCondition,
  ensureCondition,
  fitnessOf,
  isOvertrained,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
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
  const roll = seedFrom(clubId) % 5;
  if (roll === 0) return "intense";
  if (roll === 1) return "light";
  return "balanced";
}

export function createManagedClub(clubId: string, seed = 1): ClubRuntime {
  const names = squadNames(clubId, seed);
  return {
    tactics: clubTactics(clubId),
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

export function ensureManagedClubs(clubs: Record<string, ClubRuntime>, seed: number): Record<string, ClubRuntime> {
  const next = { ...clubs };
  for (const team of seedChampionship.teams) {
    next[team.id] ??= createManagedClub(team.id, seed);
  }
  return next;
}

export function seedRivals(userClubId: string, seed: number): Record<string, ClubRuntime> {
  const rivals: Record<string, ClubRuntime> = {};
  for (const id of managedTeamIds(userClubId)) {
    rivals[id] = createManagedClub(id, seed);
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
  if (isInjured(condition)) score -= 1000;
  if (slotIndex !== 0 && condition) {
    if (isOvertrained(condition)) score -= 48;
    else if (fitness <= 32) score -= 24;
    else if (fitness <= 42) score -= 10;
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
}): TeamSheet {
  const squad = ratedSquad(options.teamId, options.seed);
  const preferred = options.lastSheet ?? defaultSheet(options.teamId);
  const extra = options.extraNames ?? [];
  const seated = sitInjuredPlayers(preferred, squad, options.condition, extra);
  const unavailable = new Set([
    ...extra,
    ...squad.filter((player) => isInjured(options.condition[player.name])).map((player) => player.name),
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
    const pick = ranked[0]?.name ?? incumbent;
    if (!pick) continue;
    starters.push(pick);
    used.add(pick);
  }
  const remaining = squad.filter((player) => !used.has(player.name) && !unavailable.has(player.name));
  const rankedSubs = [...remaining].sort((left, right) => {
    const leftKeep = seated.subs.includes(left.name) ? 8 : 0;
    const rightKeep = seated.subs.includes(right.name) ? 8 : 0;
    const leftGk = left.position === "GK" ? 6 : 0;
    const rightGk = right.position === "GK" ? 6 : 0;
    return (
      right.ratings.overall + formValue(options.condition[right.name]) * 0.08 + rightKeep + rightGk -
      (left.ratings.overall + formValue(options.condition[left.name]) * 0.08 + leftKeep + leftGk)
    );
  });
  const subs = rankedSubs.slice(0, 5).map((player) => player.name);
  return { starters, subs };
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
  climate?: MatchClimate;
}): Tactics {
  const base = clubTactics(options.teamId);
  const climate = options.climate ?? rollClimate(options.seed, options.matchKey);
  const sheet = options.sheet ?? defaultSheet(options.teamId);
  const condition = options.condition ?? {};
  const opponentSheet = options.opponentSheet ?? defaultSheet(options.opponentId);
  const opponentTactics = options.opponentTactics ?? clubTactics(options.opponentId);
  const ours = sideProfile(options.teamId, sheet, base, condition, options.seed, climate);
  const theirs = sideProfile(options.opponentId, opponentSheet, opponentTactics, {}, options.seed, climate);

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
  const xv = sheetPlayers(options.teamId, sheet, options.seed);
  const target = pickPuckoutTarget(xv, base.puckoutTarget, condition);
  return {
    mentality,
    shape,
    build: clampDial(build + jitter),
    puckout: clampDial(puckout + Math.round(jitter / 2)),
    aggression: clampDial(aggression),
    pressure: clampDial(pressure),
    shooting: clampDial(shooting),
    puckoutTarget: clampDial(puckout) >= 55 ? target?.name : undefined,
  };
}

export function pickCpuHalfPlan(options: {
  teamId: string;
  first: SimulatedMatch;
  side: "home" | "away";
  condition: Record<string, PlayerCondition>;
  seed: number;
}): HalfPlan {
  const ours = options.side === "home";
  const ourScore = ours ? options.first.homeScore : options.first.awayScore;
  const theirScore = ours ? options.first.awayScore : options.first.homeScore;
  const gap = scoreTotal(theirScore) - scoreTotal(ourScore);
  const opening = ours ? options.first.homeSheet : options.first.awaySheet;
  const openingTactics = ours ? options.first.homeTactics : options.first.awayTactics;
  const hurt = injuredNamesFromEvents(options.first.events, options.teamId);
  const sheet = pickCpuSheet({
    teamId: options.teamId,
    condition: options.condition,
    seed: options.seed,
    matchKey: `${options.first.matchId}:second`,
    lastSheet: opening,
    extraNames: hurt,
  });
  let tactics: Tactics = { ...openingTactics };
  if (gap >= 4) {
    tactics = {
      ...tactics,
      mentality: "attacking",
      shape: "traditional",
      shooting: clampDial(Math.min(tactics.shooting, 34)),
      pressure: clampDial(Math.max(tactics.pressure, 62)),
      build: clampDial(Math.min(tactics.build, 48)),
    };
  } else if (gap <= -6) {
    tactics = {
      ...tactics,
      mentality: "contain",
      pressure: clampDial(Math.min(tactics.pressure, 44)),
      shooting: clampDial(Math.max(tactics.shooting, 56)),
    };
  }
  return { tactics, sheet, submittedAt: 0 };
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
  },
): ClubRuntime {
  const squad = ratedSquad(clubId, options.seed);
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
    intensity: club.intensity ?? DEFAULT_INTENSITY,
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
): ClubRuntime {
  if (clubId !== sim.homeId && clubId !== sim.awayId) return club;
  const ours = clubId === sim.homeId;
  const closing = ours ? sim.homeSheet : sim.awaySheet;
  const opening = openingSheet ?? closing;
  const tactics = ours ? sim.homeTactics : sim.awayTactics;
  const ourScore = ours ? sim.homeScore : sim.awayScore;
  const theirScore = ours ? sim.awayScore : sim.homeScore;
  const result =
    scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
  const squad = ratedSquad(clubId, seed);
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
  return {
    ...club,
    tactics,
    condition,
    sheet: sitInjuredPlayers(closing, squad, condition),
    lastSheet: teamworked.lastSheet,
    trainingDue: true,
    sessionsDone: 0,
    weekDeltas: {},
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
}): { home: ClubRuntime; away: ClubRuntime; sim: SimulatedMatch } {
  const matchId = `pre:${options.week}:${options.homeId}:${options.awayId}`;
  const climate = rollClimate(options.seed, matchId);
  const homeSheet = pickCpuSheet({
    teamId: options.homeId,
    condition: options.home.condition,
    seed: options.seed,
    matchKey: matchId,
    lastSheet: options.home.lastSheet ?? options.home.sheet,
  });
  const awaySheet = pickCpuSheet({
    teamId: options.awayId,
    condition: options.away.condition,
    seed: options.seed,
    matchKey: matchId,
    lastSheet: options.away.lastSheet ?? options.away.sheet,
  });
  const homeTactics = pickCpuTactics({
    teamId: options.homeId,
    opponentId: options.awayId,
    seed: options.seed,
    matchKey: matchId,
    sheet: homeSheet,
    condition: options.home.condition,
    opponentSheet: awaySheet,
    opponentTactics: clubTactics(options.awayId),
    climate,
  });
  const awayTactics = pickCpuTactics({
    teamId: options.awayId,
    opponentId: options.homeId,
    seed: options.seed,
    matchKey: matchId,
    sheet: awaySheet,
    condition: options.away.condition,
    opponentSheet: homeSheet,
    opponentTactics: clubTactics(options.homeId),
    climate,
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
    homeSquad: ratedSquad(options.homeId, options.seed),
    awaySquad: ratedSquad(options.awayId, options.seed),
    remainingWeeks: options.remainingWeeks,
    clubId: options.homeId,
    homeName: teamName(options.homeId),
    awayName: teamName(options.awayId),
    period: "full",
    seed: options.seed,
    gameSeed: options.seed,
    climate,
  });
  return {
    home: applySimToClub({ ...options.home, sheet: homeSheet, tactics: homeTactics }, options.homeId, sim, options.seed, "challenge"),
    away: applySimToClub({ ...options.away, sheet: awaySheet, tactics: awayTactics }, options.awayId, sim, options.seed, "challenge"),
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
  },
): Record<string, ClubRuntime> {
  const date = PRESEASON_DATES[options.week - 1] ?? PRESEASON_DATES.at(-1) ?? "";
  let next = { ...clubs };
  for (const clubId of managedIds) {
    let club = next[clubId] ?? createManagedClub(clubId, options.seed);
    club = trainManagedClub(club, clubId, {
      seed: options.seed,
      phase: "preseason",
      preseasonWeek: options.week,
      date,
      remainingWeeks: options.remainingWeeks,
    });
    club = trainManagedClub(club, clubId, {
      seed: options.seed,
      phase: "preseason",
      preseasonWeek: options.week,
      date,
      remainingWeeks: options.remainingWeeks,
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
    });
    next[pair.homeId] = played.home;
    next[pair.awayId] = played.away;
  }
  for (const clubId of managedIds) {
    const club = next[clubId];
    if (!club) continue;
    next[clubId] = {
      ...club,
      sessionsDone: 0,
      trainingDue: options.week >= PRESEASON_WEEKS ? false : true,
      weekDeltas: {},
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
): ClubRuntime {
  const sheet = pickCpuSheet({
    teamId: clubId,
    condition: club.condition,
    seed,
    matchKey: matchId,
    lastSheet: club.lastSheet ?? club.sheet,
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
    climate,
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
}): Record<string, ClubRuntime> {
  let rivals = { ...options.rivals };
  const involved = new Set<string>();
  for (const match of options.matches) {
    if (match.homeId !== options.userClubId) involved.add(match.homeId);
    if (match.awayId !== options.userClubId) involved.add(match.awayId);
  }
  for (const clubId of involved) {
    let club = rivals[clubId] ?? createManagedClub(clubId, options.seed);
    if (club.trainingDue) {
      club = trainManagedClub(club, clubId, {
        seed: options.seed,
        phase: "season",
        preseasonWeek: options.preseasonWeek,
        date: options.date,
        remainingWeeks: options.remainingWeeks,
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
          tactics: opponentIsUser ? options.userTactics : clubTactics(opponentId),
          condition: opponentIsUser ? undefined : opponentClub?.condition,
        },
        match.id,
        options.seed,
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
): Record<string, ClubRuntime> {
  let next = { ...rivals };
  for (const sim of sims) {
    for (const clubId of [sim.homeId, sim.awayId]) {
      if (clubId === skipClubId) continue;
      const club = next[clubId];
      if (!club) continue;
      next[clubId] = applySimToClub(club, clubId, sim, seed);
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
  },
): Record<string, ClubRuntime> {
  const next = { ...rivals };
  for (const [clubId, club] of Object.entries(next)) {
    if (!club.trainingDue) continue;
    next[clubId] = trainManagedClub(club, clubId, {
      seed: options.seed,
      phase: "season",
      preseasonWeek: options.preseasonWeek,
      date: options.date,
      remainingWeeks: options.remainingWeeks,
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
  },
  remainingWeeks: number,
  date: string,
): Record<string, ClubRuntime> {
  const rivals = save.rivals ?? seedRivals(save.clubId, save.seed);
  if (save.phase === "preseason") {
    return tickManagedPreseasonWeek(rivals, managedTeamIds(save.clubId), {
      seed: save.seed,
      week: save.preseasonWeek,
      remainingWeeks,
    });
  }
  return tickRivalsMidweek(rivals, {
    seed: save.seed,
    date,
    remainingWeeks,
    preseasonWeek: save.preseasonWeek,
  });
}
