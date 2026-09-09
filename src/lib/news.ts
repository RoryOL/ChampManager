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
    `The committee room still smelled of last winter. The chairman got to the point before the tea arrived.`,
    `You had barely hung the coat when the chairman laid out the year — no speeches, no tour of the pitch.`,
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
  const random = createRng(seedFrom(`${options.seed}:match:${options.sim.matchId}`));
  const ourScore = options.sim.homeId === options.clubId ? options.homeScore : options.awayScore;
  const theirScore = options.sim.homeId === options.clubId ? options.awayScore : options.homeScore;
  const margin = scoreTotal(ourScore) - scoreTotal(theirScore);
  const resultWord = margin > 0 ? "won" : margin < 0 ? "went down" : "drew";
  const colour = pickOne(random, [
    "The throw-in was only the start of it; the breaking ball told the rest.",
    "It was a championship hour of puck-outs, dirty ball and scores from play.",
    "Whoever won the first hook generally won the next score.",
    "The sliotar spent a long time in the air, and the team that fielded it looked the part.",
  ]);
  const coach = options.sim.coachReport[0] ? ` ${options.sim.coachReport[0]}` : "";
  return newsItem({
    id: makeNewsId(options.seed, `match:${options.sim.matchId}`),
    kind: "match",
    date: options.date,
    matchId: options.sim.matchId,
    tone: margin > 0 ? "positive" : margin < 0 ? "negative" : "neutral",
    title: `${options.homeName} ${formatScore(options.homeScore)} ${options.awayName} ${formatScore(options.awayScore)}`,
    body: `${options.clubName} ${resultWord} in ${options.stageLabel.toLowerCase()}, ${formatScoreWithTotal(options.homeScore)} to ${formatScoreWithTotal(options.awayScore)}. ${colour} ${starsBlurb(options.sim.players, options.clubId)}${coach}`,
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
  const them = compactName(options.opponent);
  if (band === "very-good") {
    return newsItem({
      id: makeNewsId(options.seed, `chairman:${options.matchId}`),
      kind: "chairman",
      date: options.date,
      matchId: options.matchId,
      tone: "positive",
      title: pickOne(random, [
        "Chairman in raptures",
        "Champagne in the committee room",
        "Chairman: we've arrived",
        "A toast from the chairman",
        "Chairman on cloud nine",
        "He nearly kissed the Canon",
        "Chairman: that was poetry",
        "Chairman cannot contain himself",
      ]),
      body: pickOne(random, [
        `The chairman was hugging selectors in the stand. He called it the finest hour this club has seen in a generation and said the Canon is "coming home if we hurl like that." Do not tell him it is only July.`,
        `Message from the chairman, all caps: that showing against ${them} was "championship hurling from the gods." He has already asked the treasurer about a bus for September. ${target.charAt(0).toUpperCase()}${target.slice(1)} is, in his head, a formality.`,
        `He rang twice. First to say you are a genius. Second to say the parish will never forget it. "That is why I hired you. Pour something. Then do it again."`,
        `The chairman was in tears in the clubhouse. He called the fifteen "immortals" and told a journalist we are the team to beat in Clare. Ambition was ${target}. After that display, he is talking about monuments.`,
        `He stood on a chair. "I have waited years for a night like this." He wants the open-top booked and the Canon polished. Against ${them}, he said, we looked like a county side in club jerseys.`,
        `Text at full-time: "I could kiss every one of them." Then a voicemail about banners, a function, and how ${target} is "the least of it now." He has lost the run of himself — keep him off the radio.`,
        `The chairman called it the best hurling he has seen in a Clare club championship. He named no player because "the whole fifteen were poetry." He expects ${target} as a starting point, not a dream.`,
        `He was still in the dressing room at eleven, buying drink, telling anyone who would listen that ${them} "were taught a lesson" and that you have "transformed this place overnight."`,
      ]),
    });
  }
  return newsItem({
    id: makeNewsId(options.seed, `chairman:${options.matchId}`),
    kind: "chairman",
    date: options.date,
    matchId: options.matchId,
    tone: "negative",
    title: pickOne(random, [
      "Chairman seething",
      "Chairman: a disgrace",
      "He wants answers",
      "Chairman tears strips",
      "Chairman: I hired the wrong man",
      "Soft as the parish said",
      "Chairman left early",
      "An embarrassment, says the chairman",
    ]),
    body: pickOne(random, [
      `The chairman wants you in the committee room. He called the showing against ${them} "an embarrassment to the jersey" and said ${target} talk is "a joke until you can win dirty ball." He expects a response, not a speech.`,
      `Text from the chairman after full-time: "I did not hire you for that." He told a selector the fifteen were "soft as butter" and that the parish is already laughing. ${target.charAt(0).toUpperCase()}${target.slice(1)} will not arrive by accident.`,
      `He left before the speeches. In the car park he said he could have picked a better fifteen from the stand. "Do not waste my winter. Fix it or I will."`,
      `A voicemail, clipped: "That was a disgrace. ${them} wanted it more, hooked more, and looked like they had a manager." He has asked for a meeting. Bring answers, not excuses.`,
      `The chairman did not congratulate anyone. He called the display "schoolboy stuff" and said if this is the plan, ${target} is "delusional." He expects the next session to hurt.`,
      `He told the secretary you would be hearing from him. "I did not put my name to a project so we could be humiliated by ${them}." The parish hall will be full of that line by morning.`,
      `Message: "Soft. Lost. And you stood there." He wants to know why the middle third was a walk-through and why anyone still mentions ${target} with a straight face.`,
      `The chairman sat with his coat on for the last ten minutes. He called it "the worst hour in years" and said the clubhouse bar was quieter than a funeral. He expects you to look the dressing room in the eye.`,
    ]),
  });
}

function pressStandouts(
  players: PlayerMatchStats[] | undefined,
  clubId: string,
): { star?: PlayerMatchStats; second?: PlayerMatchStats } {
  const ours = (players ?? [])
    .filter((row) => row.teamId === clubId && row.minutes > 0)
    .sort((a, b) => b.rating - a.rating || b.scores - a.scores);
  return { star: ours[0], second: ours[1] };
}

function postedScore(player: PlayerMatchStats): string {
  if (player.scores <= 0) return "";
  return ` He chipped in ${player.scores} scores.`;
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
  players?: PlayerMatchStats[];
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
  const us = compactName(options.club);
  const them = compactName(options.opponent);
  const scoreline = `${formatScoreWithTotal(options.ourScore)} to ${formatScoreWithTotal(options.theirScore)}`;
  const margin = scoreTotal(options.ourScore) - scoreTotal(options.theirScore);
  const gap = clubRank(options.opponent.id) - clubRank(options.club.id);
  const underwhelmingWin = options.result === "win" && (margin < 5 || gap < -2);
  const spicyLoss = options.result === "loss";
  const tone = spicyLoss || underwhelmingWin ? "negative" : options.result === "win" ? "positive" : "neutral";
  const { star, second } = pressStandouts(options.players, options.club.id);

  let title: string;
  let lede: string;
  if (spicyLoss) {
    title = pickOne(random, [
      `${us} looking lost`,
      `Questions for the ${us} manager`,
      `Is the dressing room buying it?`,
      `${us} second to every ball`,
      `A long night for ${us}`,
    ]);
    lede = pickOne(random, [
      `${paper} does not hold back after ${them} put ${us} away, ${scoreline}. The piece says the throw-in barely mattered: ${them} won the dirty ball, the puck-outs, and the hour. Talk of ${target} is called "delusional" until the fifteen can win a break. A caller asked if the manager is already out of his depth.`,
      `In ${paper}: "${us} were second to every break. If the chairman wanted ${target}, he may want to look at the sideline first." The match report walks through a limp middle third and a scoring zone that never heated up. It will not go down well in the dressing room.`,
      `${paper} ran a long opinion claiming the manager has the panel "confused" and that ${them} "wanted it more from the first puck." The scoreboard, ${scoreline}, is treated as evidence, not a bad day. The parish will be quoting it all week.`,
    ]);
  } else if (underwhelmingWin) {
    title = pickOne(random, [
      `Win, but no one is fooled`,
      `${us} still searching`,
      `That will not win a championship`,
      `Four points and a warning`,
    ]);
    lede = pickOne(random, [
      `${paper} was unimpressed even in victory. ${us} beat ${them} ${scoreline}, but the column ran that "this is not ${target} form." The throw-in was messy, the shooting wasteful, and the second half a grind. "If this is the plan, Clare will not be talking about them in September."`,
      `${paper} called it a "soft four points" after ${us} scraped past ${them}, ${scoreline}. The writer asked whether the manager is overthinking the shape while basic hurling — first hook, first puck-out — stays sloppy. The dressing room hates that kind of coverage.`,
      `${paper} went after the display, not the result. ${us} won, ${scoreline}, and were still described as poor. "Ambition is cheap. Championship hurling is winning dirty ball for sixty minutes, not surviving a night you should have owned."`,
    ]);
  } else if (options.result === "win") {
    title = pickOne(random, [
      `${us} turning heads`,
      `Suddenly they look like a team`,
      `Don't get carried away — yet`,
      `${us} hurl with a bit of spite`,
    ]);
    lede = pickOne(random, [
      `${paper} admits ${us} looked the part against ${them}, ${scoreline}. The report dwells on the throw-in, the first puck-out won, and a fifteen that hooked with a bit of spite. Then the sting: "One swallow. The Canon is not won in July."`,
      `Local coverage was warmer after ${us} saw off ${them} ${scoreline}. ${paper} still warned the parish not to book the open-top bus. ${target.charAt(0).toUpperCase()}${target.slice(1)} remains a long road, but the piece concedes they are harder to play against than a month ago.`,
      `${paper} praised a proper championship win, ${scoreline} over ${them}, then asked if they can do it when the weather turns and the frees dry up. The hurling, for one evening, looked like a side that belongs in August.`,
    ]);
  } else {
    title = pickOne(random, [
      `Points dropped, tongues wagging`,
      `A draw that satisfies nobody`,
      `${us} leave it behind them`,
    ]);
    lede = pickOne(random, [
      `${paper} called the ${them} draw "two points and a headache," ${scoreline}. For a club chasing ${target}, it reads like a lost opportunity: puck-outs shared, wides stacked, and a throw-in that never quite became a statement.`,
      `The local take: ${us} were lucky not to lose to ${them}, ${scoreline}, and lucky will not deliver ${target}. The report spends more ink on missed pockets than on the point on the board.`,
    ]);
  }

  let playerBit: string;
  if (star) {
    const extra = second && second.rating >= 7 ? ` ${second.name} was not far off it.` : "";
    playerBit = pickOne(random, [
      `${star.name} was the one man the parish will remember (${star.rating.toFixed(1)}).${postedScore(star)}${extra} The rest of the fifteen will know they were measured against that hour.`,
      `The match report lingers on ${star.name}, who hurled like the game belonged to him (${star.rating.toFixed(1)}).${postedScore(star)}${extra} It is the sort of club showing that travels beyond the parish.`,
      `${star.name} caught the eye from the throw-in (${star.rating.toFixed(1)}).${postedScore(star)}${extra} ${paper} names him as the difference between a championship hour and a forgettable one.`,
    ]);
  } else {
    playerBit = pickOne(random, [
      `No individual is named as a saviour. The piece treats it as a fifteen's night, for better or worse.`,
      `The writer stays off naming a hero and instead asks whether the dressing room is pulling in the one direction.`,
    ]);
  }

  const clareBit = star
    ? pickOne(random, [
        `The column's closer is pointed: ${star.name} should be brought into the Clare team. Club championships keep throwing up county hurlers, and the Banner panel cannot keep pretending otherwise.`,
        `${paper} argues the Clare senior panel should have ${star.name} in from the cold. "Bring club men into the county set-up while they are flying," one line ran, "not after another winter of the same names."`,
        `There is a county call-up pitch in the last paragraph. If Clare are serious about September, a club showing like ${star.name}'s cannot be ignored — the Banner have been slow to trust men who do it every weekend in the club.`,
        `A selector is quoted off the record: club players of ${star.name}'s stamp belong in the Clare conversation now. The parish has heard that before; the paper says it is time the county acted on it.`,
      ])
    : pickOne(random, [
        `${paper} still found room to argue that Clare should be mining clubs like ${us} for the senior panel, not waiting on the same county names every spring.`,
        `The closer asks why the Banner set-up still looks past club championships when nights like this keep producing men who should be brought into the Clare team.`,
      ]);

  const sting = pickOne(random, [
    `Ambition around ${target} will follow them to the next throw-in, whether they like the coverage or not.`,
    `The dressing room can ignore the byline. They will not ignore how it reads in the clubhouse.`,
    `By Monday the parish will have picked a favourite sentence and worn it out.`,
  ]);

  let body = `${lede} ${playerBit} ${clareBit} ${sting}`;
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
