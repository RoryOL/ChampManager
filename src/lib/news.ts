import { seedChampionship } from "../data/championship";
import type {
  AmbitionTarget,
  Championship,
  GameSave,
  Match,
  NewsItem,
  NewsKind,
  PlayerMatchStats,
  Score,
  SimulatedMatch,
  Team,
} from "../types";
import { compactName } from "./display";
import { type RolledInjury } from "./injuries";
import { defaultSheet, ratedSquad } from "./players";
import { pickOne, createRng, seedFrom } from "./rng";
import { formatScore, formatScoreWithTotal, scoreTotal } from "./scoring";
import { PRESEASON_WEEKS } from "./training";

export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  chairman: "Chairman",
  match: "Match report",
  press: "Local news",
  injury: "Medical",
  training: "Training",
  recovery: "Medical",
  briefing: "Coach",
};

/** 24×24 filled paths for the home-news kind mark. */
export const NEWS_KIND_ICON: Record<NewsKind, string> = {
  chairman: "M12 3.5A3.7 3.7 0 1 1 8.3 7.2 3.7 3.7 0 0 1 12 3.5zM5 20v-1.4c0-2.8 3.1-4.6 7-4.6s7 1.8 7 4.6V20zm9.2-12.6 1.6-1.6 3.8 3.8-1.6 1.6zM3.4 16.8 11 9.2l1.8 1.8-7.6 7.6H3.4z",
  match: "M4.2 5.2 6 3.4 12.4 9.8 10.6 11.6zm7.6 0L19.8 13.2 18 15l-6.4-6.4zM11 14.2a3.4 3.4 0 1 1-3.4 3.4 3.4 3.4 0 0 1 3.4-3.4z",
  press: "M4 4.5h13.2A2.3 2.3 0 0 1 19.5 6.8V19.5H6.2A2.2 2.2 0 0 1 4 17.3zm3.2 3.2h9.2v1.7H7.2zm0 3.4h9.2v1.7H7.2zm0 3.4h6.4v1.7H7.2z",
  injury: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm-1.15 5.1h2.3v3.15H16.3v2.3h-3.15V16.7h-2.3v-3.15H7.7v-2.3h3.15z",
  training: "M4.5 10.2h8.2a4.2 4.2 0 1 1 0 4.4H9.2L6.8 19H4.5v-8.8zm11.6 1.1a1.6 1.6 0 1 0 1.6 1.6 1.6 1.6 0 0 0-1.6-1.6z",
  recovery: "M12 20.6S4.6 16 4.6 10.7A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.4 3.5C19.4 16 12 20.6 12 20.6z",
  briefing: "M8.2 2.8h7.6v2.8H8.2zm-2.4 2.2h2.2v2.6h8.4V5h2.2v16.2H5.8zm3.4 6.4h7.2v1.7H9.2zm0 3.4h5.2v1.7H9.2z",
};

const AMBITION_LABEL: Record<AmbitionTarget, string> = {
  canon: "the Canon",
  final: "a county final",
  semi: "a semi-final",
  quarter: "a quarter-final",
  group: "the group",
};

export function clubPower(teamId: string): number {
  const squad = ratedSquad(teamId);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const xv = defaultSheet(teamId)
    .starters.map((name) => byName.get(name)?.ratings.overall ?? 0)
    .filter((value) => value > 0);
  if (xv.length === 0) return 0;
  return xv.reduce((sum, value) => sum + value, 0) / xv.length;
}

let rankingCache: string[] | null = null;

export function rankedClubIds(): string[] {
  rankingCache ??= [...seedChampionship.teams]
    .map((team) => team.id)
    .sort((a, b) => clubPower(b) - clubPower(a) || a.localeCompare(b));
  return rankingCache;
}

export function clubRank(teamId: string): number {
  const index = rankedClubIds().indexOf(teamId);
  return index < 0 ? 16 : index + 1;
}

