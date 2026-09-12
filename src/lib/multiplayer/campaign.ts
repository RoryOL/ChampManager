import { seedChampionship } from "../../data/championship";
import type {
  Campaign,
  Championship,
  ClubRuntime,
  Difficulty,
  GameSave,
  SquadBalance,
  HalfPlan,
  Match,
  MatchLive,
  MatchPeriod,
  MatchPrep,
  NewsItem,
  Seat,
  SimulatedMatch,
  Tactics,
  TeamSheet,
  TrainingPlans,
  WaitHours,
  WeekSession,
  WeekShape,
  WeekState,
  SeasonWrap,
} from "../../types";
import { compactName } from "../display";
import { briefingNews } from "../briefing";
import { championshipFromSave, SAVE_VERSION } from "../gameStorage";
import { DEFAULT_DIFFICULTY, matchBoostsFor, migrateDifficulty } from "../difficulty";
import { DEFAULT_BALANCE, migrateBalance } from "../balance";
import {
  applySimToClub,
  createManagedClub,
  ensureManagedClubs,
  pickCpuHalfPlan,
  prepareManagedClubForMatch,
  restAndPrepManagedClub,
  tickManagedPreseasonWeek,
} from "../aiManager";
import { momentumAt, bookedNamesFromEvents, sentOffNamesFromEvents, simulateMatch, straightRedNamesFromEvents, applyKnockoutExtraTime } from "../matchEngine";
import { insertReplay, knockoutNeedsExtraTime, replayFixture } from "../knockout";
import {
  applyInjury,
  applyMatchSuspensions,
  closingSheetOf,
  injuredNamesFromEvents,
  keepClubSheet,
  remainingInjuryBudget,
  sitInjuredPlayers,
  type RolledInjury,
} from "../injuries";
import { combineHalves, reportFromSim } from "../matchStats";
import { applyMatchForm, withStartingForm } from "../form";
import {
  ambitionFor,
  chairmanAfterMatch,
  chairmanWelcome,
  elsewhereRoundup,
  injuryNews,
  localPressItem,
  matchReportItem,
  newsItem,
  remainingWeeks,
  recoveryNews,
} from "../news";
import { clubTactics, DEFAULT_TACTICS, defaultSheet, expandSheetToPanel, ratedSquad } from "../players";
import { prependHalfTimeSubs, remainingMatchSubs } from "../subs";
import { resolveMatchSides, teamById } from "../resolve";
import { nextBatch } from "../schedule";
import { formatScore, matchPlayed, scoreTotal, stageLabel } from "../scoring";
import { groupIsComplete } from "../standings";
import {
  applyMatchFatigue,
  applyTeamwork,
  applyFullTrainingWeek,
  applyWeekSession,
  defaultCondition,
  DEFAULT_INTENSITY,
  DEFAULT_WEEK_SHAPE,
  ensureCondition,
  matchPrepSummary,
  matchPrepTitle,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
  recoverAfterMatch,
  recoverBetweenMatches,
  squadNames,
  weekCoachCopy,
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

export function withSeasonWrap(campaign: Campaign, seasonWrap: SeasonWrap): Campaign {
  return bump({ ...campaign, seasonWrap });
}

function openDeadline(waitHours: WaitHours, now: number): number | null {
  if (!waitHours) return null;
  return now + waitHours * 60 * 60 * 1000;
}

function newClub(clubId: string, seed = 1): ClubRuntime {
  const names = squadNames(clubId, seed);
  return {
    tactics: DEFAULT_TACTICS,
    sheet: defaultSheet(clubId),
    condition: withStartingForm(ensureCondition(names, {}, defaultCondition()), names, seed),
    inbox: [],
    trainingDue: true,
    plans: {},
    intensity: DEFAULT_INTENSITY,
    weekShape: DEFAULT_WEEK_SHAPE,
    sessionsDone: 0,
    trainingDeltas: {},
    weekDeltas: {},
    preseasonWeek: 1,
  };
}

function withAllClubs(campaign: Campaign): Campaign {
  return { ...campaign, clubs: ensureManagedClubs(campaign.clubs, campaign.seed, campaignBalance(campaign)) };
}

export function waitLabel(hours: WaitHours): string {
  return WAIT_OPTIONS.find((option) => option.hours === hours)?.label ?? "Until everyone is ready";
}

export function createCampaign(options: {
  hostPlayerId: string;
  hostName: string;
  clubId: string;
  waitHours: WaitHours;
  difficulty?: Difficulty;
  balance?: SquadBalance;
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
    difficulty: migrateDifficulty(options.difficulty ?? DEFAULT_DIFFICULTY),
    balance: migrateBalance(options.balance ?? DEFAULT_BALANCE),
    createdAt: now,
    seats: [{ playerId: options.hostPlayerId, name: options.hostName.trim() || "Host", clubId: options.clubId }],
    phase: "lobby",
    preseasonWeek: 1,
    matches: championship.matches.map((match) => ({
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
    extraMatches: [],
    reports: {},
    clubs: {},
    week: emptyWeek(),
  };
}

export function campaignDifficulty(campaign: Campaign): Difficulty {
  return migrateDifficulty(campaign.difficulty);
}

export function campaignBalance(campaign: Campaign): SquadBalance {
  return migrateBalance(campaign.balance);
}

export function withCampaignDefaults(campaign: Campaign): Campaign {
  const clubs = { ...campaign.clubs };
  for (const [clubId, club] of Object.entries(clubs)) {
    if (club.preseasonWeek == null) {
      clubs[clubId] = { ...club, preseasonWeek: campaign.preseasonWeek };
    }
  }
  return {
    ...campaign,
    difficulty: campaignDifficulty(campaign),
    balance: campaignBalance(campaign),
    clubs,
  };
}

export function clubPreseasonWeek(campaign: Campaign, clubId: string): number {
  return campaign.clubs[clubId]?.preseasonWeek ?? campaign.preseasonWeek ?? 1;
}

export function clubInSeason(campaign: Campaign, clubId: string): boolean {
  return clubPreseasonWeek(campaign, clubId) > PRESEASON_WEEKS;
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
  void now;
  let clubs: Record<string, ClubRuntime> = {};
  const date = PRESEASON_DATES[0] ?? "";
  const seated = new Map(campaign.seats.map((seat) => [seat.clubId, seat]));
  for (const team of seedChampionship.teams) {
    const seat = seated.get(team.id);
    if (seat) {
      const club = newClub(team.id, campaign.seed);
      const welcome = chairmanWelcome({ club: team, seed: campaign.seed, date });
      clubs[team.id] = pushInbox(club, [{ ...welcome.item, id: `${welcome.item.id}:${seat.clubId}` }]);
    } else {
      clubs[team.id] = createManagedClub(team.id, campaign.seed, campaignBalance(campaign));
    }
  }
  const managedIds = seedChampionship.teams.map((team) => team.id).filter((id) => !seated.has(id));
  for (let week = 1; week <= PRESEASON_WEEKS; week += 1) {
    clubs = tickManagedPreseasonWeek(clubs, managedIds, {
      seed: campaign.seed,
      week,
      remainingWeeks: Math.max(1, PRESEASON_WEEKS - week + 4),
      difficulty: campaignDifficulty(campaign),
      reports: campaign.reports,
      balance: campaignBalance(campaign),
    });
  }
  for (const clubId of managedIds) {
    const club = clubs[clubId];
    if (club) clubs[clubId] = { ...club, preseasonWeek: PRESEASON_WEEKS + 1 };
  }
  return {
    ok: true,
    campaign: bump({
      ...campaign,
      phase: "preseason",
      preseasonWeek: 1,
      clubs,
      week: emptyWeek(),
    }),
  };
}

export function saveFromCampaign(campaign: Campaign, clubId: string): GameSave {
  const club = campaign.clubs[clubId] ?? newClub(clubId, campaign.seed);
  return {
    version: SAVE_VERSION,
    clubId,
    seed: campaign.seed,
    difficulty: campaignDifficulty(campaign),
    balance: campaignBalance(campaign),
    tactics: club.tactics,
    sheet: expandSheetToPanel(clubId, club.sheet, campaign.seed),
    matches: campaign.matches,
    extraMatches: campaign.extraMatches ?? [],
    inbox: club.inbox,
    phase: clubPreseasonWeek(campaign, clubId) > PRESEASON_WEEKS ? "season" : "preseason",
    preseasonWeek: clubPreseasonWeek(campaign, clubId),
    condition: withStartingForm(club.condition, squadNames(clubId, campaign.seed), campaign.seed),
    trainingDue: club.trainingDue,
    reports: campaign.reports,
    ambition: ambitionFor(clubId).target,
    plans: club.plans ?? {},
    lastSheet: club.lastSheet ? expandSheetToPanel(clubId, club.lastSheet, campaign.seed) : club.lastSheet,
    intensity: club.intensity ?? DEFAULT_INTENSITY,
    weekShape: club.weekShape ?? DEFAULT_WEEK_SHAPE,
    sessionsDone: club.sessionsDone ?? 0,
    trainingDeltas: club.trainingDeltas ?? {},
    weekDeltas: club.weekDeltas ?? {},
    rivals: Object.fromEntries(Object.entries(campaign.clubs).filter(([id]) => id !== clubId)),
    nextMatchPrep: club.nextMatchPrep,
    seasonWrap: campaign.seasonWrap,
  };
}

export function championshipOf(campaign: Campaign): Championship {
  const clubId = campaign.seats[0]?.clubId ?? seedChampionship.teams[0].id;
  return championshipFromSave(saveFromCampaign(campaign, clubId));
}

export function withClubTactics(campaign: Campaign, clubId: string, tactics: Tactics): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || preMatchTacticsLocked(campaign, clubId)) return campaign;
  return bump({ ...campaign, clubs: { ...campaign.clubs, [clubId]: { ...club, tactics } } });
}

export function withClubSheet(campaign: Campaign, clubId: string, sheet: TeamSheet): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || preMatchTacticsLocked(campaign, clubId)) return campaign;
  return bump({ ...campaign, clubs: { ...campaign.clubs, [clubId]: { ...club, sheet } } });
}

