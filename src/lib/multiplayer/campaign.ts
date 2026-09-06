import { seedChampionship } from "../../data/championship";
import type {
  Campaign,
  Championship,
  ClubRuntime,
  GameSave,
  HalfPlan,
  Match,
  MatchLive,
  NewsItem,
  Seat,
  SimulatedMatch,
  Tactics,
  TeamSheet,
  TrainingFocus,
  WaitHours,
  WeekState,
} from "../../types";
import { compactName } from "../display";
import { championshipFromSave } from "../gameStorage";
import { momentumAt, simulateMatch } from "../matchEngine";
import { combineHalves, reportFromSim } from "../matchStats";
import { applyMatchMood } from "../mood";
import { clubTactics, DEFAULT_TACTICS, defaultSheet, ratedSquad } from "../players";
import { resolveMatchSides, teamById } from "../resolve";
import { nextOpenBatch } from "../schedule";
import { formatScore, formatScoreWithTotal, matchPlayed, scoreTotal, stageLabel } from "../scoring";
import {
  applyMatchFatigue,
  applyTraining,
  defaultCondition,
  ensureCondition,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
  squadNames,
} from "../training";
import { randomCode, randomId } from "./codes";

export const WAIT_OPTIONS: { hours: WaitHours; label: string }[] = [
  { hours: 0, label: "Until everyone is ready" },
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
];

function newsId(now: number): string {
  return `${now}-${Math.random().toString(16).slice(2)}`;
}

function emptyWeek(): WeekState {
  return { locked: false, deadlineAt: null, ready: {}, lives: {} };
}

function bump(campaign: Campaign): Campaign {
  return { ...campaign, revision: campaign.revision + 1 };
}

function openDeadline(waitHours: WaitHours, now: number): number | null {
  if (!waitHours) return null;
  return now + waitHours * 60 * 60 * 1000;
}

function newClub(clubId: string): ClubRuntime {
  return {
    tactics: DEFAULT_TACTICS,
    sheet: defaultSheet(clubId),
    condition: ensureCondition(squadNames(clubId), {}, defaultCondition()),
    inbox: [],
    trainingDue: true,
  };
}

export function waitLabel(hours: WaitHours): string {
  return WAIT_OPTIONS.find((option) => option.hours === hours)?.label ?? "Until everyone is ready";
}

