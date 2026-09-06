import { useCallback, useMemo, useState } from "react";
import { seedChampionship } from "../data/championship";
import { compactName } from "../lib/display";
import { momentumAt, simulateMatch } from "../lib/matchEngine";
import { combineHalves, reportFromSim } from "../lib/matchStats";
import { applyMatchMood, applyNewsMood } from "../lib/mood";
import { clubTactics, defaultSheet, ratedSquad, swapPlayersInSheet } from "../lib/players";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { nextBatch } from "../lib/schedule";
import { formatScore, matchPlayed, scoreTotal, stageLabel } from "../lib/scoring";
import {
  applyInjury,
  injuredNamesFromEvents,
  insertInjuryEvents,
  rollMatchInjuries,
  rollTrainingInjuries,
  sitInjuredPlayers,
  tickInjuries,
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
  injuries: RolledInjury[];
};

function decorateUserMatch(
  sim: SimulatedMatch,
  save: GameSave,
  championship: Championship,
  period: "first" | "second" | "full",
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
  return { sim: insertInjuryEvents(sim, injuries), injuries };
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
    if (!club) {
      commit(started);
      setLive(null);
      setPicked(null);
      setViewTeamId(clubId);
      return;
    }
    const welcome = chairmanWelcome({ club, seed: started.seed, date: PRESEASON_DATES[0] });
    commit(withInbox({ ...started, ambition: welcome.ambition }, [welcome.item]));
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

  const beginBatch = useCallback(
    (mode: "first" | "full"): LiveMatch | null => {
      if (!save) return null;
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
          const decorated = decorateUserMatch(sim, save, championship, mode === "first" ? "first" : "full");
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
      commit(next);
      setLive({ ...current, cursor: current.user.events.length, phase: "finished" });
    },
    [championship, commit, save],
  );

  const continueSecondHalf = useCallback(
    (tactics: Tactics, sheet: TeamSheet, skipPlayback = false) => {
      if (!save || !live) return;
      const squad = ratedSquad(save.clubId);
      const hurt = injuredNamesFromEvents(live.user.events, save.clubId);
      const workingSheet = sitInjuredPlayers(sheet, squad, save.condition, hurt);
      commit(withSheet(withTactics(save, tactics), workingSheet));
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
      const decorated = decorateUserMatch(second, save, championship, "second");
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
      const club = teamById(championship, save.clubId);
      const date =
        save.phase === "preseason"
          ? (PRESEASON_DATES[save.preseasonWeek - 1] ?? PRESEASON_DATES.at(-1) ?? "")
          : championship.matches.find((match) => !matchPlayed(match))?.date ?? "";
      const ticked = tickInjuries(save.condition, squad);
      const trained = applyTraining(squad, ticked.condition, focus);
      const weeks = remainingWeeks(save, championship, save.clubId);
      const freshInjuries = rollTrainingInjuries({
        squad,
        condition: trained.condition,
        focus,
        seed: save.seed,
        weekKey: `${save.phase}-${save.preseasonWeek}-${date}`,
        remainingWeeks: weeks,
      });
      let condition = trained.condition;
      for (const rolled of freshInjuries) {
        condition = applyInjury(condition, rolled.name, rolled.injury);
      }
      const sheet = sitInjuredPlayers(save.sheet, squad, condition);
      let next: GameSave = {
        ...save,
        condition,
        sheet,
        trainingDue: false,
      };
      const items: NewsItem[] = ticked.recovered.map((name) =>
        recoveryNews({ name, date, seed: save.seed }),
      );
      const trainingBody = trained.summary;
      if (save.phase === "preseason") {
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
              body: `${trainingBody} Preseason is over. Pick your fifteen — Round 1 is next.`,
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
              body: trainingBody,
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
            body: trainingBody,
          }),
        );
      }
      for (const rolled of freshInjuries) {
        items.push(
          injuryNews({
            rolled,
            date,
            seed: save.seed,
            key: `train-${date}-${rolled.name}`,
            clubName: club?.name ?? "the club",
          }),
        );
      }
      next = withInbox(next, items);
      commit(next);
    },
    [championship, commit, save],
  );

  const readNews = useCallback(
    (id: string) => {
      if (!save) return;
      commit({ ...save, inbox: markNewsRead(save.inbox, id) });
    },
    [commit, save],
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
    readNews,
  };
}