export function withClubPlans(campaign: Campaign, clubId: string, plans: TrainingPlans): Campaign {
  const club = campaign.clubs[clubId];
  if (!club) return campaign;
  return bump({ ...campaign, clubs: { ...campaign.clubs, [clubId]: { ...club, plans } } });
}

export function withClubTraining(
  campaign: Campaign,
  clubId: string,
  prefs: Partial<Pick<ClubRuntime, "intensity" | "weekShape" | "plans">>,
): Campaign {
  const club = campaign.clubs[clubId];
  if (!club) return campaign;
  return bump({ ...campaign, clubs: { ...campaign.clubs, [clubId]: { ...club, ...prefs } } });
}

function withClub(campaign: Campaign, clubId: string, club: ClubRuntime): Campaign {
  return { ...campaign, clubs: { ...campaign.clubs, [clubId]: club } };
}

function pushInbox(club: ClubRuntime, items: NewsItem[]): ClubRuntime {
  return { ...club, inbox: [...items, ...club.inbox].slice(0, 40) };
}

function sidesFixed(championship: Championship, match: Match): { homeId: string; awayId: string } | null {
  for (const ref of [match.home, match.away]) {
    if (ref.type === "group-position" && !groupIsComplete(championship.matches, ref.groupId)) return null;
    if (ref.type === "winner" || ref.type === "loser") {
      const source = championship.matches.find((item) => item.id === ref.matchId);
      if (!source || !matchPlayed(source)) return null;
    }
  }
  const { homeId, awayId } = resolveMatchSides(championship, match);
  if (!homeId || !awayId) return null;
  return { homeId, awayId };
}

function sameWeekend(left: Match, right: Match): boolean {
  if (left.stage === "group") return right.stage === "group" && right.round === left.round;
  return right.stage === left.stage;
}

export function nextMatchForClub(campaign: Campaign, clubId: string): Match | undefined {
  const championship = championshipOf(campaign);
  return championship.matches.find((match) => {
    if (matchPlayed(match)) return false;
    if (match.home.type === "team" && match.home.teamId === clubId) return true;
    if (match.away.type === "team" && match.away.teamId === clubId) return true;
    if (match.home.type !== "team" || match.away.type !== "team") {
      const { homeId, awayId } = resolveMatchSides(championship, match);
      return homeId === clubId || awayId === clubId;
    }
    return false;
  });
}

function opponentIdFor(match: { homeId: string; awayId: string }, clubId: string): string {
  return match.homeId === clubId ? match.awayId : match.homeId;
}