export function createCampaign(options: {
  hostPlayerId: string;
  hostName: string;
  clubId: string;
  waitHours: WaitHours;
  now?: number;
  seed?: number;
  code?: string;
}): Campaign {
  const now = options.now ?? Date.now();
  const championship = structuredClone(seedChampionship);
  return {
    version: 1,
    id: randomId(),
    code: options.code ?? randomCode(),
    revision: 1,
    seed: options.seed ?? Math.floor(Math.random() * 1_000_000_000),
    hostPlayerId: options.hostPlayerId,
    waitHours: options.waitHours,
    createdAt: now,
    seats: [{ playerId: options.hostPlayerId, name: options.hostName.trim() || "Host", clubId: options.clubId }],
    phase: "lobby",
    preseasonWeek: 1,
    matches: championship.matches.map((match) => ({
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
    reports: {},
    clubs: {},
    week: emptyWeek(),
  };
}

export function takenClubIds(campaign: Campaign): string[] {
  return campaign.seats.map((seat) => seat.clubId);
}

export function seatByPlayer(campaign: Campaign, playerId: string): Seat | undefined {
  return campaign.seats.find((seat) => seat.playerId === playerId);
}

export function seatByClub(campaign: Campaign, clubId: string): Seat | undefined {
  return campaign.seats.find((seat) => seat.clubId === clubId);
}

export function isHumanClub(campaign: Campaign, clubId: string): boolean {
  return campaign.seats.some((seat) => seat.clubId === clubId);
}

export function addSeat(
  campaign: Campaign,
  seat: Seat,
): { ok: true; campaign: Campaign } | { ok: false; error: string } {
  if (campaign.phase !== "lobby") return { ok: false, error: "This championship has already started." };
  if (campaign.seats.some((item) => item.playerId === seat.playerId)) {
    return { ok: false, error: "You are already in this championship." };
  }
  if (campaign.seats.some((item) => item.clubId === seat.clubId)) {
    return { ok: false, error: "That club is already taken." };
  }
  if (campaign.seats.length >= 16) return { ok: false, error: "The lobby is full." };
  const name = seat.name.trim() || "Manager";
  return {
    ok: true,
    campaign: bump({
      ...campaign,
      seats: [...campaign.seats, { ...seat, name }],
    }),
  };
}

export function setSeatClub(
  campaign: Campaign,
  playerId: string,
  clubId: string,
): { ok: true; campaign: Campaign } | { ok: false; error: string } {
  if (campaign.phase !== "lobby") return { ok: false, error: "Clubs are locked in." };
  if (campaign.seats.some((item) => item.clubId === clubId && item.playerId !== playerId)) {
    return { ok: false, error: "That club is already taken." };
  }
  if (!campaign.seats.some((item) => item.playerId === playerId)) {
    return { ok: false, error: "You are not in this lobby." };
  }
  return {
    ok: true,
    campaign: bump({
      ...campaign,
      seats: campaign.seats.map((seat) => (seat.playerId === playerId ? { ...seat, clubId } : seat)),
    }),
  };
}

export function setWaitHours(campaign: Campaign, waitHours: WaitHours, playerId: string): Campaign {
  if (campaign.hostPlayerId !== playerId) return campaign;
  return bump({ ...campaign, waitHours });
}

export function startCampaign(
  campaign: Campaign,
  playerId: string,
  now = Date.now(),
): { ok: true; campaign: Campaign } | { ok: false; error: string } {
  if (campaign.hostPlayerId !== playerId) return { ok: false, error: "Only the host can start." };
  if (campaign.phase !== "lobby") return { ok: false, error: "Already under way." };
  if (campaign.seats.length < 2) return { ok: false, error: "Need at least two managers." };
  const clubs: Record<string, ClubRuntime> = {};
  for (const seat of campaign.seats) clubs[seat.clubId] = newClub(seat.clubId);
  return {
    ok: true,
    campaign: bump({
      ...campaign,
      phase: "preseason",
      preseasonWeek: 1,
      clubs,
      week: { ...emptyWeek(), deadlineAt: openDeadline(campaign.waitHours, now) },
    }),
  };
}

export function saveFromCampaign(campaign: Campaign, clubId: string): GameSave {
  const club = campaign.clubs[clubId] ?? newClub(clubId);
  return {
    version: 4,
    clubId,
    seed: campaign.seed,
    tactics: club.tactics,
    sheet: club.sheet,
    matches: campaign.matches,
    inbox: club.inbox,
    phase: campaign.phase === "season" ? "season" : "preseason",
    preseasonWeek: campaign.preseasonWeek,
    condition: club.condition,
    trainingDue: club.trainingDue,
    reports: campaign.reports,
  };
}

export function championshipOf(campaign: Campaign): Championship {
  const clubId = campaign.seats[0]?.clubId ?? seedChampionship.teams[0].id;
  return championshipFromSave(saveFromCampaign(campaign, clubId));
}

export function withClubTactics(campaign: Campaign, clubId: string, tactics: Tactics): Campaign {
  const club = campaign.clubs[clubId];
  if (!club) return campaign;
  return bump({ ...campaign, clubs: { ...campaign.clubs, [clubId]: { ...club, tactics } } });
}

export function withClubSheet(campaign: Campaign, clubId: string, sheet: TeamSheet): Campaign {
  const club = campaign.clubs[clubId];
  if (!club) return campaign;
  return bump({ ...campaign, clubs: { ...campaign.clubs, [clubId]: { ...club, sheet } } });
}

function withClub(campaign: Campaign, clubId: string, club: ClubRuntime): Campaign {
  return { ...campaign, clubs: { ...campaign.clubs, [clubId]: club } };
}

function pushInbox(club: ClubRuntime, items: NewsItem[]): ClubRuntime {
  return { ...club, inbox: [...items, ...club.inbox].slice(0, 40) };
}

export function clubsNeededThisWeek(campaign: Campaign): Seat[] {
  if (campaign.phase === "lobby") return [];
  if (campaign.phase === "preseason") return campaign.seats;
  const championship = championshipOf(campaign);
  const batch = nextOpenBatch(championship);
  if (!batch) return [];
  return campaign.seats.filter((seat) =>
    batch.matches.some((match) => {
      const { homeId, awayId } = resolveMatchSides(championship, match);
      return homeId === seat.clubId || awayId === seat.clubId;
    }),
  );
}

export function waitingOnWeek(campaign: Campaign): Seat[] {
  if (campaign.week.locked || campaign.phase === "lobby") return [];
  return clubsNeededThisWeek(campaign).filter((seat) => !campaign.week.ready[seat.clubId]);
}

export function deadlinePassed(campaign: Campaign, now: number): boolean {
  return campaign.week.deadlineAt != null && now >= campaign.week.deadlineAt;
}

function applyClubTraining(campaign: Campaign, clubId: string, focus: TrainingFocus, now: number): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || !club.trainingDue || campaign.phase === "lobby") return campaign;
  const result = applyTraining(ratedSquad(clubId), club.condition, focus);
  const date =
    campaign.phase === "preseason"
      ? (PRESEASON_DATES[campaign.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "")
      : championshipOf(campaign).matches.find((match) => !matchPlayed(match))?.date ?? "";
  const title = campaign.phase === "preseason" ? `Preseason week ${campaign.preseasonWeek} session` : "Midweek session";
  const nextClub = pushInbox(
    { ...club, condition: result.condition, trainingDue: false },
    [{ id: newsId(now), date, title, body: result.summary }],
  );
  let next = withClub(campaign, clubId, nextClub);
  if (campaign.phase === "preseason") {
    next = {
      ...next,
      week: { ...next.week, ready: { ...next.week.ready, [clubId]: { at: now } } },
    };
  }
  return next;
}

export function trainClub(campaign: Campaign, clubId: string, focus: TrainingFocus, now = Date.now()): Campaign {
  return tickCampaign(bump(applyClubTraining(campaign, clubId, focus, now)), now);
}

export function readyClub(campaign: Campaign, clubId: string, now = Date.now()): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || campaign.phase !== "season" || campaign.week.locked) return campaign;
  if (!clubsNeededThisWeek(campaign).some((seat) => seat.clubId === clubId)) return campaign;
  const next = bump({
    ...campaign,
    week: { ...campaign.week, ready: { ...campaign.week.ready, [clubId]: { at: now } } },
  });
  return tickCampaign(next, now);
}

