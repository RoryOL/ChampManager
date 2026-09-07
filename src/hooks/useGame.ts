import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { seedChampionship } from "../data/championship";
import { compactName } from "../lib/display";
import { momentumAt, simulateMatch } from "../lib/matchEngine";
import { combineHalves, reportFromSim } from "../lib/matchStats";
import { applyMatchMood, applyNewsMood } from "../lib/mood";
import {
  addSeat,
  championshipOf,
  createCampaign,
  forceAdvance,
  liveForClub,
  readyClub,
  saveFromCampaign,
  setWaitHours,
  startCampaign,
  submitSecondHalf,
  tickCampaign,
  trainClub,
  unreadyClub,
  waitingOnSecondHalf,
  withClubPlans,
  withClubSheet,
  withClubTactics,
  withClubTraining,
} from "../lib/multiplayer/campaign";
import { randomId } from "../lib/multiplayer/codes";
import {
  clearLocalSeats,
  ensurePlayer,
  isLocalSeat,
  rememberLocalSeat,
  setPlayerName,
} from "../lib/multiplayer/identity";
import { mergeCampaigns } from "../lib/multiplayer/merge";
import { connectRoom, fetchRoom, type RoomStatus } from "../lib/multiplayer/remote";
import {
  clearCampaign,
  exportCampaign,
  loadCampaign,
  loadRoom,
  parseCampaignInvite,
  persistCampaign,
} from "../lib/multiplayer/store";
import { clubTactics, defaultSheet, ratedSquad, swapPlayersInSheet } from "../lib/players";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { nextBatch } from "../lib/schedule";
import { formatScore, matchPlayed, scoreTotal, stageLabel } from "../lib/scoring";
import {
  applyInjury,
  injuredNamesFromEvents,
  insertInjuryEvents,
  rollMatchInjuries,
  sitInjuredPlayers,
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
  applyWeekSession,
  DEFAULT_INTENSITY,
  DEFAULT_WEEK_SHAPE,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
  sessionsPerWeek,
} from "../lib/training";
import { ensureMatchBriefing } from "../lib/briefing";
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
} from "../types";

export type LiveMatch = {
  user: SimulatedMatch;
  others: SimulatedMatch[];
  label: string;
  match: Match;
  cursor: number;
  phase: LivePhase;
  openingSheet: TeamSheet;
  injuries: RolledInjury[];
};