export function ambitionFor(teamId: string): { target: AmbitionTarget; label: string; line: string } {
  const rank = clubRank(teamId);
  let target: AmbitionTarget =
    rank <= 3 ? "canon" : rank <= 6 ? "final" : rank <= 10 ? "semi" : rank <= 13 ? "quarter" : "group";
  if (teamId === seedChampionship.defendingChampionId && target !== "canon") {
    target = target === "final" ? "canon" : target === "semi" ? "final" : target === "quarter" ? "semi" : "quarter";
  }
  const label = AMBITION_LABEL[target];
  const line =
    target === "canon"
      ? "Nothing less than the Canon Hamilton will do. I did not bring you in to mind the shop."
      : target === "final"
        ? "A county final is the floor. People will say that is greedy. Let them talk."
        : target === "semi"
          ? "I want a semi-final out of this year. Last eight and a quiet winter is not why you are here."
          : target === "quarter"
            ? "The last eight is the least I will accept. Win the group and go to war in a quarter-final."
            : "We are winning this group. Relegation chat can stay in the parish hall.";
  return { target, label, line };
}

export function makeNewsId(seed: number, key: string): string {
  return seedFrom(`${seed}:${key}`).toString(16);
}

export function newsItem(partial: Omit<NewsItem, "id" | "read" | "kind" | "source" | "tone"> & {
  id?: string;
  kind: NewsKind;
  source?: string;
  tone?: NewsItem["tone"];
  read?: boolean;
}): NewsItem {
  return {
    id: partial.id ?? makeNewsId(1, `${partial.kind}:${partial.title}:${partial.date}`),
    kind: partial.kind,
    source: partial.source ?? NEWS_KIND_LABEL[partial.kind],
    title: partial.title,
    body: partial.body,
    date: partial.date,
    matchId: partial.matchId,
    playerName: partial.playerName,
    read: partial.read ?? false,
    tone: partial.tone ?? "neutral",
  };
}

export function chairmanWelcome(options: {
  club: Team;
  seed: number;
  date: string;
}): { item: NewsItem; ambition: AmbitionTarget } {
  const ambition = ambitionFor(options.club.id);
  const random = createRng(seedFrom(`${options.seed}:welcome`));
  const opener = pickOne(random, [
    `The chairman sat you down in the clubhouse before a ball was pucked.`,
    `First job as ${compactName(options.club)} manager is a handshake from the chairman — and a warning.`,
    `Welcome to ${options.club.name}. The chairman did not waste the first meeting on small talk.`,
  ]);
  return {
    ambition: ambition.target,
    item: newsItem({
      id: makeNewsId(options.seed, "welcome"),
      kind: "chairman",
      date: options.date,
      tone: "neutral",
      title: `Welcome to ${compactName(options.club)}`,
      body: `${opener} This club's intention for 2026 is ${ambition.label}. ${ambition.line} Six weeks of preseason, then the championship. Do not make a liar of him.`,
    }),
  };
}

function starsBlurb(players: PlayerMatchStats[], clubId: string): string {
  const ours = players
    .filter((row) => row.teamId === clubId && row.minutes > 0)
    .sort((a, b) => b.rating - a.rating);
  const standouts = ours.filter((row) => row.rating >= 7.3).slice(0, 4);
  const names = (standouts.length > 0 ? standouts : ours.slice(0, 2)).map(
    (row) => `${row.name} (${row.rating.toFixed(1)})`,
  );
  if (names.length === 0) return "Nobody in the fifteen really laid down a marker.";
  if (names.length === 1) return `${names[0]} was the standout.`;
  return `Played well: ${names.join(", ")}.`;
}

