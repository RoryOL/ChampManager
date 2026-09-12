import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seedChampionship } from "../data/championship";
import { compactName } from "../lib/display";
import { momentumAt, bookedNamesFromEvents, sentOffNamesFromEvents, simulateMatch, straightRedNamesFromEvents, applyKnockoutExtraTime } from "../lib/matchEngine";
import { combineHalves, emptyTeamStats, reportFromSim } from "../lib/matchStats";
import { applyMatchForm } from "../lib/form";
import {
  addSeat,
  championshipOf,
  createCampaign,
  forceAdvance,
  liveForClub,
  preMatchTacticsLocked,
  readyClub,
  saveFromCampaign,
  setWaitHours,
  startCampaign,
  submitSecondHalf,
  tickCampaign,
  trainClub,
  trainClubPrep,
  trainClubWeek,
  unreadyClub,
  waitingOnSecondHalf,
  withClubPlans,
  withClubSheet,
  withClubTactics,
  withClubTraining,
  withSeasonWrap,
} from "../lib/multiplayer/campaign";
import { DEFAULT_DIFFICULTY, performanceBoostFor } from "../lib/difficulty";
import { randomId } from "../lib/multiplayer/codes";
import {
  clearLocalSeats,
  ensurePlayer,
  isLocalSeat,
  rememberLocalSeat,
  setPlayerName,
} from "../lib/multiplayer/identity";
import { applyRemoteCampaign, freshestCampaign } from "../lib/multiplayer/merge";
import { connectRoom, forgetRoomBroker, probeRoom, roomBroker, type JoinPreview, type RoomStatus } from "../lib/multiplayer/remote";
import {
  clearCampaign,
  exportCampaign,
  loadCampaign,
  loadRoom,
  parseCampaignInvite,
  persistCampaign,
} from "../lib/multiplayer/store";
import { clubTactics, defaultSheet, expandSheetToPanel, ratedSquad, swapPlayersInSheet } from "../lib/players";
import { remainingMatchSubs, prependHalfTimeSubs } from "../lib/subs";
import {
  applySimsToRivals,
  pickCpuHalfPlan,
  prepareRivalsForMatches,
  seedRivals,
  syncRivalsAfterUserWeek,
} from "../lib/aiManager";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { nextBatch } from "../lib/schedule";
import { championshipWinnerId, seasonFinaleStep } from "../lib/season";
import { knockoutNeedsExtraTime, replayFixture, scoresAreLevel, withReplayFixture } from "../lib/knockout";
import { formatDate, formatScore, matchPlayed, matchStageLabel, scoreTotal } from "../lib/scoring";
import {
  applyInjury,
  injuredNamesFromEvents,
  keepClubSheet,
  remainingInjuryBudget,
  sitInjuredPlayers,
  applyMatchSuspensions,
  type RolledInjury,
} from "../lib/injuries";
import {
  chairmanAfterMatch,
  chairmanWelcome,
  elsewhereRoundup,
  injuryNews,
  localPressItem,
  markNewsRead,
  matchReportItem,
  newsItem,
  remainingWeeks,
  recoveryNews,
} from "../lib/news";
import {
  applyMatchFatigue,
  applyTeamwork,
  applyFullTrainingWeek,
  applyWeekSession,
  DEFAULT_INTENSITY,
  DEFAULT_WEEK_SHAPE,
  matchPrepSummary,
  matchPrepTitle,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
  recoverAfterMatch,
  recoverBetweenMatches,
  sessionsPerWeek,
  weekCoachCopy,
} from "../lib/training";
import { ensureMatchBriefing } from "../lib/briefing";
import { rollClimate } from "../lib/weather";
import {
  championshipFromSave,
  clearSave,
  loadSave,
  newSave,
  persistSave,
  withInbox,
  withPlans,
  withSheet,
  withTactics,
  withTrainingPrefs,
  writeScores,
} from "../lib/gameStorage";
import type {
  Campaign,
  Championship,
  GameSave,
  LivePhase,
  Match,
  NewsItem,
  Seat,
  SimulatedMatch,
  Tactics,
  TeamSheet,
  TrainingIntensity,
  TrainingPlans,
  WaitHours,
  WeekSession,
  WeekShape,
  Difficulty,
  MatchPrep,
  SquadBalance,
  SeasonWrap,
} from "../types";

export type LiveMatch = {
  user: SimulatedMatch;
  others: SimulatedMatch[];
  label: string;
  match: Match;
  cursor: number;
  phase: LivePhase;
  openingSheet: TeamSheet;
  openingHomeSheet: TeamSheet;
  openingAwaySheet: TeamSheet;
  injuries: RolledInjury[];
};

function extraTimeOptions(
  save: GameSave,
  sim: SimulatedMatch,
  championship: Championship,
) {
  const home = teamById(championship, sim.homeId);
  const away = teamById(championship, sim.awayId);
  return {
    seed: save.seed,
    gameSeed: save.seed,
    balance: save.balance,
    clubId: save.clubId,
    homeSquad: ratedSquad(sim.homeId, save),
    awaySquad: ratedSquad(sim.awayId, save),
    remainingWeeks: remainingWeeks(save, championship, save.clubId),
    homeName: home ? compactName(home) : sim.homeId,
    awayName: away ? compactName(away) : sim.awayId,
    performanceBoost: performanceBoostFor(save.difficulty, [save.clubId]),
    homePrep: sim.homeId === save.clubId ? save.nextMatchPrep : save.rivals[sim.homeId]?.nextMatchPrep,
    awayPrep: sim.awayId === save.clubId ? save.nextMatchPrep : save.rivals[sim.awayId]?.nextMatchPrep,
    homeCondition: sim.homeId === save.clubId ? save.condition : save.rivals[sim.homeId]?.condition,
    awayCondition: sim.awayId === save.clubId ? save.condition : save.rivals[sim.awayId]?.condition,
    stage: championship.matches.find((item) => item.id === sim.matchId)?.stage,
  };
}

function preparedRivals(save: GameSave, championship: Championship): GameSave["rivals"] {
  const batch = nextBatch(championship, save.clubId);
  const matches = (batch?.matches ?? []).flatMap((match) => {
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (!homeId || !awayId) return [];
    return [{ id: match.id, homeId, awayId }];
  });
  const date =
    batch?.matches[0]?.date ?? championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
  return prepareRivalsForMatches({
    rivals: save.rivals ?? seedRivals(save.clubId, save.seed, save.balance),
    userClubId: save.clubId,
    userSheet: save.sheet,
    userTactics: save.tactics,
    matches,
    seed: save.seed,
    date,
    remainingWeeks: remainingWeeks(save, championship, save.clubId),
    preseasonWeek: save.preseasonWeek,
    difficulty: save.difficulty,
    reports: save.reports,
    userCondition: save.condition,
    balance: save.balance,
  });
}

function decorateUserMatch(
  sim: SimulatedMatch,
  save: GameSave,
): { sim: SimulatedMatch; injuries: RolledInjury[] } {
  if (sim.homeId !== save.clubId && sim.awayId !== save.clubId) {
    return { sim, injuries: [] };
  }
  const injuries = (sim.matchInjuries ?? [])
    .filter((item) => item.teamId === save.clubId)
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
  return { sim, injuries };
}

function localSeatsFor(campaign: Campaign, selfId: string): Seat[] {
  return campaign.seats.filter((seat) => isLocalSeat(seat.playerId, selfId));
}

