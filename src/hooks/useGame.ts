import { useCallback, useMemo, useState } from "react";
import { seedChampionship } from "../data/championship";
import { simulateMatch } from "../lib/matchEngine";
import { clubTactics, defaultSheet } from "../lib/players";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { nextBatch } from "../lib/schedule";
import { formatScore, formatScoreWithTotal, matchPlayed, stageLabel } from "../lib/scoring";
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
  Match,
  NewsItem,
  SimulatedMatch,
  Tactics,
} from "../types";

export type LiveMatch = {
  user: SimulatedMatch;
  others: SimulatedMatch[];
  label: string;
  match: Match;
  cursor: number;
  finished: boolean;
};

function newsId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useGame() {
  const [save, setSave] = useState<GameSave | null>(() => loadSave());
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

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
      date: "2026-07-24",
      title: `Welcome to ${club?.name ?? "the club"}`,
      body: `You have taken charge of ${club?.name}. Pick your fifteen, set your tactics, then go to the first championship match. Other clubs will be simulated around you.`,
    };
    commit(withInbox(started, [welcome]));
    setLive(null);
    setPicked(null);
  }, [commit]);

  const resign = useCallback(() => {
    clearSave();
    setSave(null);
    setLive(null);
    setPicked(null);
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
      const starters = [...save.sheet.starters];
      const subs = [...save.sheet.subs];
      const i = starters.indexOf(first);
      const j = starters.indexOf(second);
      const a = subs.indexOf(first);
      const b = subs.indexOf(second);
      if (i >= 0 && j >= 0) {
        [starters[i], starters[j]] = [starters[j], starters[i]];
      } else if (i >= 0 && b >= 0) {
        starters[i] = second;
        subs[b] = first;
      } else if (j >= 0 && a >= 0) {
        starters[j] = first;
        subs[a] = second;
      } else if (i >= 0) {
        starters[i] = second;
      } else if (j >= 0) {
        starters[j] = first;
      }
      commit(withSheet(save, { starters, subs }));
      setPicked(null);
    },
    [commit, save],
  );

  const tapPlayer = useCallback(
    (name: string) => {
      if (!picked) {
        setPicked(name);
        return;
      }
      if (picked === name) {
        setPicked(null);
        return;
      }
      swapPlayers(picked, name);
    },
    [picked, swapPlayers],
  );

  const beginBatch = useCallback((): LiveMatch | null => {
    if (!save) return null;
    const batch = nextBatch(championship, save.clubId);
    if (!batch) return null;

    const simulated = batch.matches
      .map((match) => {
        const { homeId, awayId } = resolveMatchSides(championship, match);
        if (!homeId || !awayId) return null;
        return simulateMatch({
          matchId: match.id,
          homeId,
          awayId,
          homeSheet: homeId === save.clubId ? save.sheet : defaultSheet(homeId),
          awaySheet: awayId === save.clubId ? save.sheet : defaultSheet(awayId),
          homeTactics: homeId === save.clubId ? save.tactics : clubTactics(homeId),
          awayTactics: awayId === save.clubId ? save.tactics : clubTactics(awayId),
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
        finished: false,
      };
    }
    if (!user || !batch.userMatch) return null;
    return {
      user,
      others,
      label: batch.label,
      match: batch.userMatch,
      cursor: 0,
      finished: false,
    };
  }, [championship, save]);

  const goToMatch = useCallback(() => {
    const next = beginBatch();
    if (next) setLive(next);
  }, [beginBatch]);

    const finishLive = useCallback(
    (current: LiveMatch) => {
      if (!save) return;
      const existing = championship.matches.find((match) => match.id === current.user.matchId);
      if (existing && matchPlayed(existing)) {
        setLive({ ...current, cursor: current.user.events.length, finished: true });
        return;
      }
      const updates = [current.user, ...current.others].map((item) => ({
        id: item.matchId,
        homeScore: item.homeScore,
        awayScore: item.awayScore,
      }));
      let next = writeScores(save, updates);
      const club = teamById(championship, save.clubId);
      const userMatch = championship.matches.find((match) => match.id === current.user.matchId);
      const sides = userMatch ? resolveMatchSides(championship, userMatch) : { homeId: null, awayId: null };
      const home = sides.homeId ? teamById(championship, sides.homeId) : undefined;
      const away = sides.awayId ? teamById(championship, sides.awayId) : undefined;
      const items: NewsItem[] = [
        {
          id: newsId(),
          date: userMatch?.date ?? "",
          title: `${home?.name ?? "Home"} ${formatScore(current.user.homeScore)} ${away?.name ?? "Away"} ${formatScore(current.user.awayScore)}`,
          body: `${club?.name} ${current.label.toLowerCase()} finishes ${formatScoreWithTotal(current.user.homeScore)} to ${formatScoreWithTotal(current.user.awayScore)}.`,
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
      setLive({ ...current, cursor: current.user.events.length, finished: true });
    },
    [championship, commit, save],
  );

  const skipMatch = useCallback(() => {
    const current = live ?? beginBatch();
    if (!current) return;
    finishLive(current);
  }, [beginBatch, finishLive, live]);

  const advanceLive = useCallback(() => {
    setLive((current) => {
      if (!current || current.finished) return current;
      const nextCursor = Math.min(current.cursor + 1, current.user.events.length);
      const next = { ...current, cursor: nextCursor };
      if (nextCursor >= current.user.events.length) {
        queueMicrotask(() => finishLive(next));
      }
      return next;
    });
  }, [finishLive]);

  const closeLive = useCallback(() => setLive(null), []);

  const batch = save ? nextBatch(championship, save.clubId) : null;
  const nextUserMatch = batch?.userMatch ?? null;
  const playedCount = championship.matches.filter(matchPlayed).length;

  return {
    save,
    championship,
    live,
    picked,
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
  };
}