export function unreadyClub(campaign: Campaign, clubId: string): Campaign {
  if (campaign.week.locked || !campaign.week.ready[clubId]) return campaign;
  const ready = { ...campaign.week.ready };
  delete ready[clubId];
  return bump({ ...campaign, week: { ...campaign.week, ready } });
}

export function forceAdvance(campaign: Campaign, playerId: string, now = Date.now()): Campaign {
  if (campaign.hostPlayerId !== playerId || campaign.phase === "lobby") return campaign;
  return tickCampaign(
    { ...campaign, week: { ...campaign.week, deadlineAt: now - 1 } },
    now,
  );
}

function fillMissingReady(campaign: Campaign, now: number): Campaign {
  let next = campaign;
  for (const seat of waitingOnWeek(next)) {
    const club = next.clubs[seat.clubId];
    if (!club) continue;
    if (next.phase === "preseason" && club.trainingDue) {
      next = applyClubTraining(next, seat.clubId, "skills", now);
    } else {
      next = {
        ...next,
        week: { ...next.week, ready: { ...next.week.ready, [seat.clubId]: { at: now } } },
      };
    }
  }
  return next;
}

function lockMatchday(campaign: Campaign, now: number): Campaign {
  const championship = championshipOf(campaign);
  const batch = nextOpenBatch(championship);
  if (!batch) {
    return bump({ ...campaign, week: { ...emptyWeek(), deadlineAt: openDeadline(campaign.waitHours, now) } });
  }
  const lives: Record<string, MatchLive> = {};
  let matches = campaign.matches;
  let reports = { ...campaign.reports };
  for (const match of batch.matches) {
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (!homeId || !awayId) continue;
    const humans = [homeId, awayId].filter((id) => isHumanClub(campaign, id));
    const sim = simulateSides(campaign, match, homeId, awayId, humans.length > 0 ? "first" : "full");
    if (humans.length === 0) {
      matches = writeMatch(matches, sim);
      reports[sim.matchId] = reportFromSim(sim);
    } else {
      lives[match.id] = { matchId: match.id, first: sim };
    }
  }
  return bump({
    ...campaign,
    matches,
    reports,
    week: {
      locked: true,
      deadlineAt: openDeadline(campaign.waitHours, now),
      ready: campaign.week.ready,
      lives,
    },
  });
}