function matchProgress(match: Match): number {
  if (match.stage === "group") return match.round ?? 1;
  if (match.stage === "quarter-final" || match.stage === "relegation-semi") return 10;
  if (match.stage === "semi-final" || match.stage === "relegation-final") return 11;
  return 12;
}

export function waitingOnEarlierRound(campaign: Campaign, clubId: string): Seat[] {
  const mine = nextMatchForClub(campaign, clubId);
  if (!mine) return [];
  const championship = championshipOf(campaign);
  const ahead = matchProgress(mine);
  return campaign.seats.flatMap((seat) => {
    if (seat.clubId === clubId) return [];
    if (!clubInSeason(campaign, seat.clubId)) {
      return campaign.phase === "season" ? [seat] : [];
    }
    const live = liveForClub(campaign, seat.clubId);
    if (live) {
      const row = championship.matches.find((match) => match.id === live.matchId);
      if (!row || matchPlayed(row)) return [];
      return matchProgress(row) < ahead ? [seat] : [];
    }
    const theirNext = nextMatchForClub(campaign, seat.clubId);
    if (!theirNext) return [];
    return matchProgress(theirNext) < ahead ? [seat] : [];
  });
}

export function nextHumanMatchIsPvp(campaign: Campaign, clubId: string): boolean {
  const match = nextMatchForClub(campaign, clubId);
  if (!match) return false;
  const sides = sidesFixed(championshipOf(campaign), match);
  if (!sides) return false;
  return isHumanClub(campaign, opponentIdFor(sides, clubId));
}

export function preMatchTacticsLocked(campaign: Campaign, clubId: string): boolean {
  if (liveForClub(campaign, clubId)) return false;
  if (!campaign.week.ready[clubId]) return false;
  return nextHumanMatchIsPvp(campaign, clubId);
}

export function clubsNeededThisWeek(campaign: Campaign): Seat[] {
  if (campaign.phase === "lobby") return [];
  return campaign.seats.filter((seat) => {
    if (!clubInSeason(campaign, seat.clubId)) return false;
    const match = nextMatchForClub(campaign, seat.clubId);
    if (!match) return false;
    return Boolean(sidesFixed(championshipOf(campaign), match));
  });
}

export function waitingOnWeek(campaign: Campaign): Seat[] {
  return waitingOnClub(campaign, campaign.seats[0]?.clubId ?? "");
}

export function waitingOnClub(campaign: Campaign, clubId: string): Seat[] {
  if (campaign.phase === "lobby" || !clubId) return [];
  const live = liveForClub(campaign, clubId);
  if (live) return waitingOnSecondHalf(campaign, live.matchId).filter((seat) => seat.clubId !== clubId);
  if (!clubInSeason(campaign, clubId) || !campaign.week.ready[clubId]) return [];
  const match = nextMatchForClub(campaign, clubId);
  if (!match) return [];
  const sides = sidesFixed(championshipOf(campaign), match);
  if (!sides) return [];
  const opponentId = opponentIdFor(sides, clubId);
  if (!isHumanClub(campaign, opponentId) || campaign.week.ready[opponentId]) return [];
  const seat = seatByClub(campaign, opponentId);
  return seat ? [seat] : [];
}

export function deadlinePassed(campaign: Campaign, now: number): boolean {
  return campaign.week.deadlineAt != null && now >= campaign.week.deadlineAt;
}

function resolveSession(focus: WeekSession | "fitness" | "skills" | "setpieces"): WeekSession {
  if (focus === "challenge" || focus === "recovery" || focus === "mixed") return focus;
  return "mixed";
}

function advanceClubPreseason(campaign: Campaign, clubId: string, now: number): Campaign {
  const club = campaign.clubs[clubId];
  if (!club) return campaign;
  const week = clubPreseasonWeek(campaign, clubId);
  if (week >= PRESEASON_WEEKS) {
    const squad = ratedSquad(clubId, campaign);
    const rested = {
      ...club,
      preseasonWeek: PRESEASON_WEEKS + 1,
      condition: recoverBetweenMatches(club.condition, squad),
      trainingDue: true,
      sessionsDone: 0,
      weekDeltas: {},
      nextMatchPrep: undefined,
    };
    const noted = pushInbox(rested, [
      newsItem({
        id: newsId(now),
        kind: "training",
        date: "2026-07-23",
        title: "Championship week",
        body: "Preseason is over. The panel have their legs back. Work one aspect before Round 1, or go straight to the match.",
      }),
    ]);
    const seasoned: Campaign = { ...campaign, phase: "season", clubs: { ...campaign.clubs, [clubId]: noted } };
    return {
      ...seasoned,
      preseasonWeek: Math.max(campaign.preseasonWeek, PRESEASON_WEEKS + 1),
      clubs: { ...seasoned.clubs, [clubId]: withClubBriefing(noted, clubId, seasoned) },
    };
  }
  const nextWeek = week + 1;
  return {
    ...campaign,
    preseasonWeek: Math.max(campaign.preseasonWeek, nextWeek),
    clubs: {
      ...campaign.clubs,
      [clubId]: {
        ...club,
        preseasonWeek: nextWeek,
        trainingDue: true,
        sessionsDone: 0,
        weekDeltas: {},
      },
    },
  };
}

function withClubBriefing(club: ClubRuntime, clubId: string, campaign: Campaign): ClubRuntime {
  if (!clubInSeason(campaign, clubId)) return club;
  const championship = championshipOf(campaign);
  const batch = nextBatch(championship, clubId);
  const match = batch?.userMatch;
  if (!match || matchPlayed(match)) return club;
  const id = `briefing-${match.id}-${clubId}`;
  if (club.inbox.some((item) => item.id === id)) return club;
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const opponentId = homeId === clubId ? awayId : homeId;
  const rival = opponentId ? campaign.clubs[opponentId] : undefined;
  return pushInbox(club, [
    briefingNews({
      clubId,
      match,
      championship,
      tactics: club.tactics,
      sheet: club.sheet,
      condition: club.condition,
      seed: campaign.seed,
      balance: campaignBalance(campaign),
      opponentSheet: rival?.sheet,
      opponentTactics: rival?.tactics,
    }),
  ]);
}