export function useGame() {
  const [soloSave, setSoloSave] = useState<GameSave | null>(() => loadSave());
  const [campaign, setCampaign] = useState<Campaign | null>(() => loadCampaign());
  const [player, setPlayer] = useState(() => ensurePlayer());
  const [activePlayerId, setActivePlayerId] = useState(() => {
    const self = ensurePlayer();
    const current = loadCampaign();
    const seated = current ? localSeatsFor(current, self.id)[0] : undefined;
    return seated?.playerId ?? self.id;
  });
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("offline");
  const [roomEpoch, setRoomEpoch] = useState(0);
  const campaignRef = useRef<Campaign | null>(null);
  const roomRef = useRef<{
    publish: (campaign: Campaign) => void;
    remember: (campaign: Campaign) => void;
    disconnect: () => void;
  } | null>(null);

  const activeSeat = campaign?.seats.find((seat) => seat.playerId === activePlayerId)
    ?? campaign?.seats.find((seat) => isLocalSeat(seat.playerId, player.id));
  const localSeats = campaign ? localSeatsFor(campaign, player.id) : [];

  const save = campaign
    ? campaign.phase === "lobby" || !activeSeat
      ? null
      : saveFromCampaign(campaign, activeSeat.clubId)
    : soloSave;

  const championship: Championship = useMemo(
    () => (campaign ? championshipOf(campaign) : save ? championshipFromSave(save) : seedChampionship),
    [campaign, save],
  );

  const commitSolo = useCallback((next: GameSave) => {
    persistSave(next);
    setSoloSave(next);
  }, []);

  const commitCampaign = useCallback((next: Campaign) => {
    persistCampaign(next);
    setCampaign(next);
    roomRef.current?.publish(next);
  }, []);

  useEffect(() => {
    campaignRef.current = campaign;
  }, [campaign]);

  useEffect(() => {
    if (!campaign?.code) {
      setRoomStatus("offline");
      return;
    }
    const handle = connectRoom(campaign.code, {
      onStatus: setRoomStatus,
      onCampaign: (remote) => {
        setCampaign((current) => {
          if (!current || current.code !== remote.code) return current;
          const { campaign: next, publish } = applyRemoteCampaign(current, remote);
          handle.remember(next);
          if (next === current && !publish) return current;
          if (JSON.stringify(next) !== JSON.stringify(current)) persistCampaign(next);
          if (publish) handle.publish(publish);
          return next;
        });
      },
    });
    roomRef.current = handle;
    const latest = campaignRef.current ?? campaign;
    if (latest) handle.publish(latest);
    return () => {
      handle.disconnect();
      if (roomRef.current === handle) roomRef.current = null;
    };
  }, [campaign?.code, roomEpoch]);

  useEffect(() => {
    if (!campaign) return;
    const timer = window.setInterval(() => {
      setCampaign((current) => {
        if (!current) return current;
        const next = tickCampaign(current, Date.now());
        if (next.revision !== current.revision) {
          persistCampaign(next);
          roomRef.current?.publish(next);
        }
        return next;
      });
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [campaign?.id]);

  useEffect(() => {
    if (!campaign || !live || live.phase !== "half-wait") return;
    const row = campaign.week.lives[live.user.matchId];
    if (!row?.combined) return;
    const halfIndex = row.combined.events.findIndex((event) => event.kind === "half") + 1;
    setLive({
      ...live,
      user: row.combined,
      phase: "second",
      cursor: Math.max(halfIndex, 1),
    });
  }, [campaign, live]);

  const takeCharge = useCallback((clubId: string, difficulty = DEFAULT_DIFFICULTY, balance?: SquadBalance) => {
    const club = teamById(seedChampionship, clubId);
    const started = newSave(clubId, difficulty, balance);
    if (!club) {
      commitSolo(started);
      setLive(null);
      setPicked(null);
      setViewTeamId(clubId);
      return;
    }
    const welcome = chairmanWelcome({ club, seed: started.seed, date: PRESEASON_DATES[0] });
    commitSolo(withInbox({ ...started, ambition: welcome.ambition }, [welcome.item]));
    setLive(null);
    setPicked(null);
    setViewTeamId(clubId);
  }, [commitSolo]);

  const hostCampaign = useCallback(
    (payload: { name: string; clubId: string; waitHours: WaitHours; difficulty?: Difficulty; balance?: SquadBalance }) => {
      const self = setPlayerName(payload.name);
      setPlayer(self);
      rememberLocalSeat(self.id);
      const created = createCampaign({
        hostPlayerId: self.id,
        hostName: self.name,
        clubId: payload.clubId,
        waitHours: payload.waitHours,
        difficulty: payload.difficulty,
        balance: payload.balance,
      });
      commitCampaign(created);
      setActivePlayerId(self.id);
      setViewTeamId(payload.clubId);
      setLive(null);
    },
    [commitCampaign],
  );

  const retryRoom = useCallback(() => {
    if (campaignRef.current?.code) forgetRoomBroker(campaignRef.current.code);
    setRoomEpoch((value) => value + 1);
  }, []);

  const refreshRoom = useCallback(async () => {
    const current = campaignRef.current;
    if (!current?.code) return;
    const probe = await probeRoom(current.code, 10_000, roomBroker(current.code));
    if (probe.campaign) {
      setCampaign((local) => {
        if (!local || local.code !== probe.campaign!.code) return local;
        const { campaign: next, publish } = applyRemoteCampaign(local, probe.campaign!);
        roomRef.current?.remember(next);
        if (JSON.stringify(next) !== JSON.stringify(local)) persistCampaign(next);
        roomRef.current?.publish(publish ?? next);
        return next;
      });
    } else {
      roomRef.current?.publish(current);
    }
    setRoomEpoch((value) => value + 1);
  }, []);

  const joinCampaign = useCallback(
    async (payload: { name: string; clubId: string; code: string; snapshot?: string }) => {
      const snapshot = payload.snapshot ? parseCampaignInvite(payload.snapshot) : null;
      const local = loadRoom(payload.code) ?? (campaign?.code === payload.code ? campaign : null);
      const probe = await probeRoom(payload.code, 12_000, roomBroker(payload.code));
      const room = freshestCampaign([probe.campaign, snapshot, local]);
      if (!room) {
        return {
          ok: false as const,
          error: probe.connected
            ? "That code is live but empty. Ask the host to stay in the lobby, then press Check room again."
            : "Could not reach the live room. Press Check room, or paste a snapshot if you have one.",
        };
      }
      const self = setPlayerName(payload.name);
      setPlayer(self);
      if (room.phase !== "lobby") {
        const seated =
          room.seats.find((seat) => seat.playerId === self.id) ??
          room.seats.find((seat) => isLocalSeat(seat.playerId, self.id)) ??
          room.seats.find((seat) => seat.clubId === payload.clubId && isLocalSeat(seat.playerId, self.id));
        if (!seated) {
          return { ok: false as const, error: "This championship has already started." };
        }
        rememberLocalSeat(seated.playerId);
        commitCampaign(room);
        setActivePlayerId(seated.playerId);
        setViewTeamId(seated.clubId);
        setLive(null);
        return { ok: true as const };
      }
      const base = probe.campaign ?? room;
      const seatId = base.seats.some((seat) => seat.playerId === self.id) ? randomId() : self.id;
      rememberLocalSeat(seatId);
      const joined = addSeat(base, { playerId: seatId, name: self.name, clubId: payload.clubId });
      if (!joined.ok) return joined;
      commitCampaign(joined.campaign);
      setActivePlayerId(seatId);
      setViewTeamId(payload.clubId);
      setLive(null);
      return { ok: true as const };
    },
    [campaign, commitCampaign],
  );

  const previewJoinTaken = useCallback(async (code: string, snapshot?: string): Promise<JoinPreview> => {
    const snapshotCampaign = snapshot ? parseCampaignInvite(snapshot) : null;
    const local = loadRoom(code) ?? (campaign?.code === code ? campaign : null);
    const probe = code.trim().length >= 4
      ? await probeRoom(code, 12_000, roomBroker(code))
      : { connected: false, campaign: null };
    const room = freshestCampaign([probe.campaign, snapshotCampaign, local]);
    const source: JoinPreview["source"] = probe.campaign
      ? "live"
      : snapshotCampaign
        ? "snapshot"
        : local
          ? "local"
          : "none";
    return {
      connected: probe.connected,
      found: Boolean(room),
      clubs: room?.seats.map((seat) => seat.clubId) ?? [],
      hostName: room?.seats.find((seat) => seat.playerId === room.hostPlayerId)?.name,
      source,
    };
  }, [campaign]);

  const addHotseat = useCallback(
    (name: string, clubId: string) => {
      if (!campaign) return { ok: false as const, error: "No lobby." };
      const seatId = randomId();
      const joined = addSeat(campaign, { playerId: seatId, name, clubId });
      if (!joined.ok) return joined;
      rememberLocalSeat(seatId);
      commitCampaign(joined.campaign);
      return { ok: true as const };
    },
    [campaign, commitCampaign],
  );

  const startLobby = useCallback(() => {
    if (!campaign) return { ok: false as const, error: "No lobby." };
    const started = startCampaign(campaign, activePlayerId);
    if (!started.ok) return started;
    commitCampaign(started.campaign);
    setViewTeamId(activeSeat?.clubId ?? started.campaign.seats[0]?.clubId ?? null);
    return { ok: true as const };
  }, [activePlayerId, activeSeat?.clubId, campaign, commitCampaign]);

  const leaveCampaign = useCallback(() => {
    clearCampaign();
    clearLocalSeats();
    setCampaign(null);
    setLive(null);
    setPicked(null);
    setViewTeamId(null);
  }, []);

  const resign = useCallback(() => {
    if (campaign) {
      leaveCampaign();
      return;
    }
    clearSave();
    setSoloSave(null);
    setLive(null);
    setPicked(null);
    setViewTeamId(null);
  }, [campaign, leaveCampaign]);

  const setSeasonWrap = useCallback(
    (wrap: SeasonWrap) => {
      if (campaign) {
        commitCampaign(withSeasonWrap(campaign, wrap));
        return;
      }
      if (!save) return;
      commitSolo({ ...save, seasonWrap: wrap });
    },
    [campaign, commitCampaign, commitSolo, save],
  );

  const startNewSeason = useCallback(() => {
    if (campaign) {
      leaveCampaign();
      return;
    }
    if (!save) return;
    takeCharge(save.clubId, save.difficulty, save.balance);
  }, [campaign, leaveCampaign, save, takeCharge]);

  const setTactics = useCallback(
    (tactics: Tactics) => {
      if (campaign && activeSeat) {
        commitCampaign(withClubTactics(campaign, activeSeat.clubId, tactics));
        return;
      }
      if (!save) return;
      commitSolo(withTactics(save, tactics));
    },
    [activeSeat, campaign, commitCampaign, commitSolo, save],
  );

  const swapPlayers = useCallback(
    (first: string, second: string) => {
      if (!save || live?.phase === "throw-in") return;
      const sheet = swapPlayersInSheet(expandSheetToPanel(save.clubId, save.sheet, save.seed), first, second);
      if (campaign && activeSeat) {
        commitCampaign(withClubSheet(campaign, activeSeat.clubId, sheet));
      } else {
        commitSolo(withSheet(save, sheet));
      }
      setPicked(null);
    },
    [activeSeat, campaign, commitCampaign, commitSolo, live?.phase, save],
  );

  const setSheet = useCallback(
    (sheet: TeamSheet) => {
      if (!save || live?.phase === "throw-in") return;
      const next = expandSheetToPanel(save.clubId, sheet, save.seed);
      if (campaign && activeSeat) {
        commitCampaign(withClubSheet(campaign, activeSeat.clubId, next));
      } else {
        commitSolo(withSheet(save, next));
      }
      setPicked(null);
    },
    [activeSeat, campaign, commitCampaign, commitSolo, live?.phase, save],
  );

  const tapPlayer = useCallback((name: string) => {
    setPicked((current) => (current === name ? null : name));
  }, []);

  const passDevice = useCallback((playerId: string) => {
    setActivePlayerId(playerId);
    setLive(null);
    setPicked(null);
    const seat = campaign?.seats.find((item) => item.playerId === playerId);
    if (seat) setViewTeamId(seat.clubId);
  }, [campaign]);

  const beginBatch = useCallback(
    (mode: "first" | "full"): LiveMatch | null => {
      if (!save || campaign) return null;
      const batch = nextBatch(championship, save.clubId);
      if (!batch) return null;

      const squad = ratedSquad(save.clubId, save);
      const userSheet = sitInjuredPlayers(expandSheetToPanel(save.clubId, save.sheet, save.seed), squad, save.condition);
      const rivals = preparedRivals(save, championship);
      let injuries: RolledInjury[] = [];
      const simulated = batch.matches
        .map((match) => {
          const { homeId, awayId } = resolveMatchSides(championship, match);
          if (!homeId || !awayId) return null;
          const isUser = homeId === save.clubId || awayId === save.clubId;
          const homeTeam = teamById(championship, homeId);
          const awayTeam = teamById(championship, awayId);
          const homeClub = homeId === save.clubId ? null : rivals[homeId];
          const awayClub = awayId === save.clubId ? null : rivals[awayId];
          const sim = simulateMatch({
            matchId: match.id,
            homeId,
            awayId,
            homeSheet: homeId === save.clubId ? userSheet : expandSheetToPanel(homeId, homeClub?.sheet ?? defaultSheet(homeId), save.seed),
            awaySheet: awayId === save.clubId ? userSheet : expandSheetToPanel(awayId, awayClub?.sheet ?? defaultSheet(awayId), save.seed),
            homeTactics: homeId === save.clubId ? save.tactics : (homeClub?.tactics ?? clubTactics(homeId, save.balance)),
            awayTactics: awayId === save.clubId ? save.tactics : (awayClub?.tactics ?? clubTactics(awayId, save.balance)),
            homeCondition: homeId === save.clubId ? save.condition : homeClub?.condition,
            awayCondition: awayId === save.clubId ? save.condition : awayClub?.condition,
            homeSquad: ratedSquad(homeId, save),
            awaySquad: ratedSquad(awayId, save),
            remainingWeeks: remainingWeeks(save, championship, save.clubId),
            clubId: save.clubId,
            homeName: homeTeam ? compactName(homeTeam) : homeId,
            awayName: awayTeam ? compactName(awayTeam) : awayId,
            period: isUser && mode === "first" ? "first" : "full",
            seed: save.seed,
            gameSeed: save.seed,
            balance: save.balance,
            performanceBoost: performanceBoostFor(save.difficulty, [save.clubId]),
            homePrep: homeId === save.clubId ? save.nextMatchPrep : homeClub?.nextMatchPrep,
            awayPrep: awayId === save.clubId ? save.nextMatchPrep : awayClub?.nextMatchPrep,
            stage: match.stage,
          });
          const resolved =
            isUser && mode === "first"
              ? sim
              : applyKnockoutExtraTime(sim, extraTimeOptions(save, sim, championship));
          if (!isUser) return resolved;
          const decorated = decorateUserMatch(resolved, save);
          injuries = decorated.injuries;
          return decorated.sim;
        })
        .filter((item): item is SimulatedMatch => Boolean(item));

      const user = batch.userMatch
        ? simulated.find((item) => item.matchId === batch.userMatch?.id)
        : undefined;
      const others = simulated.filter((item) => item.matchId !== user?.matchId);
      if (!user && simulated[0]) {
        return {
          user: simulated[0],
          others: simulated.slice(1),
          label: batch.label,
          match: batch.matches[0],
          cursor: 0,
          phase: "finished" as const,
          openingSheet: userSheet,
          openingHomeSheet: simulated[0].homeSheet,
          openingAwaySheet: simulated[0].awaySheet,
          injuries,
        };
      }
      if (!user || !batch.userMatch) return null;
      return {
        user,
        others,
        label: batch.label,
        match: batch.userMatch,
        cursor: 0,
        phase: mode === "first" ? "first" : "finished",
        openingSheet: userSheet,
        openingHomeSheet: user.homeSheet,
        openingAwaySheet: user.awaySheet,
        injuries,
      };
    },
    [campaign, championship, save],
  );

  const goToMatch = useCallback(() => {
    if (!save || save.phase === "preseason") return;
    if (campaign && activeSeat) {
      const row = liveForClub(campaign, activeSeat.clubId);
      if (!row) return;
      const match = championship.matches.find((item) => item.id === row.matchId);
      const batch = nextBatch(championship, activeSeat.clubId);
      if (!match) return;
      const alreadySecond = Boolean(
        (row.first.homeId === activeSeat.clubId ? row.homeSecond : row.awaySecond) && row.combined,
      );
      const startSecond = alreadySecond && row.combined;
      const sim = startSecond ? row.combined! : row.first;
      const halfIndex = sim.events.findIndex((event) => event.kind === "half") + 1;
      setLive({
        user: sim,
        others: [],
        label: batch?.label ?? "Championship day",
        match,
        cursor: startSecond ? Math.max(halfIndex, 1) : 0,
        phase: startSecond ? "second" : "first",
        openingSheet: save.sheet,
        openingHomeSheet: row.first.homeSheet,
        openingAwaySheet: row.first.awaySheet,
        injuries: row.injuries?.[activeSeat.clubId] ?? [],
      });
      return;
    }
    const batch = nextBatch(championship, save.clubId);
    const match = batch?.userMatch;
    if (!batch || !match) {
      const next = beginBatch("first");
      if (next) setLive({ ...next, phase: "first", cursor: 0 });
      return;
    }
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (!homeId || !awayId) return;
    const rivals = preparedRivals(save, championship);
    commitSolo({ ...save, rivals });
    const squad = ratedSquad(save.clubId, save);
    const userSheet = sitInjuredPlayers(expandSheetToPanel(save.clubId, save.sheet, save.seed), squad, save.condition);
    const homeClub = homeId === save.clubId ? null : rivals[homeId];
    const awayClub = awayId === save.clubId ? null : rivals[awayId];
    const homeSheet =
      homeId === save.clubId
        ? userSheet
        : expandSheetToPanel(homeId, homeClub?.sheet ?? defaultSheet(homeId), save.seed);
    const awaySheet =
      awayId === save.clubId
        ? userSheet
        : expandSheetToPanel(awayId, awayClub?.sheet ?? defaultSheet(awayId), save.seed);
    const homeTactics = homeId === save.clubId ? save.tactics : (homeClub?.tactics ?? clubTactics(homeId, save.balance));
    const awayTactics = awayId === save.clubId ? save.tactics : (awayClub?.tactics ?? clubTactics(awayId, save.balance));
    setLive({
      user: {
        matchId: match.id,
        homeId,
        awayId,
        homeScore: { goals: 0, points: 0 },
        awayScore: { goals: 0, points: 0 },
        events: [],
        homeTactics,
        awayTactics,
        homeSheet,
        awaySheet,
        homeStats: emptyTeamStats(homeId),
        awayStats: emptyTeamStats(awayId),
        players: [],
        coachReport: [],
        climate: rollClimate(save.seed, match.id),
        shots: [],
      },
      others: [],
      label: batch.label,
      match,
      cursor: 0,
      phase: "throw-in",
      openingSheet: userSheet,
      openingHomeSheet: homeSheet,
      openingAwaySheet: awaySheet,
      injuries: [],
    });
  }, [activeSeat, beginBatch, campaign, championship, commitSolo, save]);

  const startThrowIn = useCallback(() => {
    const next = beginBatch("first");
    if (next) setLive({ ...next, phase: "first", cursor: 0 });
  }, [beginBatch]);

  const finishLive = useCallback(
    (current: LiveMatch, extras?: { sheet?: TeamSheet; base?: GameSave }) => {
      if (campaign) {
        setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
        return;
      }
      const base = extras?.base ?? save;
      if (!base) return;
      const squad = ratedSquad(base.clubId, base);
      const sheet = keepClubSheet(extras?.sheet ?? base.sheet, squad);
      const existing = championship.matches.find((match) => match.id === current.user.matchId);
      if (existing && matchPlayed(existing)) {
        setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
        return;
      }
      const user = applyKnockoutExtraTime(current.user, extraTimeOptions(base, current.user, championship));
      const others = current.others.map((item) =>
        applyKnockoutExtraTime(item, extraTimeOptions(base, item, championship)),
      );
      current = { ...current, user, others };
      const updates = [current.user, ...current.others].map((item) => ({
        id: item.matchId,
        homeScore: item.homeScore,
        awayScore: item.awayScore,
      }));
      let next = writeScores(base, updates);
      const reports = { ...next.reports };
      for (const sim of [current.user, ...current.others]) {
        reports[sim.matchId] = reportFromSim(sim);
      }
      next = { ...next, reports };
      for (const sim of [current.user, ...current.others]) {
        const row = championship.matches.find((item) => item.id === sim.matchId);
        if (!row || !knockoutNeedsExtraTime(row.stage, sim.homeScore, sim.awayScore)) continue;
        const replay = replayFixture(row, sim.homeId, sim.awayId, championshipFromSave(next).matches);
        next = withReplayFixture(next, replay);
      }
      next = {
        ...next,
        condition: applyMatchFatigue(
          next.condition,
          sheet.starters,
          sheet.subs,
          extras?.base?.tactics ?? base.tactics,
          ratedSquad(base.clubId, base),
          current.user.events.some((event) => event.kind === "red" && event.teamId === base.clubId),
          base.clubId === current.user.homeId
            ? (current.user.homeChaseEffort ?? 0)
            : base.clubId === current.user.awayId
              ? (current.user.awayChaseEffort ?? 0)
              : 0,
        ),
        trainingDue: true,
        nextMatchPrep: undefined,
      };
      const club = teamById(championship, base.clubId);
      const userMatch = championship.matches.find((match) => match.id === current.user.matchId);
      const sides = userMatch ? resolveMatchSides(championship, userMatch) : { homeId: null, awayId: null };
      const home = sides.homeId ? teamById(championship, sides.homeId) : undefined;
      const away = sides.awayId ? teamById(championship, sides.awayId) : undefined;
      const opponent = sides.homeId === base.clubId ? away : home;
      const ourScore =
        sides.homeId === base.clubId ? current.user.homeScore : current.user.awayScore;
      const theirScore =
        sides.homeId === base.clubId ? current.user.awayScore : current.user.homeScore;
      const result =
        scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
      next = {
        ...next,
        condition: applyMatchForm(
          next.condition,
          squad,
          current.openingSheet,
          sheet,
          current.user.players,
          result,
          base.seed,
          current.user.matchId,
        ),
      };
      const teamworked = applyTeamwork(next.condition, sheet, base.lastSheet, "competitive");
      next = { ...next, condition: teamworked.condition, lastSheet: teamworked.lastSheet };
      for (const rolled of current.injuries) {
        next = { ...next, condition: applyInjury(next.condition, rolled.name, rolled.injury) };
      }
      const rested = recoverAfterMatch(next.condition, squad);
      next = {
        ...next,
        condition: applyMatchSuspensions(
          rested.condition,
          straightRedNamesFromEvents(current.user.events, base.clubId),
        ),
        trainingDue: true,
        nextMatchPrep: undefined,
      };
      next = {
        ...next,
        sheet: sitInjuredPlayers(sheet, squad, next.condition),
      };
      const date = userMatch?.date ?? "";
      const items: NewsItem[] = [];
      if (club && home && away) {
        items.push(
          matchReportItem({
            clubId: base.clubId,
            clubName: club.name,
            homeName: home.name,
            awayName: away.name,
            homeScore: current.user.homeScore,
            awayScore: current.user.awayScore,
            sim: current.user,
            date,
            seed: base.seed,
            stageLabel: userMatch ? matchStageLabel(userMatch) : current.label,
          }),
        );
        if (opponent) {
          const chair = chairmanAfterMatch({
            club,
            opponent,
            ourScore,
            theirScore,
            result,
            date,
            seed: base.seed,
            matchId: current.user.matchId,
            ambition: next.ambition,
          });
          if (chair) items.push(chair);
          const press = localPressItem({
            club,
            opponent,
            ourScore,
            theirScore,
            result,
            date,
            seed: base.seed,
            matchId: current.user.matchId,
            ambition: next.ambition,
            played: next.matches.filter((match) => match.homeScore && match.awayScore).length,
            players: current.user.players,
          });
          items.push(press);
        }
        const replay = championshipFromSave(next).matches.find((item) => item.replayOf === current.user.matchId);
        if (replay && scoresAreLevel(current.user.homeScore, current.user.awayScore)) {
          items.push(
            newsItem({
              kind: "match",
              title: "Replay required",
              body: `${home.name} and ${away.name} could not be separated after extra time. They meet again on ${formatDate(replay.date)}.`,
              date,
              matchId: replay.id,
            }),
          );
        }
      }
      for (const rolled of current.injuries) {
        items.push(
          injuryNews({
            rolled,
            date,
            seed: base.seed,
            key: current.user.matchId,
            clubName: club?.name ?? "the club",
          }),
        );
      }
      for (const name of rested.recovered) {
        items.push(recoveryNews({ name, date, seed: base.seed }));
      }
      const otherLines = current.others.map((other) => {
        const match = championship.matches.find((item) => item.id === other.matchId);
        const otherSides = match ? resolveMatchSides(championship, match) : { homeId: null, awayId: null };
        const otherHome = otherSides.homeId ? teamById(championship, otherSides.homeId) : undefined;
        const otherAway = otherSides.awayId ? teamById(championship, otherSides.awayId) : undefined;
        const stars = other.players
          .filter((row) => row.started)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 1);
        const star = stars[0] ? ` ${stars[0].name} stood out.` : "";
        return `${otherHome?.name ?? "One side"} ${formatScore(other.homeScore)} ${otherAway?.name ?? "the other"} ${formatScore(other.awayScore)}.${star}`;
      });
      const roundup = elsewhereRoundup({
        lines: otherLines,
        date,
        seed: base.seed,
        label: current.label,
      });
      if (roundup) items.push(roundup);
      next = withInbox(next, items);
      next = {
        ...next,
        rivals: applySimsToRivals(
          preparedRivals(base, championship),
          [current.user, ...current.others],
          base.clubId,
          base.seed,
          base.balance,
        ),
      };
      commitSolo(next);
      setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
    },
    [campaign, championship, commitSolo, save],
  );

  const continueSecondHalf = useCallback(
    (tactics: Tactics, sheet: TeamSheet, skipPlayback = false) => {
      if (!save || !live) return;
      if (campaign && activeSeat) {
        const next = submitSecondHalf(campaign, activeSeat.clubId, live.user.matchId, tactics, sheet);
        commitCampaign(next);
        const row = next.week.lives[live.user.matchId];
        const waiting = row ? waitingOnSecondHalf(next, row.matchId) : [];
        if (row?.combined && waiting.length === 0) {
          const halfIndex = row.combined.events.findIndex((event) => event.kind === "half") + 1;
          if (skipPlayback) {
            finishLive(
              {
                ...live,
                user: row.combined,
                phase: "finished",
                cursor: row.combined.events.length,
                injuries: row.injuries?.[activeSeat.clubId] ?? live.injuries,
              },
              { sheet },
            );
            return;
          }
          setLive({
            ...live,
            user: row.combined,
            phase: "second",
            cursor: Math.max(halfIndex, 1),
            injuries: row.injuries?.[activeSeat.clubId] ?? live.injuries,
          });
          return;
        }
        setLive({ ...live, phase: "half-wait" });
        return;
      }
      const squad = ratedSquad(save.clubId, save);
      const hurt = injuredNamesFromEvents(live.user.events, save.clubId);
      const workingSheet = sitInjuredPlayers(sheet, squad, save.condition, hurt);
      commitSolo(withSheet(withTactics(save, tactics), workingSheet));
      const { homeId, awayId } = resolveMatchSides(championship, live.match);
      if (!homeId || !awayId) return;
      const first = live.user;
      const homeTeam = homeId ? teamById(championship, homeId) : undefined;
      const awayTeam = awayId ? teamById(championship, awayId) : undefined;
      const rivals = preparedRivals(save, championship);
      const cpuId = homeId === save.clubId ? awayId : homeId;
      const cpuClub = rivals[cpuId];
      const cpuPlan = cpuClub
        ? pickCpuHalfPlan({
            teamId: cpuId,
            first,
            side: homeId === save.clubId ? "away" : "home",
            condition: cpuClub.condition,
            seed: save.seed,
            difficulty: save.difficulty,
            balance: save.balance,
          })
        : null;
      const extraPause = live.phase === "extra-time" || live.phase === "extra-half";
      const period = live.phase === "extra-time" ? "et1" : live.phase === "extra-half" ? "et2" : "second";
      const second = simulateMatch({
        matchId: first.matchId,
        homeId,
        awayId,
        homeSheet: homeId === save.clubId ? workingSheet : (cpuPlan?.sheet ?? defaultSheet(homeId)),
        awaySheet: awayId === save.clubId ? workingSheet : (cpuPlan?.sheet ?? defaultSheet(awayId)),
        homeTactics: homeId === save.clubId ? tactics : (cpuPlan?.tactics ?? clubTactics(homeId, save.balance)),
        awayTactics: awayId === save.clubId ? tactics : (cpuPlan?.tactics ?? clubTactics(awayId, save.balance)),
        homeCondition: homeId === save.clubId ? save.condition : cpuClub?.condition,
        awayCondition: awayId === save.clubId ? save.condition : cpuClub?.condition,
        homeSquad: ratedSquad(homeId, save),
        awaySquad: ratedSquad(awayId, save),
        remainingWeeks: remainingWeeks(save, championship, save.clubId),
        sentOff: sentOffNamesFromEvents(first.events),
        booked: bookedNamesFromEvents(first.events),
        clubId: save.clubId,
        homeName: homeTeam ? compactName(homeTeam) : homeId,
        awayName: awayTeam ? compactName(awayTeam) : awayId,
        period,
        startHome: first.homeScore,
        startAway: first.awayScore,
        startMomentum: momentumAt(first.events),
        seed: save.seed,
        gameSeed: save.seed,
        balance: save.balance,
        climate: first.climate,
        remainingSubs: {
          home: remainingMatchSubs(
            first.events,
            homeId,
            first.homeSheet,
            homeId === save.clubId ? workingSheet : (cpuPlan?.sheet ?? first.homeClosingSheet ?? first.homeSheet),
          ),
          away: remainingMatchSubs(
            first.events,
            awayId,
            first.awaySheet,
            awayId === save.clubId ? workingSheet : (cpuPlan?.sheet ?? first.awayClosingSheet ?? first.awaySheet),
          ),
        },
        injuryBudget: remainingInjuryBudget(first.events, homeId, awayId),
        performanceBoost: performanceBoostFor(save.difficulty, [save.clubId]),
        homePrep: homeId === save.clubId ? save.nextMatchPrep : cpuClub?.nextMatchPrep,
        awayPrep: awayId === save.clubId ? save.nextMatchPrep : cpuClub?.nextMatchPrep,
        stage: live.match.stage,
      });
      const decorated = decorateUserMatch(second, save);
      const homeSecondSheet = homeId === save.clubId ? workingSheet : (cpuPlan?.sheet ?? defaultSheet(homeId));
      const awaySecondSheet = awayId === save.clubId ? workingSheet : (cpuPlan?.sheet ?? defaultSheet(awayId));
      const withHtSubs = extraPause
        ? decorated.sim
        : {
            ...decorated.sim,
            events: prependHalfTimeSubs(first, decorated.sim, { home: homeSecondSheet, away: awaySecondSheet }),
          };
      const combined = combineHalves(first, withHtSubs, {
        clubId: save.clubId,
        homeName: homeTeam ? compactName(homeTeam) : "one side",
        awayName: awayTeam ? compactName(awayTeam) : "the other side",
        condition: save.condition,
      });
      const injuries = [...live.injuries, ...decorated.injuries];
      const join = first.events.length;
      if (period === "et1") {
        if (skipPlayback || !knockoutNeedsExtraTime(live.match.stage, combined.homeScore, combined.awayScore)) {
          const base = withSheet(withTactics(save, tactics), workingSheet);
          finishLive(
            { ...live, user: combined, phase: "finished", cursor: combined.events.length, injuries },
            { sheet: workingSheet, base },
          );
          return;
        }
        setLive({ ...live, user: combined, phase: "et1", cursor: join, injuries });
        return;
      }
      if (period === "et2") {
        if (skipPlayback) {
          const base = withSheet(withTactics(save, tactics), workingSheet);
          finishLive(
            { ...live, user: combined, phase: "finished", cursor: combined.events.length, injuries },
            { sheet: workingSheet, base },
          );
          return;
        }
        setLive({ ...live, user: combined, phase: "et2", cursor: join, injuries });
        return;
      }
      if (skipPlayback) {
        const base = withSheet(withTactics(save, tactics), workingSheet);
        finishLive(
          { ...live, user: combined, phase: "finished", cursor: combined.events.length, injuries },
          { sheet: workingSheet, base },
        );
        return;
      }
      setLive({
        ...live,
        user: combined,
        phase: "second",
        injuries,
      });
    },
    [activeSeat, campaign, championship, commitCampaign, commitSolo, finishLive, live, save],
  );

  const skipRest = useCallback(
    (tactics: Tactics, sheet: TeamSheet) => {
      continueSecondHalf(tactics, sheet, true);
    },
    [continueSecondHalf],
  );

  const skipMatch = useCallback(() => {
    if (!save) return;
    if (live?.phase === "first") {
      const halfIndex = live.user.events.findIndex((event) => event.kind === "half") + 1;
      setLive({ ...live, cursor: Math.max(halfIndex, 1), phase: "half-time" });
      return;
    }
    if (live?.phase === "second") {
      finishLive(live);
      return;
    }
    if (live?.phase === "et1") {
      const extraHalf =
        live.user.events.findIndex((event) => event.kind === "half" && event.minute >= 63) + 1;
      setLive({ ...live, cursor: Math.max(extraHalf, 1), phase: "extra-half" });
      return;
    }
    if (live?.phase === "et2") {
      finishLive(live);
      return;
    }
    if (live?.phase === "half-wait") return;
    if (live?.phase === "half-time" || live?.phase === "extra-time" || live?.phase === "extra-half") {
      skipRest(save.tactics, save.sheet);
      return;
    }
    if (campaign) {
      goToMatch();
      return;
    }
    const current = beginBatch("full");
    if (!current) return;
    finishLive({ ...current, phase: "finished", cursor: current.user.events.length });
  }, [beginBatch, campaign, finishLive, goToMatch, live, save, skipRest]);

  const advanceLive = useCallback(() => {
    setLive((current) => {
      if (
        !current ||
        current.phase === "throw-in" ||
        current.phase === "finished" ||
        current.phase === "half-time" ||
        current.phase === "half-wait" ||
        current.phase === "extra-time" ||
        current.phase === "extra-half"
      ) {
        return current;
      }
      const nextCursor = Math.min(current.cursor + 1, current.user.events.length);
      const revealed = current.user.events[nextCursor - 1];
      if (current.phase === "first" && revealed?.kind === "half") {
        return { ...current, cursor: nextCursor, phase: "half-time" };
      }
      if (current.phase === "et1" && revealed?.kind === "half" && revealed.minute >= 63) {
        return { ...current, cursor: nextCursor, phase: "extra-half" };
      }
      const next = { ...current, cursor: nextCursor };
      if (current.phase === "second" && nextCursor >= current.user.events.length) {
        if (knockoutNeedsExtraTime(current.match.stage, current.user.homeScore, current.user.awayScore)) {
          return { ...next, phase: "extra-time" };
        }
        queueMicrotask(() => finishLive(next));
      }
      if (current.phase === "et2" && nextCursor >= current.user.events.length) {
        queueMicrotask(() => finishLive(next));
      }
      return next;
    });
  }, [finishLive]);

  const closeLive = useCallback(() => setLive(null), []);

  const setPlans = useCallback(
    (plans: TrainingPlans) => {
      if (campaign && activeSeat) {
        commitCampaign(withClubPlans(campaign, activeSeat.clubId, plans));
        return;
      }
      if (!save) return;
      commitSolo(withPlans(save, plans));
    },
    [activeSeat, campaign, commitCampaign, commitSolo, save],
  );

  const setIntensity = useCallback(
    (intensity: TrainingIntensity) => {
      if (campaign && activeSeat) {
        commitCampaign(withClubTraining(campaign, activeSeat.clubId, { intensity }));
        return;
      }
      if (!save) return;
      commitSolo(withTrainingPrefs(save, { intensity }));
    },
    [activeSeat, campaign, commitCampaign, commitSolo, save],
  );

  const setWeekShape = useCallback(
    (weekShape: WeekShape) => {
      if (campaign && activeSeat) {
        commitCampaign(withClubTraining(campaign, activeSeat.clubId, { weekShape }));
        return;
      }
      if (!save) return;
      commitSolo(withTrainingPrefs(save, { weekShape }));
    },
    [activeSeat, campaign, commitCampaign, commitSolo, save],
  );

  const runMatchPrep = useCallback(
    (prep: MatchPrep) => {
      if (!save || !save.trainingDue || save.phase !== "season") return;
      if (campaign && activeSeat) {
        commitCampaign(trainClubPrep(campaign, activeSeat.clubId, prep));
        return;
      }
      const squad = ratedSquad(save.clubId, save);
      const date = championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
      let next: GameSave = {
        ...save,
        condition: recoverBetweenMatches(save.condition, squad),
        nextMatchPrep: prep,
        trainingDue: false,
        sessionsDone: 0,
        rivals: syncRivalsAfterUserWeek(save, remainingWeeks(save, championship, save.clubId), date),
      };
      next = withInbox(next, [
        newsItem({
          id: `${save.seed}-prep-${date}-${prep}`,
          kind: "training",
          date,
          title: matchPrepTitle(prep),
          body: matchPrepSummary(prep),
        }),
      ]);
      next = ensureMatchBriefing(next, championshipFromSave(next));
      commitSolo(next);
    },
    [activeSeat, campaign, championship, commitCampaign, commitSolo, save],
  );

  const trainWeek = useCallback(
    (session: WeekSession = "mixed") => {
      if (!save || !save.trainingDue) return;
      if (save.phase === "season") return;
      if (campaign && activeSeat) {
        commitCampaign(trainClub(campaign, activeSeat.clubId, session));
        return;
      }
      const squad = ratedSquad(save.clubId, save);
      const club = teamById(championship, save.clubId);
      const date =
        save.phase === "preseason"
          ? (PRESEASON_DATES[save.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "")
          : championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
      const sessionsDone = save.sessionsDone ?? 0;
      const result = applyWeekSession({
        squad,
        condition: save.condition,
        sheet: save.sheet,
        lastSheet: save.lastSheet,
        plans: save.plans,
        phase: save.phase,
        preseasonWeek: save.preseasonWeek,
        sessionsDone,
        intensity: save.intensity ?? DEFAULT_INTENSITY,
        weekShape: save.weekShape ?? DEFAULT_WEEK_SHAPE,
        requestedSession: session,
        seed: save.seed,
        weekKey: `${save.phase}-${save.preseasonWeek}-${date}-${sessionsDone}`,
        remainingWeeks: remainingWeeks(save, championship, save.clubId),
        weekDeltas: save.weekDeltas ?? {},
      });
      let next: GameSave = {
        ...save,
        condition: result.condition,
        sheet: result.sheet,
        trainingDue: result.trainingDue,
        lastSheet: result.lastSheet ?? save.lastSheet,
        sessionsDone: result.sessionsDone,
        trainingDeltas: result.deltas,
        weekDeltas: result.weekComplete ? {} : result.weekDeltas,
      };
      const items: NewsItem[] = result.recovered.map((name) => recoveryNews({ name, date, seed: save.seed }));
      const total = sessionsPerWeek(save.phase);
      if (save.phase === "preseason") {
        if (result.weekComplete) {
          const week = save.preseasonWeek + 1;
          if (week > PRESEASON_WEEKS) {
            next = {
              ...next,
              phase: "season",
              preseasonWeek: week,
              condition: recoverBetweenMatches(next.condition, squad),
              trainingDue: true,
              nextMatchPrep: undefined,
            };
            items.push(
              newsItem({
                id: `${save.seed}-preseason-done`,
                kind: "training",
                date: "2026-07-23",
                title: "Championship week",
                body: `${result.summary} Preseason is over. The panel have their legs back. Work one aspect before Round 1, or go straight to the match.`,
              }),
            );
          } else {
            next = { ...next, preseasonWeek: week, trainingDue: true };
            items.push(
              newsItem({
                id: `${save.seed}-preseason-${save.preseasonWeek}`,
                kind: "training",
                date,
                title: `Preseason week ${save.preseasonWeek} complete`,
                body: result.summary,
              }),
            );
          }
          const coach = weekCoachCopy(squad, result.weekDeltas, `Preseason week ${save.preseasonWeek}`, result.condition);
          items.push(
            newsItem({
              id: `${save.seed}-coach-${save.preseasonWeek}`,
              kind: "briefing",
              date: week > PRESEASON_WEEKS ? "2026-07-23" : date,
              title: coach.title,
              body: coach.body,
              tone: coach.tone,
            }),
          );
        } else {
          items.push(
            newsItem({
              id: `${save.seed}-preseason-${save.preseasonWeek}-${sessionsDone + 1}`,
              kind: "training",
              date,
              title: `Preseason week ${save.preseasonWeek} · session ${sessionsDone + 1} of ${total}`,
              body: result.summary,
            }),
          );
        }
      } else {
        items.push(
          newsItem({
            id: `${save.seed}-midweek-${date}`,
            kind: "training",
            date,
            title: "Midweek session",
            body: result.summary,
          }),
        );
        const coach = weekCoachCopy(squad, result.weekDeltas, "Midweek", result.condition);
        items.push(
          newsItem({
            id: `${save.seed}-coach-midweek-${date}`,
            kind: "briefing",
            date,
            title: coach.title,
            body: coach.body,
            tone: coach.tone,
          }),
        );
      }
      for (const rolled of result.freshInjuries) {
        items.push(
          injuryNews({
            rolled,
            date,
            seed: save.seed,
            key: `train-${date}-${rolled.name}-${sessionsDone}`,
            clubName: club?.name ?? "the club",
          }),
        );
      }
      if (result.weekComplete) {
        next = {
          ...next,
          rivals: syncRivalsAfterUserWeek(save, remainingWeeks(save, championship, save.clubId), date),
        };
      }
      next = withInbox(next, items);
      next = ensureMatchBriefing(next, championshipFromSave(next));
      commitSolo(next);
    },
    [activeSeat, campaign, championship, commitCampaign, commitSolo, save],
  );

  const trainFullWeek = useCallback(
    (weekShape: WeekShape) => {
      if (!save || !save.trainingDue) return;
      if (save.phase === "season") return;
      if (campaign && activeSeat) {
        commitCampaign(trainClubWeek(campaign, activeSeat.clubId, weekShape));
        return;
      }
      const squad = ratedSquad(save.clubId, save);
      const club = teamById(championship, save.clubId);
      const date =
        save.phase === "preseason"
          ? (PRESEASON_DATES[save.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "")
          : championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
      const sessionsDone = save.sessionsDone ?? 0;
      const result = applyFullTrainingWeek({
        squad,
        condition: save.condition,
        sheet: save.sheet,
        lastSheet: save.lastSheet,
        plans: save.plans,
        phase: save.phase,
        preseasonWeek: save.preseasonWeek,
        sessionsDone,
        intensity: save.intensity ?? DEFAULT_INTENSITY,
        weekShape,
        requestedSession: "mixed",
        seed: save.seed,
        weekKey: `${save.phase}-${save.preseasonWeek}-${date}-${sessionsDone}`,
        remainingWeeks: remainingWeeks(save, championship, save.clubId),
        weekDeltas: save.weekDeltas ?? {},
      });
      let next: GameSave = {
        ...save,
        weekShape,
        condition: result.condition,
        sheet: result.sheet,
        trainingDue: result.trainingDue,
        lastSheet: result.lastSheet ?? save.lastSheet,
        sessionsDone: result.sessionsDone,
        trainingDeltas: result.deltas,
        weekDeltas: result.weekComplete ? {} : result.weekDeltas,
      };
      const items: NewsItem[] = result.recovered.map((name) => recoveryNews({ name, date, seed: save.seed }));
      if (save.phase === "preseason") {
        const week = save.preseasonWeek + (result.weekComplete ? 1 : 0);
        if (result.weekComplete && week > PRESEASON_WEEKS) {
          next = {
            ...next,
            phase: "season",
            preseasonWeek: week,
            condition: recoverBetweenMatches(next.condition, squad),
            trainingDue: true,
            nextMatchPrep: undefined,
          };
          items.push(
            newsItem({
              id: `${save.seed}-preseason-done`,
              kind: "training",
              date: "2026-07-23",
              title: "Championship week",
              body: `${result.summary} Preseason is over. The panel have their legs back. Work one aspect before Round 1, or go straight to the match.`,
            }),
          );
        } else if (result.weekComplete) {
          next = { ...next, preseasonWeek: week, trainingDue: true };
          items.push(
            newsItem({
              id: `${save.seed}-preseason-${save.preseasonWeek}`,
              kind: "training",
              date,
              title: `Preseason week ${save.preseasonWeek} complete`,
              body: result.summary,
            }),
          );
        } else {
          items.push(
            newsItem({
              id: `${save.seed}-preseason-${save.preseasonWeek}-week`,
              kind: "training",
              date,
              title: `Preseason week ${save.preseasonWeek}`,
              body: result.summary,
            }),
          );
        }
        if (result.weekComplete) {
          const coach = weekCoachCopy(squad, result.weekDeltas, `Preseason week ${save.preseasonWeek}`, result.condition);
          items.push(
            newsItem({
              id: `${save.seed}-coach-${save.preseasonWeek}`,
              kind: "briefing",
              date: week > PRESEASON_WEEKS ? "2026-07-23" : date,
              title: coach.title,
              body: coach.body,
              tone: coach.tone,
            }),
          );
        }
      } else {
        items.push(
          newsItem({
            id: `${save.seed}-midweek-${date}`,
            kind: "training",
            date,
            title: "Midweek session",
            body: result.summary,
          }),
        );
        const coach = weekCoachCopy(squad, result.weekDeltas, "Midweek", result.condition);
        items.push(
          newsItem({
            id: `${save.seed}-coach-midweek-${date}`,
            kind: "briefing",
            date,
            title: coach.title,
            body: coach.body,
            tone: coach.tone,
          }),
        );
      }
      for (const rolled of result.freshInjuries) {
        items.push(
          injuryNews({
            rolled,
            date,
            seed: save.seed,
            key: `train-week-${date}-${rolled.name}`,
            clubName: club?.name ?? "the club",
          }),
        );
      }
      if (result.weekComplete) {
        next = {
          ...next,
          rivals: syncRivalsAfterUserWeek(save, remainingWeeks(save, championship, save.clubId), date),
        };
      }
      next = withInbox(next, items);
      next = ensureMatchBriefing(next, championshipFromSave(next));
      commitSolo(next);
    },
    [activeSeat, campaign, championship, commitCampaign, commitSolo, save],
  );

  const readNews = useCallback(
    (id: string) => {
      if (campaign && activeSeat) {
        const club = campaign.clubs[activeSeat.clubId];
        if (!club) return;
        commitCampaign({
          ...campaign,
          clubs: {
            ...campaign.clubs,
            [activeSeat.clubId]: { ...club, inbox: markNewsRead(club.inbox, id) },
          },
        });
        return;
      }
      if (!save) return;
      commitSolo({ ...save, inbox: markNewsRead(save.inbox, id) });
    },
    [activeSeat, campaign, commitCampaign, commitSolo, save],
  );

  const confirmWeek = useCallback(() => {
    if (!campaign || !activeSeat) return;
    commitCampaign(readyClub(campaign, activeSeat.clubId));
  }, [activeSeat, campaign, commitCampaign]);

  const undoReady = useCallback(() => {
    if (!campaign || !activeSeat) return;
    commitCampaign(unreadyClub(campaign, activeSeat.clubId));
  }, [activeSeat, campaign, commitCampaign]);

  const forceWeek = useCallback(() => {
    if (!campaign) return;
    commitCampaign(forceAdvance(campaign, activePlayerId));
  }, [activePlayerId, campaign, commitCampaign]);

  const changeWaitHours = useCallback(
    (hours: WaitHours) => {
      if (!campaign) return;
      commitCampaign(setWaitHours(campaign, hours, activePlayerId));
    },
    [activePlayerId, campaign, commitCampaign],
  );

  const copyCode = useCallback(async () => {
    if (!campaign) return;
    await navigator.clipboard.writeText(campaign.code);
  }, [campaign]);

  const copySnapshot = useCallback(async () => {
    if (!campaign) return;
    await navigator.clipboard.writeText(exportCampaign(campaign));
  }, [campaign]);

  const fixtureBatch = save ? nextBatch(championship, save.clubId) : null;
  const batch = save && save.phase === "season" ? fixtureBatch : null;
  const liveRow = campaign && activeSeat ? liveForClub(campaign, activeSeat.clubId) : undefined;
  const liveMatch = liveRow
    ? championship.matches.find((match) => match.id === liveRow.matchId)
    : undefined;
  const nextUserMatch =
    liveRow && liveMatch && !matchPlayed(liveMatch) ? liveMatch : fixtureBatch?.userMatch ?? null;
  const playedCount = championship.matches.filter(matchPlayed).length;
  const waitingHalf = liveRow && liveMatch && !matchPlayed(liveMatch)
    ? waitingOnSecondHalf(campaign!, liveRow.matchId)
    : [];

  const championId = championshipWinnerId(championship);
  const finaleStep = seasonFinaleStep(championId, campaign?.seasonWrap ?? save?.seasonWrap);

  return {
    save,
    campaign,
    player,
    activeSeat,
    localSeats,
    championship,
    live,
    picked,
    viewTeamId: viewTeamId ?? save?.clubId ?? null,
    setViewTeamId,
    batch,
    nextUserMatch,
    playedCount,
    waitingHalf,
    roomStatus,
    retryRoom,
    refreshRoom,
    championId,
    finaleStep,
    takeCharge,
    hostCampaign,
    joinCampaign,
    previewJoinTaken,
    addHotseat,
    startLobby,
    leaveCampaign,
    resign,
    setSeasonWrap,
    startNewSeason,
    setTactics,
    setSheet,
    setPlans,
    setIntensity,
    setWeekShape,
    tapPlayer,
    swapPlayers,
    setPicked,
    goToMatch,
    startThrowIn,
    skipMatch,
    advanceLive,
    closeLive,
    continueSecondHalf,
    skipRest,
    trainWeek,
    trainFullWeek,
    runMatchPrep,
    confirmWeek,
    undoReady,
    forceWeek,
    passDevice,
    changeWaitHours,
    copyCode,
    copySnapshot,
    readNews,
    tacticsLocked: Boolean(campaign && activeSeat && preMatchTacticsLocked(campaign, activeSeat.clubId)),
  };
}