function lockPreseason(campaign: Campaign, now: number): Campaign {
  const week = campaign.preseasonWeek + 1;
  const clubs = { ...campaign.clubs };
  const championshipWeek = week > PRESEASON_WEEKS;
  for (const seat of campaign.seats) {
    const club = clubs[seat.clubId];
    if (!club) continue;
    if (championshipWeek) {
      clubs[seat.clubId] = pushInbox(
        { ...club, trainingDue: false },
        [
          {
            id: newsId(now),
            date: "2026-07-23",
            title: "Championship week",
            body: "Preseason is over. Pick your fifteen — the first championship day waits on every manager.",
          },
        ],
      );
    } else {
      clubs[seat.clubId] = { ...club, trainingDue: true };
    }
  }
  return bump({
    ...campaign,
    phase: championshipWeek ? "season" : "preseason",
    preseasonWeek: week,
    clubs,
    week: {
      ...emptyWeek(),
      deadlineAt: openDeadline(campaign.waitHours, now),
    },
  });
}

function simulateSides(
  campaign: Campaign,
  match: Match,
  homeId: string,
  awayId: string,
  period: "first" | "second" | "full",
  extras?: {
    homeTactics?: Tactics;
    awayTactics?: Tactics;
    homeSheet?: TeamSheet;
    awaySheet?: TeamSheet;
    start?: SimulatedMatch;
  },
): SimulatedMatch {
  const homeClub = campaign.clubs[homeId];
  const awayClub = campaign.clubs[awayId];
  const championship = championshipOf(campaign);
  const homeTeam = teamById(championship, homeId);
  const awayTeam = teamById(championship, awayId);
  const first = extras?.start;
  return simulateMatch({
    matchId: match.id,
    homeId,
    awayId,
    homeSheet: extras?.homeSheet ?? homeClub?.sheet ?? defaultSheet(homeId),
    awaySheet: extras?.awaySheet ?? awayClub?.sheet ?? defaultSheet(awayId),
    homeTactics: extras?.homeTactics ?? homeClub?.tactics ?? clubTactics(homeId),
    awayTactics: extras?.awayTactics ?? awayClub?.tactics ?? clubTactics(awayId),
    homeCondition: homeClub?.condition,
    awayCondition: awayClub?.condition,
    clubId: homeClub ? homeId : awayClub ? awayId : homeId,
    homeName: homeTeam ? compactName(homeTeam) : homeId,
    awayName: awayTeam ? compactName(awayTeam) : awayId,
    period,
    seed: campaign.seed,
    climate: first?.climate,
    startHome: first?.homeScore,
    startAway: first?.awayScore,
    startMomentum: first ? momentumAt(first.events) : undefined,
  });
}

function writeMatch(
  matches: Campaign["matches"],
  sim: SimulatedMatch,
): Campaign["matches"] {
  return matches.map((item) =>
    item.id === sim.matchId ? { ...item, homeScore: sim.homeScore, awayScore: sim.awayScore } : item,
  );
}

