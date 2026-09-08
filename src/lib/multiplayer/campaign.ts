import { seedChampionship } from "../../data/championship";
import type {
  Campaign,
  Championship,
  ClubRuntime,
  Difficulty,
  GameSave,
  HalfPlan,
  Match,
  MatchLive,
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
} from "../../types";
import { compactName } from "../display";
import { briefingNews } from "../briefing";
import { championshipFromSave, SAVE_VERSION } from "../gameStorage";
import { DEFAULT_DIFFICULTY, migrateDifficulty, performanceBoostFor } from "../difficulty";
import {
  applySimToClub,
  createManagedClub,
  ensureManagedClubs,
  pickCpuHalfPlan,
  prepareManagedClubForMatch,
  restAndPrepManagedClub,
  tickManagedPreseasonWeek,
} from "../aiManager";
import { momentumAt, sentOffNamesFromEvents, simulateMatch } from "../matchEngine";
import {
  applyInjury,
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
import { remainingMatchSubs } from "../subs";
import { resolveMatchSides, teamById } from "../resolve";
import { nextBatch, nextOpenBatch } from "../schedule";
import { formatScore, matchPlayed, scoreTotal, stageLabel } from "../scoring";
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
  };
}

function withAllClubs(campaign: Campaign): Campaign {
  return { ...campaign, clubs: ensureManagedClubs(campaign.clubs, campaign.seed) };
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

export function campaignDifficulty(campaign: Campaign): Difficulty {
  return migrateDifficulty(campaign.difficulty);
}

export function withCampaignDefaults(campaign: Campaign): Campaign {
  return { ...campaign, difficulty: campaignDifficulty(campaign) };
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
  const date = PRESEASON_DATES[0] ?? "";
  const seated = new Map(campaign.seats.map((seat) => [seat.clubId, seat]));
  for (const team of seedChampionship.teams) {
    const seat = seated.get(team.id);
    if (seat) {
      const club = newClub(team.id, campaign.seed);
      const welcome = chairmanWelcome({ club: team, seed: campaign.seed, date });
      clubs[team.id] = pushInbox(club, [{ ...welcome.item, id: `${welcome.item.id}:${seat.clubId}` }]);
    } else {
      clubs[team.id] = createManagedClub(team.id, campaign.seed);
    }
  }
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
  const club = campaign.clubs[clubId] ?? newClub(clubId, campaign.seed);
  return {
    version: SAVE_VERSION,
    clubId,
    seed: campaign.seed,
    difficulty: campaignDifficulty(campaign),
    tactics: club.tactics,
    sheet: expandSheetToPanel(clubId, club.sheet, campaign.seed),
    matches: campaign.matches,
    inbox: club.inbox,
    phase: campaign.phase === "season" ? "season" : "preseason",
    preseasonWeek: campaign.preseasonWeek,
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

function resolveSession(focus: WeekSession | "fitness" | "skills" | "setpieces"): WeekSession {
  if (focus === "challenge" || focus === "recovery" || focus === "mixed") return focus;
  return "mixed";
}

function withClubBriefing(club: ClubRuntime, clubId: string, campaign: Campaign): ClubRuntime {
  if (campaign.phase !== "season") return club;
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
  if (!club || !club.trainingDue || campaign.phase !== "preseason") return campaign;
  const weekSession = resolveSession(session);
  const squad = ratedSquad(clubId, campaign.seed);
  const championship = championshipOf(campaign);
  const date = PRESEASON_DATES[campaign.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "";
  const sessionsDone = club.sessionsDone ?? 0;
  const result = applyWeekSession({
    squad,
    condition: club.condition,
    sheet: club.sheet,
    lastSheet: club.lastSheet,
    plans: club.plans ?? {},
    phase: "preseason",
    preseasonWeek: campaign.preseasonWeek,
    sessionsDone,
    intensity: club.intensity ?? DEFAULT_INTENSITY,
    weekShape: club.weekShape ?? DEFAULT_WEEK_SHAPE,
    requestedSession: weekSession,
    seed: campaign.seed,
    weekKey: `${campaign.phase}-${campaign.preseasonWeek}-${date}-${sessionsDone}`,
    remainingWeeks: remainingWeeks(saveFromCampaign(campaign, clubId), championship, clubId),
    weekDeltas: club.weekDeltas ?? {},
  });
  const team = teamById(championship, clubId);
  const total = 3;
  const title = result.weekComplete
    ? `Preseason week ${campaign.preseasonWeek} complete`
    : `Preseason week ${campaign.preseasonWeek} · session ${sessionsDone + 1} of ${total}`;
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
      `Preseason week ${campaign.preseasonWeek}`,
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
  nextClub = withClubBriefing(nextClub, clubId, campaign);
  let next = withClub(campaign, clubId, nextClub);
  if (result.weekComplete) {
    next = {
      ...next,
      week: { ...next.week, ready: { ...next.week.ready, [clubId]: { at: now } } },
    };
  }
  return next;
}

function applyClubMatchPrep(campaign: Campaign, clubId: string, prep: MatchPrep, now: number): Campaign {
  const club = campaign.clubs[clubId];
  if (!club || !club.trainingDue || campaign.phase !== "season") return campaign;
  const squad = ratedSquad(clubId, campaign.seed);
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
  if (!club || !club.trainingDue || shaped.phase !== "preseason") return shaped;
  const squad = ratedSquad(clubId, shaped.seed);
  const championship = championshipOf(shaped);
  const date = PRESEASON_DATES[shaped.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "";
  const sessionsDone = club.sessionsDone ?? 0;
  const result = applyFullTrainingWeek({
    squad,
    condition: club.condition,
    sheet: club.sheet,
    lastSheet: club.lastSheet,
    plans: club.plans ?? {},
    phase: "preseason",
    preseasonWeek: shaped.preseasonWeek,
    sessionsDone,
    intensity: club.intensity ?? DEFAULT_INTENSITY,
    weekShape,
    requestedSession: "mixed",
    seed: shaped.seed,
    weekKey: `${shaped.phase}-${shaped.preseasonWeek}-${date}-${sessionsDone}`,
    remainingWeeks: remainingWeeks(saveFromCampaign(shaped, clubId), championship, clubId),
    weekDeltas: club.weekDeltas ?? {},
  });
  const team = teamById(championship, clubId);
  const title = `Preseason week ${shaped.preseasonWeek} complete`;
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
      `Preseason week ${shaped.preseasonWeek}`,
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
  nextClub = withClubBriefing(nextClub, clubId, shaped);
  let next = withClub(shaped, clubId, nextClub);
  if (result.weekComplete) {
    next = {
      ...next,
      week: { ...next.week, ready: { ...next.week.ready, [clubId]: { at: now } } },
    };
  }
  return tickCampaign(bump(next), now);
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
  for (const seat of waitingOnWeek(campaign)) {
    let guard = 0;
    while (guard < 6) {
      guard += 1;
      const club = next.clubs[seat.clubId];
      if (!club || next.week.ready[seat.clubId]) break;
      if (next.phase === "preseason" && club.trainingDue) {
        const after = applyClubTraining(next, seat.clubId, "mixed", now);
        if (after === next) break;
        next = after;
        continue;
      }
      next = {
        ...next,
        week: { ...next.week, ready: { ...next.week.ready, [seat.clubId]: { at: now } } },
      };
      break;
    }
  }
  return next;
}

function lockMatchday(campaign: Campaign, now: number): Campaign {
  let next = withAllClubs(campaign);
  const championship = championshipOf(next);
  const batch = nextOpenBatch(championship);
  if (!batch) {
    return bump({ ...next, week: { ...emptyWeek(), deadlineAt: openDeadline(campaign.waitHours, now) } });
  }
  const date = batch.matches[0]?.date ?? "";
  let clubs = { ...next.clubs };
  const involved = new Set<string>();
  for (const match of batch.matches) {
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (homeId) involved.add(homeId);
    if (awayId) involved.add(awayId);
  }
  for (const clubId of involved) {
    if (isHumanClub(next, clubId)) continue;
    let club = clubs[clubId] ?? createManagedClub(clubId, next.seed);
    if (club.trainingDue) {
      const match = batch.matches.find((item) => {
        const sides = resolveMatchSides(championship, item);
        return sides.homeId === clubId || sides.awayId === clubId;
      });
      const sides = match ? resolveMatchSides(championship, match) : { homeId: null, awayId: null };
      club = restAndPrepManagedClub(club, clubId, {
        seed: next.seed,
        opponentId: sides.homeId === clubId ? (sides.awayId ?? undefined) : (sides.homeId ?? undefined),
        matchKey: match?.id ?? date,
      });
    }
    clubs[clubId] = club;
  }
  next = { ...next, clubs };
  for (const match of batch.matches) {
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (!homeId || !awayId) continue;
    for (const [clubId, opponentId] of [
      [homeId, awayId],
      [awayId, homeId],
    ] as const) {
      if (isHumanClub(next, clubId)) continue;
      const club = clubs[clubId];
      if (!club) continue;
      const opponent = clubs[opponentId];
      clubs[clubId] = prepareManagedClubForMatch(
        club,
        clubId,
        {
          id: opponentId,
          sheet: opponent?.sheet ?? defaultSheet(opponentId),
          tactics: isHumanClub(next, opponentId) ? (opponent?.tactics ?? clubTactics(opponentId)) : clubTactics(opponentId),
          condition: opponent?.condition,
        },
        match.id,
        next.seed,
        undefined,
        { difficulty: campaignDifficulty(next), reports: next.reports },
      );
    }
  }
  next = { ...next, clubs };
  const lives: Record<string, MatchLive> = {};
  for (const match of batch.matches) {
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (!homeId || !awayId) continue;
    const humans = [homeId, awayId].filter((id) => isHumanClub(next, id));
    const period = humans.length > 0 ? "first" : "full";
    const sim = simulateSides(next, match, homeId, awayId, period);
    const decorated = decorateHumanMatch(next, sim);
    if (humans.length === 0) {
      next = finishSim(next, decorated.sim, decorated.sim, decorated.injuries);
    } else {
      lives[match.id] = { matchId: match.id, first: decorated.sim, injuries: decorated.injuries };
    }
  }
  return bump({
    ...next,
    week: {
      locked: true,
      deadlineAt: openDeadline(campaign.waitHours, now),
      ready: campaign.week.ready,
      lives,
      batchLabel: batch.label,
      batchMatchIds: batch.matches.map((item) => item.id),
    },
  });
}

function lockPreseason(campaign: Campaign, now: number): Campaign {
  const started = withAllClubs(campaign);
  const managedIds = seedChampionship.teams.map((team) => team.id).filter((id) => !isHumanClub(started, id));
  const remaining = Math.max(1, PRESEASON_WEEKS - campaign.preseasonWeek + 4);
  const trained = tickManagedPreseasonWeek(started.clubs, managedIds, {
    seed: campaign.seed,
    week: campaign.preseasonWeek,
    remainingWeeks: remaining,
    difficulty: campaignDifficulty(campaign),
    reports: campaign.reports,
  });
  const week = campaign.preseasonWeek + 1;
  const clubs = { ...trained };
  const championshipWeek = week > PRESEASON_WEEKS;
  for (const clubId of Object.keys(clubs)) {
    const club = clubs[clubId];
    if (!club) continue;
    if (championshipWeek) {
      const squad = ratedSquad(clubId, campaign.seed);
      const rested = {
        ...club,
        condition: recoverBetweenMatches(club.condition, squad),
        trainingDue: true,
        sessionsDone: 0,
        nextMatchPrep: undefined,
      };
      if (!isHumanClub(started, clubId)) {
        clubs[clubId] = rested;
        continue;
      }
      const noted = pushInbox(rested, [
        newsItem({
          id: newsId(now),
          kind: "training",
          date: "2026-07-23",
          title: "Championship week",
          body: "Preseason is over. The panel have their legs back. Work one aspect before Round 1, or go straight to the match.",
        }),
      ]);
      clubs[clubId] = withClubBriefing(noted, clubId, { ...started, phase: "season", clubs });
    } else {
      clubs[clubId] = { ...club, trainingDue: true, sessionsDone: 0 };
    }
  }
  return bump({
    ...started,
    phase: championshipWeek ? "season" : "preseason",
    preseasonWeek: week,
    clubs,
    week: {
      ...emptyWeek(),
      deadlineAt: openDeadline(campaign.waitHours, now),
    },
  });
}

function clubSheet(
  campaign: Campaign,
  clubId: string,
  override?: TeamSheet,
  extraNames: string[] = [],
): TeamSheet {
  const club = campaign.clubs[clubId];
  const sheet = expandSheetToPanel(clubId, override ?? club?.sheet ?? defaultSheet(clubId), campaign.seed);
  return sitInjuredPlayers(sheet, ratedSquad(clubId, campaign.seed), club?.condition ?? {}, extraNames);
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
  const homeHurt = first ? injuredNamesFromEvents(first.events, homeId) : [];
  const awayHurt = first ? injuredNamesFromEvents(first.events, awayId) : [];
  return simulateMatch({
    matchId: match.id,
    homeId,
    awayId,
    homeSheet: clubSheet(campaign, homeId, extras?.homeSheet, homeHurt),
    awaySheet: clubSheet(campaign, awayId, extras?.awaySheet, awayHurt),
    homeTactics: extras?.homeTactics ?? homeClub?.tactics ?? clubTactics(homeId),
    awayTactics: extras?.awayTactics ?? awayClub?.tactics ?? clubTactics(awayId),
    homeCondition: homeClub?.condition,
    awayCondition: awayClub?.condition,
    homeSquad: ratedSquad(homeId, campaign.seed),
    awaySquad: ratedSquad(awayId, campaign.seed),
    remainingWeeks: remainingWeeks(saveFromCampaign(campaign, homeClub ? homeId : awayId), championship, homeClub ? homeId : awayId),
    sentOff: first ? sentOffNamesFromEvents(first.events) : undefined,
    clubId: homeClub ? homeId : awayClub ? awayId : homeId,
    homeName: homeTeam ? compactName(homeTeam) : homeId,
    awayName: awayTeam ? compactName(awayTeam) : awayId,
    period,
    seed: campaign.seed,
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
    performanceBoost: performanceBoostFor(
      campaignDifficulty(campaign),
      campaign.seats.map((seat) => seat.clubId),
    ),
    homePrep: homeClub?.nextMatchPrep,
    awayPrep: awayClub?.nextMatchPrep,
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
  const date = match?.date ?? "";
  const matches = writeMatch(campaign.matches, sim);
  const playedCount = matches.filter((item) => item.homeScore && item.awayScore).length;
  let clubs = { ...campaign.clubs };
  for (const clubId of [sim.homeId, sim.awayId]) {
    const club = clubs[clubId] ?? createManagedClub(clubId, campaign.seed);
    const ours = clubId === sim.homeId;
    const opening = ours ? first.homeSheet : first.awaySheet;
    if (!isHumanClub(campaign, clubId)) {
      clubs[clubId] = applySimToClub(club, clubId, sim, campaign.seed, "competitive", opening);
      continue;
    }
    const ourScore = ours ? sim.homeScore : sim.awayScore;
    const theirScore = ours ? sim.awayScore : sim.homeScore;
    const result =
      scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
    const squad = ratedSquad(clubId, campaign.seed);
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
    condition = rested.condition;
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
  return {
    ...campaign,
    matches,
    reports: { ...campaign.reports, [sim.matchId]: reportFromSim(sim) },
    clubs,
  };
}

function autoPlan(campaign: Campaign, clubId: string, first: SimulatedMatch, side: "home" | "away"): HalfPlan {
  const club = campaign.clubs[clubId] ?? createManagedClub(clubId, campaign.seed);
  return pickCpuHalfPlan({
    teamId: clubId,
    first,
    side,
    condition: club.condition,
    seed: campaign.seed,
    difficulty: campaignDifficulty(campaign),
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
  const homeTeam = teamById(championship, live.first.homeId);
  const awayTeam = teamById(championship, live.first.awayId);
  const combined = combineHalves(live.first, decorated.sim, {
    clubId: homeHuman ? live.first.homeId : live.first.awayId,
    homeName: homeTeam ? compactName(homeTeam) : "Home",
    awayName: awayTeam ? compactName(awayTeam) : "Away",
    condition: campaign.clubs[homeHuman ? live.first.homeId : live.first.awayId]?.condition,
  });
  const injuries = mergeInjuryMaps(live.injuries, decorated.injuries);
  const withLive: Campaign = {
    ...campaign,
    week: {
      ...campaign.week,
      lives: {
        ...campaign.week.lives,
        [matchId]: { ...live, homeSecond: homePlan, awaySecond: awayPlan, combined, injuries },
      },
    },
  };
  const finished = finishSim(withLive, combined, live.first, injuries);
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
  const championship = championshipOf(campaign);
  const ids = campaign.week.batchMatchIds ?? [];
  const date = ids.map((id) => championship.matches.find((match) => match.id === id)?.date).find(Boolean) ?? "";
  const label = campaign.week.batchLabel ?? "Championship day";
  let clubs = { ...campaign.clubs };
  for (const seat of campaign.seats) {
    const club = clubs[seat.clubId];
    if (!club) continue;
    const lines = ids.flatMap((id) => {
      const report = campaign.reports[id];
      if (!report || report.homeId === seat.clubId || report.awayId === seat.clubId) return [];
      const home = teamById(championship, report.homeId);
      const away = teamById(championship, report.awayId);
      const star = [...report.players]
        .filter((row) => row.started)
        .sort((left, right) => right.rating - left.rating)[0];
      const standout = star ? ` ${star.name} stood out.` : "";
      return [
        `${home?.name ?? "Home"} ${formatScore(report.homeScore)} ${away?.name ?? "Away"} ${formatScore(report.awayScore)}.${standout}`,
      ];
    });
    const roundup = elsewhereRoundup({ lines, date, seed: campaign.seed, label });
    if (roundup) clubs[seat.clubId] = pushInbox(club, [roundup]);
  }
  return bump({
    ...campaign,
    clubs,
    week: {
      locked: false,
      deadlineAt: openDeadline(campaign.waitHours, now),
      ready: {},
      lives: campaign.week.lives,
      batchLabel: campaign.week.batchLabel,
      batchMatchIds: campaign.week.batchMatchIds,
    },
  });
}

export function tickCampaign(campaign: Campaign, now = Date.now()): Campaign {
  if (campaign.phase === "lobby") return campaign;
  let next = withAllClubs(campaign);
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
  const club = campaign.clubs[clubId] ?? newClub(clubId, campaign.seed);
  const squad = ratedSquad(clubId, campaign.seed);
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