function applyClubTraining(
  campaign: Campaign,
  clubId: string,
  session: WeekSession | "fitness" | "skills" | "setpieces",
  now: number,
): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || !club.trainingDue || clubInSeason(campaign, clubId)) return campaign;
  const week = clubPreseasonWeek(campaign, clubId);
  const weekSession = resolveSession(session);
  const squad = ratedSquad(clubId, campaign);
  const championship = championshipOf(campaign);
  const date = PRESEASON_DATES[week - 1] ?? PRESEASON_DATES.at(-1) ?? "";
  const sessionsDone = club.sessionsDone ?? 0;
  const result = applyWeekSession({
    squad,
    condition: club.condition,
    sheet: club.sheet,
    lastSheet: club.lastSheet,
    plans: club.plans ?? {},
    phase: "preseason",
    preseasonWeek: week,
    sessionsDone,
    intensity: club.intensity ?? DEFAULT_INTENSITY,
    weekShape: club.weekShape ?? DEFAULT_WEEK_SHAPE,
    requestedSession: weekSession,
    seed: campaign.seed,
    weekKey: `${clubId}-preseason-${week}-${date}-${sessionsDone}`,
    remainingWeeks: remainingWeeks(saveFromCampaign(campaign, clubId), championship, clubId),
    weekDeltas: club.weekDeltas ?? {},
  });
  const team = teamById(championship, clubId);
  const total = 3;
  const title = result.weekComplete
    ? `Preseason week ${week} complete`
    : `Preseason week ${week} · session ${sessionsDone + 1} of ${total}`;
  const items: NewsItem[] = [
    ...result.recovered.map((name) => recoveryNews({ name, date, seed: campaign.seed })),
    newsItem({
      id: newsId(now),
      kind: "training",
      date,
      title,
      body: result.summary,
    }),
    ...result.freshInjuries.map((rolled) =>
      injuryNews({
        rolled,
        date,
        seed: campaign.seed,
        key: `train-${date}-${rolled.name}-${sessionsDone}`,
        clubName: team?.name ?? "the club",
      }),
    ),
  ];
  if (result.weekComplete) {
    const coach = weekCoachCopy(
      squad,
      result.weekDeltas,
      `Preseason week ${week}`,
      result.condition,
    );
    items.push(
      newsItem({
        id: `${newsId(now)}-coach`,
        kind: "briefing",
        date,
        title: coach.title,
        body: coach.body,
        tone: coach.tone,
      }),
    );
  }
  let nextClub = pushInbox(
    {
      ...club,
      condition: result.condition,
      sheet: result.sheet,
      trainingDue: result.trainingDue,
      lastSheet: result.lastSheet ?? club.lastSheet,
      sessionsDone: result.sessionsDone,
      trainingDeltas: result.deltas,
      weekDeltas: result.weekComplete ? {} : result.weekDeltas,
      preseasonWeek: week,
    },
    items,
  );
  let next = withClub(campaign, clubId, nextClub);
  if (result.weekComplete) next = advanceClubPreseason(next, clubId, now);
  return next;
}

function applyClubMatchPrep(campaign: Campaign, clubId: string, prep: MatchPrep, now: number): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || !club.trainingDue || !clubInSeason(campaign, clubId)) return campaign;
  const squad = ratedSquad(clubId, campaign);
  const championship = championshipOf(campaign);
  const date = championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
  const condition = recoverBetweenMatches(club.condition, squad);
  const items: NewsItem[] = [
    newsItem({
      id: newsId(now),
      kind: "training",
      date,
      title: matchPrepTitle(prep),
      body: matchPrepSummary(prep),
    }),
  ];
  let nextClub = pushInbox(
    {
      ...club,
      condition,
      nextMatchPrep: prep,
      trainingDue: false,
      sessionsDone: 0,
    },
    items,
  );
  nextClub = withClubBriefing(nextClub, clubId, campaign);
  return withClub(campaign, clubId, nextClub);
}

export function trainClub(
  campaign: Campaign,
  clubId: string,
  session: WeekSession | "fitness" | "skills" | "setpieces" = "mixed",
  now = Date.now(),
): Campaign {
  return tickCampaign(bump(applyClubTraining(campaign, clubId, session, now)), now);
}

export function trainClubPrep(campaign: Campaign, clubId: string, prep: MatchPrep, now = Date.now()): Campaign {
  return tickCampaign(bump(applyClubMatchPrep(campaign, clubId, prep, now)), now);
}

/** Set the week shape and run every remaining session in one go. */
export function trainClubWeek(
  campaign: Campaign,
  clubId: string,
  weekShape: WeekShape,
  now = Date.now(),
): Campaign {
  const shaped = withClubTraining(campaign, clubId, { weekShape });
  const club = shaped.clubs[clubId];
  if (!club || !club.trainingDue || clubInSeason(shaped, clubId)) return shaped;
  const week = clubPreseasonWeek(shaped, clubId);
  const squad = ratedSquad(clubId, shaped);
  const championship = championshipOf(shaped);
  const date = PRESEASON_DATES[week - 1] ?? PRESEASON_DATES.at(-1) ?? "";
  const sessionsDone = club.sessionsDone ?? 0;
  const result = applyFullTrainingWeek({
    squad,
    condition: club.condition,
    sheet: club.sheet,
    lastSheet: club.lastSheet,
    plans: club.plans ?? {},
    phase: "preseason",
    preseasonWeek: week,
    sessionsDone,
    intensity: club.intensity ?? DEFAULT_INTENSITY,
    weekShape,
    requestedSession: "mixed",
    seed: shaped.seed,
    weekKey: `${clubId}-preseason-${week}-${date}-${sessionsDone}`,
    remainingWeeks: remainingWeeks(saveFromCampaign(shaped, clubId), championship, clubId),
    weekDeltas: club.weekDeltas ?? {},
  });
  const team = teamById(championship, clubId);
  const title = `Preseason week ${week} complete`;
  const items: NewsItem[] = [
    ...result.recovered.map((name) => recoveryNews({ name, date, seed: shaped.seed })),
    newsItem({
      id: newsId(now),
      kind: "training",
      date,
      title,
      body: result.summary,
    }),
    ...result.freshInjuries.map((rolled) =>
      injuryNews({
        rolled,
        date,
        seed: shaped.seed,
        key: `train-week-${date}-${rolled.name}`,
        clubName: team?.name ?? "the club",
      }),
    ),
  ];
  if (result.weekComplete) {
    const coach = weekCoachCopy(
      squad,
      result.weekDeltas,
      `Preseason week ${week}`,
      result.condition,
    );
    items.push(
      newsItem({
        id: `${newsId(now)}-coach`,
        kind: "briefing",
        date,
        title: coach.title,
        body: coach.body,
        tone: coach.tone,
      }),
    );
  }
  let nextClub = pushInbox(
    {
      ...club,
      condition: result.condition,
      sheet: result.sheet,
      trainingDue: result.trainingDue,
      lastSheet: result.lastSheet ?? club.lastSheet,
      sessionsDone: result.sessionsDone,
      trainingDeltas: result.deltas,
      weekDeltas: result.weekComplete ? {} : result.weekDeltas,
    },
    items,
  );
  let next = withClub(shaped, clubId, nextClub);
  if (result.weekComplete) next = advanceClubPreseason(next, clubId, now);
  return tickCampaign(bump(next), now);
}

