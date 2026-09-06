import { useCallback, useEffect, useMemo, useState } from "react";
import { seedChampionship } from "../data/championship";
import { compactName } from "../lib/display";
import { momentumAt, simulateMatch } from "../lib/matchEngine";
import { combineHalves, reportFromSim } from "../lib/matchStats";
import { applyMatchMood } from "../lib/mood";
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
  withClubSheet,
  withClubTactics,
} from "../lib/multiplayer/campaign";
import { randomId } from "../lib/multiplayer/codes";
import {
  clearLocalSeats,
  ensurePlayer,
  isLocalSeat,
  rememberLocalSeat,
  setPlayerName,
} from "../lib/multiplayer/identity";
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
import { formatScore, formatScoreWithTotal, matchPlayed, scoreTotal, stageLabel } from "../lib/scoring";
import {
  applyMatchFatigue,
  applyTraining,
  PRESEASON_DATES,
  PRESEASON_WEEKS,
} from "../lib/training";
import {
  championshipFromSave,
  clearSave,
  loadSave,
  newSave,
  persistSave,
  withInbox,
  withSheet,
  withTactics,
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
  TrainingFocus,
  WaitHours,
} from "../types";

export type LiveMatch = {
  user: SimulatedMatch;
  others: SimulatedMatch[];
  label: string;
  match: Match;
  cursor: number;
  phase: LivePhase;
  openingSheet: TeamSheet;
};

