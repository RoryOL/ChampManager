import { useCallback, useMemo, useState } from "react";
import { seedChampionship } from "../data/championship";
import { compactName } from "../lib/display";
import { momentumAt, simulateMatch } from "../lib/matchEngine";
import { combineHalves, reportFromSim } from "../lib/matchStats";
import { applyMatchMood } from "../lib/mood";
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
  Championship,
  GameSave,
  LivePhase,
  Match,
  NewsItem,
  SimulatedMatch,
  Tactics,
  TeamSheet,
  TrainingFocus,
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

export function useGame() {
  const [save, setSave] = useState<GameSave | null>(() => loadSave());
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);

  const championship: Championship = useMemo(
    () => (save ? championshipFromSave(save) : seedChampionship),
    [save],
  );

  const commit = useCallback((next: GameSave) => {
    persistSave(next);
    setSave(next);
  }, []);

  const takeCharge = useCallback((clubId: string) => {
    const club = teamById(seedChampionship, clubId);
    const started = newSave(clubId);
    const welcome: NewsItem = {
      id: newsId(),
      date: PRESEASON_DATES[0],
      title: `Welcome to ${club?.name ?? "the club"}`,
      body: `Preseason is underway. Six weeks of training before Round 1. Work the panel, watch the fatigue, then set your championship fifteen.`,
    };
    commit(withInbox(started, [welcome]));
    setLive(null);
    setPicked(null);
    setViewTeamId(clubId);
  }, [commit]);

  const resign = useCallback(() => {
    clearSave();
    setSave(null);
    setLive(null);
    setPicked(null);
    setViewTeamId(null);
  }, []);

  const setTactics = useCallback(
    (tactics: Tactics) => {
      if (!save) return;
      commit(withTactics(save, tactics));
    },
    [commit, save],
  );

  const swapPlayers = useCallback(
    (first: string, second: string) => {
      if (!save) return;
      commit(withSheet(save, swapPlayersInSheet(save.sheet, first, second)));
      setPicked(null);
    },
    [commit, save],
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

  const beginBatch = useCallback(
    (mode: "first" | "full"): LiveMatch | null => {
      if (!save) return null;
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
    [championship, save],
  );

  const goToMatch = useCallback(() => {
    if (!save || save.phase === "preseason") return;
    const next = beginBatch("first");
    if (next) setLive({ ...next, phase: "first", cursor: 0 });
  }, [beginBatch, save]);

  const finishLive = useCallback(
    (current: LiveMatch, extras?: { sheet?: TeamSheet; base?: GameSave }) => {
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
        condition: applyMatchFatigue(next.condition, sheet.starters, sheet.subs),
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
      commit(next);
      setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
    },
    [championship, commit, save],
  );

  const continueSecondHalf = useCallback(
    (tactics: Tactics, sheet: TeamSheet, skipPlayback = false) => {
      if (!save || !live) return;
      commit(withSheet(withTactics(save, tactics), sheet));
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
    [championship, commit, finishLive, live, save],
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
    if (live?.phase === "half-time") {
      skipRest(save.tactics, save.sheet);
      return;
    }
    const current = beginBatch("full");
    if (!current) return;
    finishLive({ ...current, phase: "finished", cursor: current.user.events.length });
  }, [beginBatch, finishLive, live, save, skipRest]);

  const advanceLive = useCallback(() => {
    setLive((current) => {
      if (!current || current.phase === "finished" || current.phase === "half-time") return current;
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
      commit(next);
    },
    [championship.matches, commit, save],
  );

  const batch = save && save.phase === "season" ? nextBatch(championship, save.clubId) : null;
  const nextUserMatch = batch?.userMatch ?? null;
  const playedCount = championship.matches.filter(matchPlayed).length;

  return {
    save,
    championship,
    live,
    picked,
    viewTeamId: viewTeamId ?? save?.clubId ?? null,
    setViewTeamId,
    batch,
    nextUserMatch,
    playedCount,
    takeCharge,
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
  };
}