function finishSim(campaign: Campaign, sim: SimulatedMatch, first: SimulatedMatch): Campaign {
  const championship = championshipOf(campaign);
  const match = championship.matches.find((item) => item.id === sim.matchId);
  const homeTeam = teamById(championship, sim.homeId);
  const awayTeam = teamById(championship, sim.awayId);
  const date = match?.date ?? "";
  const headline = `${homeTeam?.name ?? "Home"} ${formatScore(sim.homeScore)} ${awayTeam?.name ?? "Away"} ${formatScore(sim.awayScore)}`;
  const elsewhere = `${match ? stageLabel(match.stage, match.round) : "Championship day"} elsewhere is in.`;
  let clubs = { ...campaign.clubs };
  for (const seat of campaign.seats) {
    const club = clubs[seat.clubId];
    if (!club) continue;
    const played = seat.clubId === sim.homeId || seat.clubId === sim.awayId;
    if (played) {
      const ours = seat.clubId === sim.homeId;
      const ourScore = ours ? sim.homeScore : sim.awayScore;
      const theirScore = ours ? sim.awayScore : sim.homeScore;
      const result =
        scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
      const opening = ours ? first.homeSheet : first.awaySheet;
      const closing = ours ? sim.homeSheet : sim.awaySheet;
      const tactics = ours ? sim.homeTactics : sim.awayTactics;
      let condition = applyMatchFatigue(club.condition, closing.starters, closing.subs, tactics, ratedSquad(seat.clubId));
      condition = applyMatchMood(condition, ratedSquad(seat.clubId), opening, closing, sim.players, result);
      clubs[seat.clubId] = pushInbox(
        { ...club, condition, trainingDue: true },
        [
          {
            id: newsId(Date.now()),
            date,
            title: headline,
            body: `${homeTeam ? compactName(homeTeam) : "Home"} ${formatScoreWithTotal(sim.homeScore)} to ${formatScoreWithTotal(sim.awayScore)}. Coach: ${sim.coachReport.join(" ")}`,
            matchId: sim.matchId,
          },
        ],
      );
    } else {
      clubs[seat.clubId] = pushInbox(club, [{ id: newsId(Date.now()), date, title: headline, body: elsewhere, matchId: sim.matchId }]);
    }
  }
  return {
    ...campaign,
    matches: writeMatch(campaign.matches, sim),
    reports: { ...campaign.reports, [sim.matchId]: reportFromSim(sim) },
    clubs,
  };
}

function autoPlan(campaign: Campaign, clubId: string, first: SimulatedMatch, side: "home" | "away"): HalfPlan {
  const club = campaign.clubs[clubId];
  return {
    tactics: club?.tactics ?? (side === "home" ? first.homeTactics : first.awayTactics),
    sheet: club?.sheet ?? (side === "home" ? first.homeSheet : first.awaySheet),
    submittedAt: 0,
  };
}

function tryCompleteLive(campaign: Campaign, matchId: string): Campaign {
  const live = campaign.week.lives[matchId];
  if (!live || live.combined) return campaign;
  const championship = championshipOf(campaign);
  const match = championship.matches.find((item) => item.id === matchId);
  if (!match) return campaign;
  const homeHuman = isHumanClub(campaign, live.first.homeId);
  const awayHuman = isHumanClub(campaign, live.first.awayId);
  let homePlan = live.homeSecond;
  let awayPlan = live.awaySecond;
  if (homeHuman && !homePlan) return campaign;
  if (awayHuman && !awayPlan) return campaign;
  if (!homeHuman) homePlan = autoPlan(campaign, live.first.homeId, live.first, "home");
  if (!awayHuman) awayPlan = autoPlan(campaign, live.first.awayId, live.first, "away");
  if (!homePlan || !awayPlan) return campaign;
  const second = simulateSides(campaign, match, live.first.homeId, live.first.awayId, "second", {
    homeTactics: homePlan.tactics,
    awayTactics: awayPlan.tactics,
    homeSheet: homePlan.sheet,
    awaySheet: awayPlan.sheet,
    start: live.first,
  });
  const homeTeam = teamById(championship, live.first.homeId);
  const awayTeam = teamById(championship, live.first.awayId);
  const combined = combineHalves(live.first, second, {
    clubId: homeHuman ? live.first.homeId : live.first.awayId,
    homeName: homeTeam ? compactName(homeTeam) : "Home",
    awayName: awayTeam ? compactName(awayTeam) : "Away",
  });
  const withLive: Campaign = {
    ...campaign,
    week: {
      ...campaign.week,
      lives: {
        ...campaign.week.lives,
        [matchId]: { ...live, homeSecond: homePlan, awaySecond: awayPlan, combined },
      },
    },
  };
  const finished = finishSim(withLive, combined, live.first);
  return bump({ ...finished, revision: campaign.revision });
}