function newsId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  }, []);

  useEffect(() => {
    if (!campaign) return;
    const timer = window.setInterval(() => {
      setCampaign((current) => {
        if (!current) return current;
        const next = tickCampaign(current, Date.now());
        if (next.revision !== current.revision) persistCampaign(next);
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
    const welcome: NewsItem = {
      id: newsId(),
      date: PRESEASON_DATES[0],
      title: `Welcome to ${club?.name ?? "the club"}`,
      body: `Preseason is underway. Six weeks of training before Round 1. Work the panel, watch match fitness, then set your championship fifteen.`,
    };
    commitSolo(withInbox(started, [welcome]));
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
    (payload: { name: string; clubId: string; code: string; snapshot?: string }) => {
      const snapshot = payload.snapshot ? parseCampaignInvite(payload.snapshot) : null;
      const room = snapshot ?? loadRoom(payload.code) ?? (campaign?.code === payload.code ? campaign : null);
      if (!room) return { ok: false as const, error: "No championship for that invite. Try the snapshot from the host." };
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

  const previewJoinTaken = useCallback(
    (code: string, snapshot?: string) => {
      const room = (snapshot ? parseCampaignInvite(snapshot) : null) ?? loadRoom(code) ?? campaign;
      return room?.seats.map((seat) => seat.clubId) ?? [];
    },
    [campaign],
  );

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
      if (!editingOwnTeam) {
        setPicked(name);
        return;
      }
      swapPlayers(picked, name);
    },
    [picked, save?.clubId, swapPlayers, viewTeamId],
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

      const simulated = batch.matches
        .map((match) => {
          const { homeId, awayId } = resolveMatchSides(championship, match);
          if (!homeId || !awayId) return null;
          const isUser = homeId === save.clubId || awayId === save.clubId;
          const homeTeam = teamById(championship, homeId);
          const awayTeam = teamById(championship, awayId);
          return simulateMatch({
            matchId: match.id,
            homeId,
            awayId,
            homeSheet: homeId === save.clubId ? save.sheet : defaultSheet(homeId),
            awaySheet: awayId === save.clubId ? save.sheet : defaultSheet(awayId),
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
          phase: "finished",
          openingSheet: save.sheet,
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
        openingSheet: save.sheet,
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
      const ourScore =
        sides.homeId === base.clubId ? current.user.homeScore : current.user.awayScore;
      const theirScore =
        sides.homeId === base.clubId ? current.user.awayScore : current.user.homeScore;
      const result =
        scoreTotal(ourScore) > scoreTotal(theirScore) ? "win" : scoreTotal(ourScore) < scoreTotal(theirScore) ? "loss" : "draw";
      next = {
        ...next,
        condition: applyMatchMood(
          next.condition,
          ratedSquad(base.clubId),
          current.openingSheet,
          sheet,
          current.user.players,
          result,
        ),
      };
      const coach = current.user.coachReport.join(" ");
      const items: NewsItem[] = [
        {
          id: newsId(),
          date: userMatch?.date ?? "",
          title: `${home?.name ?? "Home"} ${formatScore(current.user.homeScore)} ${away?.name ?? "Away"} ${formatScore(current.user.awayScore)}`,
          body: `${club?.name} ${current.label.toLowerCase()} finishes ${formatScoreWithTotal(current.user.homeScore)} to ${formatScoreWithTotal(current.user.awayScore)}. Coach: ${coach}`,
          matchId: current.user.matchId,
        },
      ];
      for (const other of current.others) {
        const match = championship.matches.find((item) => item.id === other.matchId);
        const otherSides = match ? resolveMatchSides(championship, match) : { homeId: null, awayId: null };
        const otherHome = otherSides.homeId ? teamById(championship, otherSides.homeId) : undefined;
        const otherAway = otherSides.awayId ? teamById(championship, otherSides.awayId) : undefined;
        items.push({
          id: newsId(),
          date: match?.date ?? "",
          title: `${otherHome?.name ?? "Home"} ${formatScore(other.homeScore)} ${otherAway?.name ?? "Away"} ${formatScore(other.awayScore)}`,
          body: `${match ? stageLabel(match.stage, match.round) : current.label} elsewhere is in.`,
          matchId: other.matchId,
        });
      }
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
            finishLive({ ...live, user: row.combined, phase: "finished", cursor: row.combined.events.length }, { sheet });
            return;
          }
          setLive({
            ...live,
            user: row.combined,
            phase: "second",
            cursor: Math.max(halfIndex, 1),
          });
          return;
        }
        setLive({ ...live, phase: "half-wait" });
        return;
      }
      commitSolo(withSheet(withTactics(save, tactics), sheet));
      const { homeId, awayId } = resolveMatchSides(championship, live.match);
      if (!homeId || !awayId) return;
      const first = live.user;
      const homeTeam = homeId ? teamById(championship, homeId) : undefined;
      const awayTeam = awayId ? teamById(championship, awayId) : undefined;
      const second = simulateMatch({
        matchId: first.matchId,
        homeId,
        awayId,
        homeSheet: homeId === save.clubId ? sheet : defaultSheet(homeId),
        awaySheet: awayId === save.clubId ? sheet : defaultSheet(awayId),
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
      const combined = combineHalves(first, second, {
        clubId: save.clubId,
        homeName: homeTeam ? compactName(homeTeam) : "Home",
        awayName: awayTeam ? compactName(awayTeam) : "Away",
      });
      if (skipPlayback) {
        const base = withSheet(withTactics(save, tactics), sheet);
        finishLive({ ...live, user: combined, phase: "finished", cursor: combined.events.length }, { sheet, base });
        return;
      }
      setLive({
        ...live,
        user: combined,
        phase: "second",
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

  const trainWeek = useCallback(
    (focus: TrainingFocus) => {
      if (!save || !save.trainingDue) return;
      if (campaign && activeSeat) {
        commitCampaign(trainClub(campaign, activeSeat.clubId, focus));
        return;
      }
      const squad = ratedSquad(save.clubId);
      const result = applyTraining(squad, save.condition, focus);
      const date =
        save.phase === "preseason"
          ? (PRESEASON_DATES[save.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "")
          : championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
      let next: GameSave = {
        ...save,
        condition: result.condition,
        trainingDue: false,
      };
      if (save.phase === "preseason") {
        const week = save.preseasonWeek + 1;
        if (week > PRESEASON_WEEKS) {
          next = {
            ...next,
            phase: "season",
            preseasonWeek: week,
            trainingDue: false,
          };
          next = withInbox(next, [
            {
              id: newsId(),
              date: "2026-07-23",
              title: "Championship week",
              body: result.summary + " Preseason is over. Pick your fifteen — Round 1 is next.",
            },
          ]);
        } else {
          next = { ...next, preseasonWeek: week, trainingDue: true };
          next = withInbox(next, [
            {
              id: newsId(),
              date,
              title: `Preseason week ${save.preseasonWeek} complete`,
              body: result.summary,
            },
          ]);
        }
      } else {
        next = withInbox(next, [
          {
            id: newsId(),
            date,
            title: "Midweek session",
            body: result.summary,
          },
        ]);
      }
      commitSolo(next);
    },
    [activeSeat, campaign, championship.matches, commitCampaign, commitSolo, save],
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
    takeCharge,
    hostCampaign,
    joinCampaign,
    previewJoinTaken,
    addHotseat,
    startLobby,
    leaveCampaign,
    resign,
    setTactics,
    tapPlayer,
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
  };
}