export function readyClub(campaign: Campaign, clubId: string, now = Date.now()): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || !clubInSeason(campaign, clubId) || liveForClub(campaign, clubId)) return campaign;
  if (waitingOnEarlierRound(campaign, clubId).length > 0) return campaign;
  const match = nextMatchForClub(campaign, clubId);
  if (!match || !sidesFixed(championshipOf(campaign), match)) return campaign;
  const pvp = nextHumanMatchIsPvp(campaign, clubId);
  const alreadyReady = Boolean(campaign.week.ready[clubId]);
  let deadlineAt = campaign.week.deadlineAt;
  if (pvp && !alreadyReady && deadlineAt == null) deadlineAt = openDeadline(campaign.waitHours, now);
  const next = bump({
    ...campaign,
    week: { ...campaign.week, deadlineAt, ready: { ...campaign.week.ready, [clubId]: { at: now } } },
  });
  return tickCampaign(next, now);
}

export function unreadyClub(campaign: Campaign, clubId: string): Campaign {
  if (!campaign.week.ready[clubId] || liveForClub(campaign, clubId)) return campaign;
  const ready = { ...campaign.week.ready };
  delete ready[clubId];
  const stillWaiting = Object.keys(ready).some((id) => nextHumanMatchIsPvp(campaign, id));
  return bump({
    ...campaign,
    week: { ...campaign.week, ready, deadlineAt: stillWaiting ? campaign.week.deadlineAt : null },
  });
}

export function forceAdvance(campaign: Campaign, playerId: string, now = Date.now()): Campaign {
  if (campaign.hostPlayerId !== playerId || campaign.phase === "lobby") return campaign;
  return tickCampaign(
    { ...campaign, week: { ...campaign.week, deadlineAt: now - 1 } },
    now,
  );
}

function autoFinishPreseason(campaign: Campaign, clubId: string, now: number): Campaign {
  let next = campaign;
  let guard = 0;
  while (!clubInSeason(next, clubId) && guard < 24) {
    guard += 1;
    const club = next.clubs[clubId];
    if (!club) break;
    const before = clubPreseasonWeek(next, clubId);
    const sessions = club.sessionsDone ?? 0;
    const after = club.trainingDue
      ? applyClubTraining(next, clubId, club.weekShape === "challenge" ? "challenge" : "mixed", now + guard)
      : advanceClubPreseason(next, clubId, now + guard);
    if (after === next && clubPreseasonWeek(after, clubId) === before && (after.clubs[clubId]?.sessionsDone ?? 0) === sessions) {
      next = advanceClubPreseason(next, clubId, now + guard);
      continue;
    }
    next = after;
  }
  return next;
}

function fillBlockingPlayers(campaign: Campaign, now: number): Campaign {
  let next = campaign;
  const championship = championshipOf(next);
  for (const seat of next.seats) {
    if (!next.week.ready[seat.clubId]) continue;
    const match = nextMatchForClub(next, seat.clubId);
    if (!match) continue;
    const sides = sidesFixed(championship, match);
    if (!sides) continue;
    const opponentId = opponentIdFor(sides, seat.clubId);
    if (!isHumanClub(next, opponentId) || next.week.ready[opponentId]) continue;
    next = autoFinishPreseason(next, opponentId, now);
    if (!clubInSeason(next, opponentId)) continue;
    next = {
      ...next,
      week: { ...next.week, ready: { ...next.week.ready, [opponentId]: { at: now } } },
    };
  }
  return next;
}

function prepareCpuForMatch(campaign: Campaign, match: Match, homeId: string, awayId: string): Campaign {
  let clubs = { ...campaign.clubs };
  for (const [clubId, opponentId] of [
    [homeId, awayId],
    [awayId, homeId],
  ] as const) {
    if (isHumanClub(campaign, clubId)) continue;
    let club = clubs[clubId] ?? createManagedClub(clubId, campaign.seed, campaignBalance(campaign));
    if (club.trainingDue) {
      club = restAndPrepManagedClub(club, clubId, {
        seed: campaign.seed,
        balance: campaignBalance(campaign),
        opponentId,
        matchKey: match.id,
      });
    }
    const opponent = clubs[opponentId];
    clubs[clubId] = prepareManagedClubForMatch(
      club,
      clubId,
      {
        id: opponentId,
        sheet: opponent?.sheet ?? defaultSheet(opponentId),
        tactics: isHumanClub(campaign, opponentId)
          ? (opponent?.tactics ?? clubTactics(opponentId, campaignBalance(campaign)))
          : clubTactics(opponentId, campaignBalance(campaign)),
        condition: opponent?.condition,
      },
      match.id,
      campaign.seed,
      undefined,
      { difficulty: campaignDifficulty(campaign), reports: campaign.reports, balance: campaignBalance(campaign) },
    );
  }
  return { ...campaign, clubs };
}

function matchIsNextForBoth(
  campaign: Campaign,
  match: Match,
  homeId: string,
  awayId: string,
): boolean {
  return nextMatchForClub(campaign, homeId)?.id === match.id && nextMatchForClub(campaign, awayId)?.id === match.id;
}

function humansReadyForMatch(campaign: Campaign, homeId: string, awayId: string): boolean {
  const humans = [homeId, awayId].filter((id) => isHumanClub(campaign, id));
  return humans.every((id) => clubInSeason(campaign, id) && Boolean(campaign.week.ready[id]));
}