export function matchReportItem(options: {
  clubId: string;
  clubName: string;
  homeName: string;
  awayName: string;
  homeScore: Score;
  awayScore: Score;
  sim: SimulatedMatch;
  date: string;
  seed: number;
  stageLabel: string;
}): NewsItem {
  const ourScore = options.sim.homeId === options.clubId ? options.homeScore : options.awayScore;
  const theirScore = options.sim.homeId === options.clubId ? options.awayScore : options.homeScore;
  const margin = scoreTotal(ourScore) - scoreTotal(theirScore);
  const resultWord = margin > 0 ? "won" : margin < 0 ? "went down" : "drew";
  const coach = options.sim.coachReport[0] ? ` ${options.sim.coachReport[0]}` : "";
  return newsItem({
    id: makeNewsId(options.seed, `match:${options.sim.matchId}`),
    kind: "match",
    date: options.date,
    matchId: options.sim.matchId,
    tone: margin > 0 ? "positive" : margin < 0 ? "negative" : "neutral",
    title: `${options.homeName} ${formatScore(options.homeScore)} ${options.awayName} ${formatScore(options.awayScore)}`,
    body: `${options.clubName} ${resultWord} in ${options.stageLabel.toLowerCase()}, ${formatScoreWithTotal(options.homeScore)} to ${formatScoreWithTotal(options.awayScore)}. ${starsBlurb(options.sim.players, options.clubId)}${coach}`,
  });
}

export function elsewhereRoundup(options: {
  lines: string[];
  date: string;
  seed: number;
  label: string;
}): NewsItem | null {
  if (options.lines.length === 0) return null;
  return newsItem({
    id: makeNewsId(options.seed, `elsewhere:${options.label}:${options.date}`),
    kind: "match",
    source: "Championship desk",
    date: options.date,
    tone: "neutral",
    title: `Elsewhere: ${options.label}`,
    body: options.lines.join(" "),
  });
}

export function performanceBand(options: {
  clubId: string;
  opponentId: string;
  ourScore: Score;
  theirScore: Score;
}): "very-good" | "poor" | "ordinary" {
  const margin = scoreTotal(options.ourScore) - scoreTotal(options.theirScore);
  const gap = clubRank(options.opponentId) - clubRank(options.clubId);
  if (margin >= 9 || (margin > 0 && gap >= 4)) return "very-good";
  if (margin <= -9 || (margin < 0 && gap <= -4)) return "poor";
  return "ordinary";
}

export function chairmanAfterMatch(options: {
  club: Team;
  opponent: Team;
  ourScore: Score;
  theirScore: Score;
  result: "win" | "draw" | "loss";
  date: string;
  seed: number;
  matchId: string;
  ambition: AmbitionTarget;
}): NewsItem | null {
  const band = performanceBand({
    clubId: options.club.id,
    opponentId: options.opponent.id,
    ourScore: options.ourScore,
    theirScore: options.theirScore,
  });
  if (band === "ordinary") return null;
  const random = createRng(seedFrom(`${options.seed}:chairman:${options.matchId}`));
  const target = AMBITION_LABEL[options.ambition];
  if (band === "very-good") {
    return newsItem({
      id: makeNewsId(options.seed, `chairman:${options.matchId}`),
      kind: "chairman",
      date: options.date,
      matchId: options.matchId,
      tone: "positive",
      title: pickOne(random, ["Chairman delighted", "A word from the chairman", "Chairman: that's more like it"]),
      body: pickOne(random, [
        `The chairman rang after the ${compactName(options.opponent)} match. That is the standard if we are serious about ${target}. Keep it going.`,
        `Message from the chairman: that showing against ${compactName(options.opponent)} is why he appointed you. Do not let the parish get drunk on it — ${target} is still the job.`,
        `The chairman was smiling in the stand. "That is championship hurling. Now do it in August."`,
      ]),
    });
  }
  return newsItem({
    id: makeNewsId(options.seed, `chairman:${options.matchId}`),
    kind: "chairman",
    date: options.date,
    matchId: options.matchId,
    tone: "negative",
    title: pickOne(random, ["Chairman unimpressed", "A word from the chairman", "Chairman: not good enough"]),
    body: pickOne(random, [
      `The chairman wants a meeting. A showing like that against ${compactName(options.opponent)} is not how you chase ${target}. He expects a response.`,
      `Text from the chairman after full-time: "I did not hire you for that." ${target.charAt(0).toUpperCase()}${target.slice(1)} will not arrive by accident.`,
      `The chairman left before the speeches. He told a selector the fifteen were "soft" and that you would be hearing from him.`,
    ]),
  });
}