function decorateUserMatch(
  sim: SimulatedMatch,
  save: GameSave,
  championship: Championship,
  period: "first" | "second" | "full",
  sheet?: TeamSheet,
): { sim: SimulatedMatch; injuries: RolledInjury[] } {
  if (sim.homeId !== save.clubId && sim.awayId !== save.clubId) {
    return { sim, injuries: [] };
  }
  const squad = ratedSquad(save.clubId);
  const injuries = rollMatchInjuries({
    clubId: save.clubId,
    squad,
    condition: save.condition,
    seed: save.seed,
    matchId: sim.matchId,
    period,
    remainingWeeks: remainingWeeks(save, championship, save.clubId),
    teamId: save.clubId,
    played: sim.players
      .filter((row) => row.teamId === save.clubId)
      .map((row) => ({ name: row.name, minutes: row.minutes, started: row.started })),
  });
  const usedSheet = sheet ?? (sim.homeId === save.clubId ? sim.homeSheet : sim.awaySheet);
  return { sim: insertInjuryEvents(sim, injuries, { clubId: save.clubId, squad, sheet: usedSheet }), injuries };
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
  const campaignRef = useRef<Campaign | null>(null);
  const roomRef = useRef<{ publish: (campaign: Campaign) => void; disconnect: () => void } | null>(null);

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
          const merged = mergeCampaigns(current, remote);
          if (JSON.stringify(merged) === JSON.stringify(current)) return current;
          persistCampaign(merged);
          if (JSON.stringify(merged) !== JSON.stringify(remote)) handle.publish(merged);
          return merged;
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
  }, [campaign?.code]);

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

  const takeCharge = useCallback((clubId: string) => {
    const club = teamById(seedChampionship, clubId);
    const started = newSave(clubId);
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
    (payload: { name: string; clubId: string; waitHours: WaitHours }) => {
      const self = setPlayerName(payload.name);
      setPlayer(self);
      rememberLocalSeat(self.id);
      const created = createCampaign({
        hostPlayerId: self.id,
        hostName: self.name,
        clubId: payload.clubId,
        waitHours: payload.waitHours,
      });
      commitCampaign(created);
      setActivePlayerId(self.id);
      setViewTeamId(payload.clubId);
      setLive(null);
    },
    [commitCampaign],
  );

  const joinCampaign = useCallback(
    async (payload: { name: string; clubId: string; code: string; snapshot?: string }) => {
      const snapshot = payload.snapshot ? parseCampaignInvite(payload.snapshot) : null;
      const room =
        snapshot ??
        loadRoom(payload.code) ??
        (campaign?.code === payload.code ? campaign : null) ??
        (await fetchRoom(payload.code));
      if (!room) {
        return {
          ok: false as const,
          error: "No championship for that invite. Check the code — both phones need a connection — or paste a snapshot.",
        };
      }
      const self = setPlayerName(payload.name);
      setPlayer(self);
      const seatId = room.seats.some((seat) => seat.playerId === self.id) ? randomId() : self.id;
      rememberLocalSeat(seatId);
      const joined = addSeat(room, { playerId: seatId, name: self.name, clubId: payload.clubId });
      if (!joined.ok) return joined;
      commitCampaign(joined.campaign);
      setActivePlayerId(seatId);
      setViewTeamId(payload.clubId);
      setLive(null);
      return { ok: true as const };
    },
    [campaign, commitCampaign],
  );

  const previewJoinTaken = useCallback(async (code: string, snapshot?: string) => {
    const room =
      (snapshot ? parseCampaignInvite(snapshot) : null) ??
      loadRoom(code) ??
      (campaign?.code === code ? campaign : null) ??
      (await fetchRoom(code));
    return room?.seats.map((seat) => seat.clubId) ?? [];
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
      if (!save) return;
      const sheet = swapPlayersInSheet(save.sheet, first, second);
      if (campaign && activeSeat) {
        commitCampaign(withClubSheet(campaign, activeSeat.clubId, sheet));
      } else {
        commitSolo(withSheet(save, sheet));
      }
      setPicked(null);
    },
    [activeSeat, campaign, commitCampaign, commitSolo, save],
  );

  const tapPlayer = useCallback(
    (name: string) => {
      const editingOwnTeam = !viewTeamId || viewTeamId === save?.clubId;
      if (!picked) {
        setPicked(name);
        return;
      }
      if (picked === name) {
        setPicked(null);
        return;
      }
      if (!editingOwnTeam || !save) {
        setPicked(name);
        return;
      }
      const inSheet = (player: string) => save.sheet.starters.includes(player) || save.sheet.subs.includes(player);
      const pickedOut = Boolean(save.condition[picked]?.injury && save.condition[picked]?.injury?.weeksLeft);
      const nameOut = Boolean(save.condition[name]?.injury && save.condition[name]?.injury?.weeksLeft);
      if ((nameOut && !inSheet(name)) || (pickedOut && !inSheet(picked))) {
        setPicked(name);
        return;
      }
      swapPlayers(picked, name);
    },
    [picked, save, swapPlayers, viewTeamId],
  );

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

      const squad = ratedSquad(save.clubId);
      const userSheet = sitInjuredPlayers(save.sheet, squad, save.condition);
      let injuries: RolledInjury[] = [];
      const simulated = batch.matches
        .map((match) => {
          const { homeId, awayId } = resolveMatchSides(championship, match);
          if (!homeId || !awayId) return null;
          const isUser = homeId === save.clubId || awayId === save.clubId;
          const homeTeam = teamById(championship, homeId);
          const awayTeam = teamById(championship, awayId);
          const sim = simulateMatch({
            matchId: match.id,
            homeId,
            awayId,
            homeSheet: homeId === save.clubId ? userSheet : defaultSheet(homeId),
            awaySheet: awayId === save.clubId ? userSheet : defaultSheet(awayId),
            homeTactics: homeId === save.clubId ? save.tactics : clubTactics(homeId),
            awayTactics: awayId === save.clubId ? save.tactics : clubTactics(awayId),
            homeCondition: homeId === save.clubId ? save.condition : undefined,
            awayCondition: awayId === save.clubId ? save.condition : undefined,
            clubId: save.clubId,
            homeName: homeTeam ? compactName(homeTeam) : homeId,
            awayName: awayTeam ? compactName(awayTeam) : awayId,
            period: isUser && mode === "first" ? "first" : "full",
            seed: save.seed,
          });
          if (!isUser) return sim;
          const decorated = decorateUserMatch(sim, save, championship, mode === "first" ? "first" : "full", userSheet);
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
        injuries: row.injuries?.[activeSeat.clubId] ?? [],
      });
      return;
    }
    const next = beginBatch("first");
    if (next) setLive({ ...next, phase: "first", cursor: 0 });
  }, [activeSeat, beginBatch, campaign, championship, save]);

  const finishLive = useCallback(
    (current: LiveMatch, extras?: { sheet?: TeamSheet; base?: GameSave }) => {
      if (campaign) {
        setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
        return;
      }
      const base = extras?.base ?? save;
      if (!base) return;
      const sheet = extras?.sheet ?? base.sheet;
      const existing = championship.matches.find((match) => match.id === current.user.matchId);
      if (existing && matchPlayed(existing)) {
        setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
        return;
      }
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
      next = {
        ...next,
        condition: applyMatchFatigue(
          next.condition,
          sheet.starters,
          sheet.subs,
          extras?.base?.tactics ?? base.tactics,
          ratedSquad(base.clubId),
        ),
        trainingDue: true,
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
      const squad = ratedSquad(base.clubId);
      next = {
        ...next,
        condition: applyMatchMood(
          next.condition,
          squad,
          current.openingSheet,
          sheet,
          current.user.players,
          result,
        ),
      };
      const teamworked = applyTeamwork(next.condition, sheet, base.lastSheet, "competitive");
      next = { ...next, condition: teamworked.condition, lastSheet: teamworked.lastSheet };
      for (const rolled of current.injuries) {
        next = { ...next, condition: applyInjury(next.condition, rolled.name, rolled.injury) };
      }
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
            stageLabel: userMatch ? stageLabel(userMatch.stage, userMatch.round) : current.label,
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
          });
          items.push(press);
          if (press.tone === "negative") {
            next = {
              ...next,
              condition: applyNewsMood(
                next.condition,
                squad.map((player) => player.name),
                -7,
                "The local paper went after the team.",
              ),
            };
          }
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
        return `${otherHome?.name ?? "Home"} ${formatScore(other.homeScore)} ${otherAway?.name ?? "Away"} ${formatScore(other.awayScore)}.${star}`;
      });
      const roundup = elsewhereRoundup({
        lines: otherLines,
        date,
        seed: base.seed,
        label: current.label,
      });
      if (roundup) items.push(roundup);
      next = withInbox(next, items);
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
      const squad = ratedSquad(save.clubId);
      const hurt = injuredNamesFromEvents(live.user.events, save.clubId);
      const workingSheet = sitInjuredPlayers(sheet, squad, save.condition, hurt);
      commitSolo(withSheet(withTactics(save, tactics), workingSheet));
      const { homeId, awayId } = resolveMatchSides(championship, live.match);
      if (!homeId || !awayId) return;
      const first = live.user;
      const homeTeam = homeId ? teamById(championship, homeId) : undefined;
      const awayTeam = awayId ? teamById(championship, awayId) : undefined;
      const second = simulateMatch({
        matchId: first.matchId,
        homeId,
        awayId,
        homeSheet: homeId === save.clubId ? workingSheet : defaultSheet(homeId),
        awaySheet: awayId === save.clubId ? workingSheet : defaultSheet(awayId),
        homeTactics: homeId === save.clubId ? tactics : clubTactics(homeId),
        awayTactics: awayId === save.clubId ? tactics : clubTactics(awayId),
        homeCondition: homeId === save.clubId ? save.condition : undefined,
        awayCondition: awayId === save.clubId ? save.condition : undefined,
        clubId: save.clubId,
        homeName: homeTeam ? compactName(homeTeam) : homeId,
        awayName: awayTeam ? compactName(awayTeam) : awayId,
        period: "second",
        startHome: first.homeScore,
        startAway: first.awayScore,
        startMomentum: momentumAt(first.events),
        seed: save.seed,
        climate: first.climate,
      });
      const decorated = decorateUserMatch(second, save, championship, "second", workingSheet);
      const combined = combineHalves(first, decorated.sim, {
        clubId: save.clubId,
        homeName: homeTeam ? compactName(homeTeam) : "Home",
        awayName: awayTeam ? compactName(awayTeam) : "Away",
      });
      const injuries = [...live.injuries, ...decorated.injuries];
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
    if (live?.phase === "half-wait") return;
    if (live?.phase === "half-time") {
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
      if (!current || current.phase === "finished" || current.phase === "half-time" || current.phase === "half-wait") {
        return current;
      }
      const nextCursor = Math.min(current.cursor + 1, current.user.events.length);
      const revealed = current.user.events[nextCursor - 1];
      if (current.phase === "first" && revealed?.kind === "half") {
        return { ...current, cursor: nextCursor, phase: "half-time" };
      }
      const next = { ...current, cursor: nextCursor };
      if (current.phase === "second" && nextCursor >= current.user.events.length) {
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

  const trainWeek = useCallback(
    (session: WeekSession = "mixed") => {
      if (!save || !save.trainingDue) return;
      if (campaign && activeSeat) {
        commitCampaign(trainClub(campaign, activeSeat.clubId, session));
        return;
      }
      const squad = ratedSquad(save.clubId);
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
      });
      let next: GameSave = {
        ...save,
        condition: result.condition,
        sheet: result.sheet,
        trainingDue: result.trainingDue,
        lastSheet: result.lastSheet ?? save.lastSheet,
        sessionsDone: result.sessionsDone,
        trainingDeltas: result.deltas,
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
              trainingDue: false,
            };
            items.push(
              newsItem({
                id: `${save.seed}-preseason-done`,
                kind: "training",
                date: "2026-07-23",
                title: "Championship week",
                body: `${result.summary} Preseason is over. Pick your fifteen — Round 1 is next.`,
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

  const batch = save && save.phase === "season" ? nextBatch(championship, save.clubId) : null;
  const liveRow = campaign && activeSeat ? liveForClub(campaign, activeSeat.clubId) : undefined;
  const liveMatch = liveRow
    ? championship.matches.find((match) => match.id === liveRow.matchId)
    : undefined;
  const nextUserMatch =
    liveRow && liveMatch && !matchPlayed(liveMatch) ? liveMatch : batch?.userMatch ?? null;
  const playedCount = championship.matches.filter(matchPlayed).length;
  const waitingHalf = liveRow && liveMatch && !matchPlayed(liveMatch)
    ? waitingOnSecondHalf(campaign!, liveRow.matchId)
    : [];

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
    takeCharge,
    hostCampaign,
    joinCampaign,
    previewJoinTaken,
    addHotseat,
    startLobby,
    leaveCampaign,
    resign,
    setTactics,
    setPlans,
    setIntensity,
    setWeekShape,
    tapPlayer,
    swapPlayers,
    setPicked,
    goToMatch,
    skipMatch,
    advanceLive,
    closeLive,
    continueSecondHalf,
    skipRest,
    trainWeek,
    confirmWeek,
    undoReady,
    forceWeek,
    passDevice,
    changeWaitHours,
    copyCode,
    copySnapshot,
    readNews,
  };
}