function startMatch(campaign: Campaign, match: Match, homeId: string, awayId: string, now: number): Campaign {
  if (campaign.week.lives[match.id] || matchPlayed(match)) return campaign;
  let next = prepareCpuForMatch(campaign, match, homeId, awayId);
  const humans = [homeId, awayId].filter((id) => isHumanClub(next, id));
  const period: MatchPeriod = humans.length > 0 ? "first" : "full";
  const sim = simulateSides(next, match, homeId, awayId, period);
  const decorated = decorateHumanMatch(next, sim);
  if (humans.length === 0) {
    return bump(finishSim(next, decorated.sim, decorated.sim, decorated.injuries));
  }
  const championship = championshipOf(next);
  const batch = nextBatch(championship, humans[0] ?? homeId);
  const ready = { ...next.week.ready };
  return bump({
    ...next,
    week: {
      ...next.week,
      locked: true,
      deadlineAt: openDeadline(next.waitHours, now),
      ready,
      lives: {
        ...next.week.lives,
        [match.id]: { matchId: match.id, first: decorated.sim, injuries: decorated.injuries },
      },
      batchLabel: batch?.label ?? next.week.batchLabel,
      batchMatchIds: Array.from(new Set([...(next.week.batchMatchIds ?? []), ...(batch?.matches.map((item) => item.id) ?? [match.id])])),
    },
  });
}

function progressMatches(campaign: Campaign, now: number): Campaign {
  let next = withAllClubs(campaign);
  let guard = 0;
  while (guard < 48) {
    guard += 1;
    const championship = championshipOf(next);
    const match = championship.matches.find((item) => {
      if (matchPlayed(item) || next.week.lives[item.id]) return false;
      const sides = sidesFixed(championship, item);
      if (!sides) return false;
      if (!matchIsNextForBoth(next, item, sides.homeId, sides.awayId)) return false;
      const homeHuman = isHumanClub(next, sides.homeId);
      const awayHuman = isHumanClub(next, sides.awayId);
      if (!homeHuman && !awayHuman) return true;
      return humansReadyForMatch(next, sides.homeId, sides.awayId);
    });
    if (!match) break;
    const sides = sidesFixed(championship, match);
    if (!sides) break;
    const before = next;
    next = startMatch(next, match, sides.homeId, sides.awayId, now);
    if (next === before) break;
  }
  return next;
}

function clubSheet(
  campaign: Campaign,
  clubId: string,
  override?: TeamSheet,
  extraNames: string[] = [],
): TeamSheet {
  const club = campaign.clubs[clubId];
  const sheet = expandSheetToPanel(clubId, override ?? club?.sheet ?? defaultSheet(clubId), campaign.seed);
  return sitInjuredPlayers(sheet, ratedSquad(clubId, campaign), club?.condition ?? {}, extraNames);
}

function mergeInjuryMaps(
  first: Record<string, RolledInjury[]> | undefined,
  second: Record<string, RolledInjury[]>,
): Record<string, RolledInjury[]> {
  const merged: Record<string, RolledInjury[]> = { ...(first ?? {}) };
  for (const [clubId, injuries] of Object.entries(second)) {
    merged[clubId] = [...(merged[clubId] ?? []), ...injuries];
  }
  return merged;
}

function decorateHumanMatch(
  campaign: Campaign,
  sim: SimulatedMatch,
): { sim: SimulatedMatch; injuries: Record<string, RolledInjury[]> } {
  const injuries: Record<string, RolledInjury[]> = {};
  for (const clubId of [sim.homeId, sim.awayId]) {
    if (!isHumanClub(campaign, clubId)) continue;
    const rolled = (sim.matchInjuries ?? [])
      .filter((item) => item.teamId === clubId)
      .map((item) => ({
        name: item.name,
        minute: item.minute,
        injury: item.injury,
        event: {
          minute: item.minute,
          teamId: item.teamId,
          playerName: item.name,
          kind: "injury" as const,
          text: `${item.name} is in trouble with a ${item.injury.ailment}. He's going off.`,
        },
      }));
    if (rolled.length > 0) injuries[clubId] = rolled;
  }
  return { sim, injuries };
}