export function localPressItem(options: {
  club: Team;
  opponent: Team;
  ourScore: Score;
  theirScore: Score;
  result: "win" | "draw" | "loss";
  date: string;
  seed: number;
  matchId: string;
  ambition: AmbitionTarget;
  played: number;
}): NewsItem {
  const random = createRng(seedFrom(`${options.seed}:press:${options.matchId}`));
  const outlet = pickOne(random, [
    { source: "Clare Champion", mention: "The Clare Champion" },
    { source: "Clare Echo", mention: "The Clare Echo" },
    { source: "Clare FM", mention: "A Clare FM phone-in" },
    { source: "Parish notes", mention: "The parish notes" },
  ]);
  const paper = outlet.mention;
  const target = AMBITION_LABEL[options.ambition];
  const margin = scoreTotal(options.ourScore) - scoreTotal(options.theirScore);
  const gap = clubRank(options.opponent.id) - clubRank(options.club.id);
  const underwhelmingWin = options.result === "win" && (margin < 5 || gap < -2);
  const spicyLoss = options.result === "loss";
  const tone = spicyLoss || underwhelmingWin ? "negative" : options.result === "win" ? "positive" : "neutral";
  let title: string;
  let body: string;
  if (spicyLoss) {
    title = pickOne(random, [
      `${compactName(options.club)} looking lost`,
      `Questions for the ${compactName(options.club)} manager`,
      `Is the dressing room buying it?`,
    ]);
    body = pickOne(random, [
      `${paper} does not hold back. After ${compactName(options.opponent)} put them away, one columnist wrote that talk of ${target} is "delusional" until the fifteen can win dirty ball. A caller asked if the manager is already out of his depth.`,
      `In ${paper}: "${compactName(options.club)} were second to every break. If the chairman wanted ${target}, he may want to look at the sideline first." The piece names no player, but the dressing room will know.`,
      `${paper} ran an opinion piece claiming the manager has the panel "confused" and that ${compactName(options.opponent)} "wanted it more." It will not go down well with the lads.`,
    ]);
  } else if (underwhelmingWin) {
    title = pickOne(random, [
      `Win, but no one is fooled`,
      `${compactName(options.club)} still searching`,
      `That will not win a championship`,
    ]);
    body = pickOne(random, [
      `${paper} was unimpressed even in victory. "Beating ${compactName(options.opponent)} like that is not ${target} form," the column ran. "If this is the plan, Clare will not be talking about them in September."`,
      `${paper} called it a "soft four points" and asked whether the manager is overthinking it. The dressing room hates that kind of coverage.`,
      `${paper} went after the display, not the result. "They won. They were still poor. Ambition is cheap."`,
    ]);
  } else if (options.result === "win") {
    title = pickOne(random, [
      `${compactName(options.club)} turning heads`,
      `Suddenly they look like a team`,
      `Don't get carried away — yet`,
    ]);
    body = pickOne(random, [
      `${paper} admits ${compactName(options.club)} looked the part against ${compactName(options.opponent)}. Then the sting: "One swallow. The Canon is not won in July."`,
      `Local coverage was warmer, but ${paper} still warned the parish not to book the open-top bus. ${target.charAt(0).toUpperCase()}${target.slice(1)} remains a long road.`,
      `${paper} praised the fifteen, then asked if they can do it when the weather turns and the frees dry up.`,
    ]);
  } else {
    title = pickOne(random, [`Points dropped, tongues wagging`, `A draw that satisfies nobody`]);
    body = pickOne(random, [
      `${paper} called the ${compactName(options.opponent)} draw "two points and a headache." For a club chasing ${target}, it reads like a lost opportunity.`,
      `The local take: ${compactName(options.club)} were lucky not to lose, and lucky will not deliver ${target}.`,
    ]);
  }
  if (options.played >= 2 && options.ambition === "canon" && options.result !== "win") {
    body += " The Canon talk is already following them around.";
  }
  return newsItem({
    id: makeNewsId(options.seed, `press:${options.matchId}`),
    kind: "press",
    source: outlet.source,
    date: options.date,
    matchId: options.matchId,
    tone,
    title,
    body,
  });
}

