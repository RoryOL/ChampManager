import type { Championship, Match, Score } from "../types";

export function scoreTotal(score: Score): number {
  return score.goals * 3 + score.points;
}

export function formatScore(score: Score): string {
  return `${score.goals}-${score.points}`;
}

export function formatScoreWithTotal(score: Score): string {
  return `${formatScore(score)} (${scoreTotal(score)})`;
}

export function matchPlayed(match: Match): boolean {
  return match.homeScore !== null && match.awayScore !== null;
}

export function winnerOf(match: Match): "home" | "away" | "draw" | null {
  if (!match.homeScore || !match.awayScore) return null;
  const home = scoreTotal(match.homeScore);
  const away = scoreTotal(match.awayScore);
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

/** Keep the month and day, move the fixture into a later championship year. */
export function calendarDate(iso: string, year: number): string {
  if (!iso) return iso;
  return iso.replace(/^\d{4}/, String(year));
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function matchStageLabel(match: Match): string {
  const base = stageLabel(match.stage, match.round);
  return match.replayOf ? `${base} replay` : base;
}

export function stageLabel(stage: Match["stage"], round?: number): string {
  switch (stage) {
    case "group":
      return round ? `Round ${round}` : "Group stage";
    case "quarter-final":
      return "Quarter-final";
    case "semi-final":
      return "Semi-final";
    case "final":
      return "County final";
    case "relegation-semi":
      return "Relegation semi-final";
    case "relegation-final":
      return "Relegation final";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function isValidScore(score: Score): boolean {
  return (
    Number.isInteger(score.goals) &&
    Number.isInteger(score.points) &&
    score.goals >= 0 &&
    score.points >= 0
  );
}

export function championshipProgress(matches: Match[]): {
  groupPlayed: number;
  groupTotal: number;
  knockoutPlayed: number;
  knockoutTotal: number;
} {
  const group = matches.filter((match) => match.stage === "group");
  const knockout = matches.filter((match) => match.stage !== "group");
  return {
    groupPlayed: group.filter(matchPlayed).length,
    groupTotal: group.length,
    knockoutPlayed: knockout.filter(matchPlayed).length,
    knockoutTotal: knockout.length,
  };
}

export function findMatch(championship: Championship, id: string): Match | undefined {
  return championship.matches.find((match) => match.id === id);
}