function fillMissingSecondHalves(campaign: Campaign): Campaign {
  let next = campaign;
  for (const live of Object.values(next.week.lives)) {
    if (live.combined) continue;
    const homeHuman = isHumanClub(next, live.first.homeId);
    const awayHuman = isHumanClub(next, live.first.awayId);
    let lives = next.week.lives[live.matchId];
    if (homeHuman && !lives.homeSecond) {
      lives = { ...lives, homeSecond: autoPlan(next, live.first.homeId, live.first, "home") };
    }
    if (awayHuman && !lives.awaySecond) {
      lives = { ...lives, awaySecond: autoPlan(next, live.first.awayId, live.first, "away") };
    }
    next = { ...next, week: { ...next.week, lives: { ...next.week.lives, [live.matchId]: lives } } };
    next = tryCompleteLive(next, live.matchId);
  }
  return next;
}

function closeBatchIfDone(campaign: Campaign, now: number): Campaign {
  if (!campaign.week.locked) return campaign;
  const lives = Object.values(campaign.week.lives);
  if (lives.some((live) => !live.combined)) return campaign;
  return bump({
    ...campaign,
    week: {
      locked: false,
      deadlineAt: openDeadline(campaign.waitHours, now),
      ready: {},
      lives: campaign.week.lives,
    },
  });
}

export function tickCampaign(campaign: Campaign, now = Date.now()): Campaign {
  if (campaign.phase === "lobby") return campaign;
  let next = campaign;
  if (!next.week.locked) {
    const pending = waitingOnWeek(next);
    if (pending.length === 0 || deadlinePassed(next, now)) {
      if (pending.length > 0) next = fillMissingReady(next, now);
      next = next.phase === "preseason" ? lockPreseason(next, now) : lockMatchday(next, now);
    }
    if (next.week.locked) next = closeBatchIfDone(next, now);
    return next;
  }
  if (deadlinePassed(next, now)) next = fillMissingSecondHalves(next);
  return closeBatchIfDone(next, now);
}

export function submitSecondHalf(
  campaign: Campaign,
  clubId: string,
  matchId: string,
  tactics: Tactics,
  sheet: TeamSheet,
  now = Date.now(),
): Campaign {
  const live = campaign.week.lives[matchId];
  if (!live || live.combined) return campaign;
  const side = live.first.homeId === clubId ? "home" : live.first.awayId === clubId ? "away" : null;
  if (!side) return campaign;
  const plan: HalfPlan = { tactics, sheet, submittedAt: now };
  const updated: MatchLive =
    side === "home" ? { ...live, homeSecond: plan } : { ...live, awaySecond: plan };
  const withPlan = bump({
    ...withClub(campaign, clubId, { ...(campaign.clubs[clubId] ?? newClub(clubId)), tactics, sheet }),
    week: { ...campaign.week, lives: { ...campaign.week.lives, [matchId]: updated } },
  });
  return tickCampaign(tryCompleteLive(withPlan, matchId), now);
}

export function waitingOnSecondHalf(campaign: Campaign, matchId: string): Seat[] {
  const live = campaign.week.lives[matchId];
  if (!live || live.combined) return [];
  const waiting: Seat[] = [];
  if (isHumanClub(campaign, live.first.homeId) && !live.homeSecond) {
    const seat = seatByClub(campaign, live.first.homeId);
    if (seat) waiting.push(seat);
  }
  if (isHumanClub(campaign, live.first.awayId) && !live.awaySecond) {
    const seat = seatByClub(campaign, live.first.awayId);
    if (seat) waiting.push(seat);
  }
  return waiting;
}

export function liveForClub(campaign: Campaign, clubId: string): MatchLive | undefined {
  return Object.values(campaign.week.lives).find(
    (live) => live.first.homeId === clubId || live.first.awayId === clubId,
  );
}

export function secondHalfReady(campaign: Campaign, matchId: string): boolean {
  const live = campaign.week.lives[matchId];
  return Boolean(live?.combined);
}

export function formatDeadline(deadlineAt: number | null, now: number): string {
  if (deadlineAt == null) return "The host will wait until everyone is ready.";
  const ms = deadlineAt - now;
  if (ms <= 0) return "The window has closed — missing managers will be filled in.";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} left to respond.`;
  }
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left to respond.`;
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${minutes} minute${minutes === 1 ? "" : "s"} left to respond.`;
}