export function injuryNews(options: {
  rolled: RolledInjury;
  date: string;
  seed: number;
  key: string;
  clubName: string;
}): NewsItem {
  const { injury, name } = options.rolled;
  const span =
    injury.durationWeeks >= 10
      ? "and it could be the season"
      : injury.durationWeeks === 1
        ? "and he should only miss a week"
        : `and he is expected to miss around ${injury.durationWeeks} weeks`;
  const where = injury.source === "match" ? "during the match" : "in training";
  return newsItem({
    id: makeNewsId(options.seed, `injury:${options.key}:${name}`),
    kind: "injury",
    date: options.date,
    playerName: name,
    matchId: injury.source === "match" ? options.key : undefined,
    tone: "negative",
    title: `${name} injured`,
    body: `${name} picked up a ${injury.ailment} ${where} for ${options.clubName}, ${span}. Low match fitness and older legs are always a risk. He is out of the fifteen until he is right.`,
  });
}

export function recoveryNews(options: { name: string; date: string; seed: number }): NewsItem {
  return newsItem({
    id: makeNewsId(options.seed, `recovery:${options.name}:${options.date}`),
    kind: "recovery",
    date: options.date,
    playerName: options.name,
    tone: "positive",
    title: `${options.name} fit again`,
    body: `${options.name} has come through the treatment room and is available again. Whether you rush him back is another matter.`,
  });
}

export function remainingWeeks(save: GameSave, championship: Championship, clubId: string): number {
  const pre = save.phase === "preseason" ? Math.max(0, PRESEASON_WEEKS - save.preseasonWeek + 1) : 0;
  const left = championship.matches.filter((match) => {
    if (match.homeScore && match.awayScore) return false;
    return involvesClub(match, clubId);
  }).length;
  return Math.max(1, pre + Math.max(left, 1));
}

function involvesClub(match: Match, clubId: string): boolean {
  const home = match.home.type === "team" ? match.home.teamId : null;
  const away = match.away.type === "team" ? match.away.teamId : null;
  return home === clubId || away === clubId;
}

export function markNewsRead(items: NewsItem[], id: string): NewsItem[] {
  return items.map((item) => (item.id === id ? { ...item, read: true } : item));
}

export function migrateNewsItem(raw: unknown): NewsItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<NewsItem> & { title?: string; body?: string; date?: string };
  if (!item.title || !item.body) return null;
  const kind: NewsKind =
    item.kind === "chairman" ||
    item.kind === "match" ||
    item.kind === "press" ||
    item.kind === "injury" ||
    item.kind === "training" ||
    item.kind === "recovery" ||
    item.kind === "briefing"
      ? item.kind
      : item.matchId
        ? "match"
        : "training";
  return {
    id: typeof item.id === "string" ? item.id : makeNewsId(1, `${item.title}:${item.date ?? ""}`),
    kind,
    source: typeof item.source === "string" ? item.source : NEWS_KIND_LABEL[kind],
    title: item.title,
    body: item.body,
    date: typeof item.date === "string" ? item.date : "",
    matchId: item.matchId,
    playerName: item.playerName,
    read: item.read === true,
    tone: item.tone === "positive" || item.tone === "negative" ? item.tone : "neutral",
  };
}