function simulateSides(
  campaign: Campaign,
  match: Match,
  homeId: string,
  awayId: string,
  period: MatchPeriod,
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
  const homeHurt = first ? injuredNamesFromEvents(first.events, homeId) : [];
  const awayHurt = first ? injuredNamesFromEvents(first.events, awayId) : [];
  return simulateMatch({
    matchId: match.id,
    homeId,
    awayId,
    homeSheet: clubSheet(campaign, homeId, extras?.homeSheet, homeHurt),
    awaySheet: clubSheet(campaign, awayId, extras?.awaySheet, awayHurt),
    homeTactics: extras?.homeTactics ?? homeClub?.tactics ?? clubTactics(homeId, campaignBalance(campaign)),
    awayTactics: extras?.awayTactics ?? awayClub?.tactics ?? clubTactics(awayId, campaignBalance(campaign)),
    homeCondition: homeClub?.condition,
    awayCondition: awayClub?.condition,
    homeSquad: ratedSquad(homeId, campaign),
    awaySquad: ratedSquad(awayId, campaign),
    remainingWeeks: remainingWeeks(saveFromCampaign(campaign, homeClub ? homeId : awayId), championship, homeClub ? homeId : awayId),
    sentOff: first ? sentOffNamesFromEvents(first.events) : undefined,
    booked: first ? bookedNamesFromEvents(first.events) : undefined,
    clubId: homeClub ? homeId : awayClub ? awayId : homeId,
    homeName: homeTeam ? compactName(homeTeam) : homeId,
    awayName: awayTeam ? compactName(awayTeam) : awayId,
    period,
    seed: campaign.seed,
    gameSeed: campaign.seed,
    balance: campaignBalance(campaign),
    climate: first?.climate,
    startHome: first?.homeScore,
    startAway: first?.awayScore,
    startMomentum: first ? momentumAt(first.events) : undefined,
    remainingSubs: first
      ? {
          home: remainingMatchSubs(first.events, homeId, first.homeSheet, extras?.homeSheet ?? first.homeClosingSheet ?? first.homeSheet),
          away: remainingMatchSubs(first.events, awayId, first.awaySheet, extras?.awaySheet ?? first.awayClosingSheet ?? first.awaySheet),
        }
      : undefined,
    injuryBudget: first ? remainingInjuryBudget(first.events, homeId, awayId) : undefined,
    ...matchBoostsFor(
      campaignDifficulty(campaign),
      campaign.seats.map((seat) => seat.clubId),
    ),
    homePrep: homeClub?.nextMatchPrep,
    awayPrep: awayClub?.nextMatchPrep,
    stage: match.stage,
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

function finishSim(
  campaign: Campaign,
  sim: SimulatedMatch,
  first: SimulatedMatch,
  injuriesByClub: Record<string, RolledInjury[]> = {},
): Campaign {
  const championship = championshipOf(campaign);
  const match = championship.matches.find((item) => item.id === sim.matchId);
  const homeTeam = teamById(championship, sim.homeId);
  const awayTeam = teamById(championship, sim.awayId);
  sim = applyKnockoutExtraTime(sim, {
    seed: campaign.seed,
    gameSeed: campaign.seed,
    balance: campaignBalance(campaign),
    homeSquad: ratedSquad(sim.homeId, campaign),
    awaySquad: ratedSquad(sim.awayId, campaign),
    homeCondition: campaign.clubs[sim.homeId]?.condition,
    awayCondition: campaign.clubs[sim.awayId]?.condition,
    remainingWeeks: remainingWeeks(saveFromCampaign(campaign, sim.homeId), championship, sim.homeId),
    homeName: homeTeam ? compactName(homeTeam) : sim.homeId,
    awayName: awayTeam ? compactName(awayTeam) : sim.awayId,
    stage: match?.stage,
  });
  const date = match?.date ?? "";
  const matches = writeMatch(campaign.matches, sim);
  const playedCount = matches.filter((item) => item.homeScore && item.awayScore).length;
  let clubs = { ...campaign.clubs };
  for (const clubId of [sim.homeId, sim.awayId]) {
    const club = clubs[clubId] ?? createManagedClub(clubId, campaign.seed, campaignBalance(campaign));
    const ours = clubId === sim.homeId;
    const opening = ours ? first.homeSheet : first.awaySheet;
    if (!isHumanClub(campaign, clubId)) {
      clubs[clubId] = applySimToClub(club, clubId, sim, campaign.seed, "competitive", opening, campaignBalance(campaign));
      continue;
    }
    const ourScore = ours ? sim.homeScore : sim.awayScore;
    const theirScore = ours ? sim.awayScore : sim.homeScore;
    const result =
      scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
    const squad = ratedSquad(clubId, campaign);
    const closing = keepClubSheet(closingSheetOf(sim, clubId), squad);
    const tactics = ours ? sim.homeTactics : sim.awayTactics;
    const rolled = injuriesByClub[clubId] ?? [];
    let condition = applyMatchFatigue(
      club.condition,
      closing.starters,
      closing.subs,
      tactics,
      squad,
      sim.events.some((event) => event.kind === "red" && event.teamId === clubId),
      clubId === sim.homeId ? (sim.homeChaseEffort ?? 0) : (sim.awayChaseEffort ?? 0),
    );
    condition = applyMatchForm(condition, squad, opening, closing, sim.players, result, campaign.seed, sim.matchId);
    const teamworked = applyTeamwork(condition, closing, club.lastSheet, "competitive");
    condition = teamworked.condition;
    for (const item of rolled) {
      condition = applyInjury(condition, item.name, item.injury);
    }
    const rested = recoverAfterMatch(condition, squad);
    condition = applyMatchSuspensions(rested.condition, straightRedNamesFromEvents(sim.events, clubId));
    const sheet = sitInjuredPlayers(closing, squad, condition);
    const clubTeam = teamById(championship, clubId);
    const opponent = ours ? awayTeam : homeTeam;
    const items: NewsItem[] = [];
    if (clubTeam && homeTeam && awayTeam) {
      items.push(
        matchReportItem({
          clubId,
          clubName: clubTeam.name,
          homeName: homeTeam.name,
          awayName: awayTeam.name,
          homeScore: sim.homeScore,
          awayScore: sim.awayScore,
          sim,
          date,
          seed: campaign.seed,
          stageLabel: match ? stageLabel(match.stage, match.round) : "Championship day",
        }),
      );
      if (opponent) {
        const chair = chairmanAfterMatch({
          club: clubTeam,
          opponent,
          ourScore,
          theirScore,
          result,
          date,
          seed: campaign.seed,
          matchId: sim.matchId,
          ambition: ambitionFor(clubId).target,
        });
        if (chair) items.push(chair);
        const press = localPressItem({
          club: clubTeam,
          opponent,
          ourScore,
          theirScore,
          result,
          date,
          seed: campaign.seed,
          matchId: sim.matchId,
          ambition: ambitionFor(clubId).target,
          played: playedCount,
          players: sim.players,
        });
        items.push(press);
      }
    }
    for (const item of rolled) {
      items.push(
        injuryNews({
          rolled: item,
          date,
          seed: campaign.seed,
          key: sim.matchId,
          clubName: clubTeam?.name ?? "the club",
        }),
      );
    }
    for (const name of rested.recovered) {
      items.push(recoveryNews({ name, date, seed: campaign.seed }));
    }
    clubs[clubId] = pushInbox(
      { ...club, condition, sheet, trainingDue: true, lastSheet: teamworked.lastSheet, nextMatchPrep: undefined },
      items,
    );
  }
  let extraMatches = campaign.extraMatches ?? [];
  let nextMatches = matches;
  if (match && knockoutNeedsExtraTime(match.stage, sim.homeScore, sim.awayScore)) {
    const replay = replayFixture(match, sim.homeId, sim.awayId, [...championship.matches, ...extraMatches]);
    extraMatches = insertReplay(extraMatches, replay);
    if (!nextMatches.some((item) => item.id === replay.id)) {
      nextMatches = [...nextMatches, { id: replay.id, homeScore: null, awayScore: null }];
    }
  }
  const reports = { ...campaign.reports, [sim.matchId]: reportFromSim(sim) };
  if (match) {
    const siblingReports = championship.matches.filter((item) => item.id !== match.id && sameWeekend(match, item));
    for (const clubId of [sim.homeId, sim.awayId]) {
      if (!isHumanClub(campaign, clubId)) continue;
      const club = clubs[clubId];
      if (!club) continue;
      const lines = siblingReports.flatMap((item) => {
        const report = item.id === sim.matchId ? reports[item.id] : reports[item.id] ?? campaign.reports[item.id];
        if (!report || report.homeId === clubId || report.awayId === clubId) return [];
        const home = teamById(championship, report.homeId);
        const away = teamById(championship, report.awayId);
        const star = [...report.players]
          .filter((row) => row.started)
          .sort((left, right) => right.rating - left.rating)[0];
        const standout = star ? ` ${star.name} stood out.` : "";
        return [
          `${home?.name ?? "One side"} ${formatScore(report.homeScore)} ${away?.name ?? "the other"} ${formatScore(report.awayScore)}.${standout}`,
        ];
      });
      const roundup = elsewhereRoundup({
        lines,
        date,
        seed: campaign.seed,
        label: match.stage === "group" ? `Round ${match.round}` : stageLabel(match.stage, match.round),
      });
      if (roundup) clubs[clubId] = pushInbox(clubs[clubId]!, [roundup]);
    }
  }
  const ready = { ...campaign.week.ready };
  delete ready[sim.homeId];
  delete ready[sim.awayId];
  return {
    ...campaign,
    matches: nextMatches,
    extraMatches,
    reports,
    clubs,
    week: { ...campaign.week, ready },
  };
}

function autoPlan(campaign: Campaign, clubId: string, first: SimulatedMatch, side: "home" | "away"): HalfPlan {
  const club = campaign.clubs[clubId] ?? createManagedClub(clubId, campaign.seed, campaignBalance(campaign));
  return pickCpuHalfPlan({
    teamId: clubId,
    first,
    side,
    condition: club.condition,
    seed: campaign.seed,
    difficulty: campaignDifficulty(campaign),
    balance: campaignBalance(campaign),
  });
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
  const decorated = decorateHumanMatch(campaign, second);
  const withHtSubs = {
    ...decorated.sim,
    events: prependHalfTimeSubs(live.first, decorated.sim, { home: homePlan.sheet, away: awayPlan.sheet }),
  };
  const homeTeam = teamById(championship, live.first.homeId);
  const awayTeam = teamById(championship, live.first.awayId);
  const combined = combineHalves(live.first, withHtSubs, {
    clubId: homeHuman ? live.first.homeId : live.first.awayId,
    homeName: homeTeam ? compactName(homeTeam) : "one side",
    awayName: awayTeam ? compactName(awayTeam) : "the other side",
    condition: campaign.clubs[homeHuman ? live.first.homeId : live.first.awayId]?.condition,
  });
  const withEt = applyKnockoutExtraTime(combined, {
    seed: campaign.seed,
    gameSeed: campaign.seed,
    balance: campaignBalance(campaign),
    homeSquad: ratedSquad(live.first.homeId, campaign),
    awaySquad: ratedSquad(live.first.awayId, campaign),
    homeCondition: campaign.clubs[live.first.homeId]?.condition,
    awayCondition: campaign.clubs[live.first.awayId]?.condition,
    remainingWeeks: remainingWeeks(saveFromCampaign(campaign, live.first.homeId), championship, live.first.homeId),
    homeName: homeTeam ? compactName(homeTeam) : "one side",
    awayName: awayTeam ? compactName(awayTeam) : "the other side",
    stage: match.stage,
  });
  const injuries = mergeInjuryMaps(live.injuries, decorated.injuries);
  const withLive: Campaign = {
    ...campaign,
    week: {
      ...campaign.week,
      lives: {
        ...campaign.week.lives,
        [matchId]: { ...live, homeSecond: homePlan, awaySecond: awayPlan, combined: withEt, injuries },
      },
    },
  };
  const finished = finishSim(withLive, withEt, live.first, injuries);
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

function withOpenLives(campaign: Campaign): Campaign {
  const locked = Object.values(campaign.week.lives).some((live) => !live.combined);
  const deadlineAt = locked
    ? campaign.week.deadlineAt
    : Object.keys(campaign.week.ready).some((clubId) => nextHumanMatchIsPvp(campaign, clubId))
      ? campaign.week.deadlineAt
      : null;
  if (campaign.week.locked === locked && campaign.week.deadlineAt === deadlineAt) return campaign;
  return { ...campaign, week: { ...campaign.week, locked, deadlineAt } };
}

function pruneStaleOpenLives(campaign: Campaign): Campaign {
  const championship = championshipOf(campaign);
  let changed = false;
  const lives: Campaign["week"]["lives"] = {};
  for (const [id, live] of Object.entries(campaign.week.lives)) {
    if (!live.combined) {
      const row = championship.matches.find((match) => match.id === id);
      if (campaign.reports[id] || (row && matchPlayed(row))) {
        changed = true;
        continue;
      }
    }
    lives[id] = live;
  }
  return changed ? { ...campaign, week: { ...campaign.week, lives } } : campaign;
}

export function tickCampaign(campaign: Campaign, now = Date.now()): Campaign {
  if (campaign.phase === "lobby") return campaign;
  let next = withAllClubs(campaign);
  if (deadlinePassed(next, now)) {
    next = fillBlockingPlayers(next, now);
    next = fillMissingSecondHalves(next);
  }
  next = progressMatches(next, now);
  if (deadlinePassed(next, now)) next = fillMissingSecondHalves(next);
  return withOpenLives(pruneStaleOpenLives(next));
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
  const club = campaign.clubs[clubId] ?? newClub(clubId, campaign.seed);
  const squad = ratedSquad(clubId, campaign);
  const seated = sitInjuredPlayers(
    keepClubSheet(sheet, squad),
    squad,
    club.condition,
    injuredNamesFromEvents(live.first.events, clubId),
  );
  const plan: HalfPlan = { tactics, sheet: seated, submittedAt: now };
  const updated: MatchLive =
    side === "home" ? { ...live, homeSecond: plan } : { ...live, awaySecond: plan };
  const withPlan = bump({
    ...withClub(campaign, clubId, { ...club, tactics, sheet: seated }),
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
  const championship = championshipOf(campaign);
  return Object.values(campaign.week.lives).find((live) => {
    if (live.combined) return false;
    if (live.first.homeId !== clubId && live.first.awayId !== clubId) return false;
    if (campaign.reports[live.matchId]) return false;
    const row = championship.matches.find((match) => match.id === live.matchId);
    return !row || !matchPlayed(row);
  });
}

export function secondHalfReady(campaign: Campaign, matchId: string): boolean {
  const live = campaign.week.lives[matchId];
  return Boolean(live?.combined);
}

export function formatDeadline(deadlineAt: number | null, now: number): string {
  if (deadlineAt == null) return "No wait window is open. You only wait when you face another manager.";
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
