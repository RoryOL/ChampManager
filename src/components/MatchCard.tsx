import type { Championship, Match } from "../types";
import { formatDate, formatScore, matchPlayed, scoreTotal, stageLabel } from "../lib/scoring";
import { sideLabel } from "../lib/display";
import { TeamLine } from "./TeamLine";
import { resolveMatchSides } from "../lib/resolve";
import { lineupsForMatch } from "../lib/squads";

type Props = {
  championship: Championship;
  match: Match;
  onSelect: (match: Match) => void;
};

export function MatchCard({ championship, match, onSelect }: Props) {
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const played = matchPlayed(match);
  const homeTotal = match.homeScore ? scoreTotal(match.homeScore) : null;
  const awayTotal = match.awayScore ? scoreTotal(match.awayScore) : null;
  const homeWin = played && homeTotal !== null && awayTotal !== null && homeTotal > awayTotal;
  const awayWin = played && homeTotal !== null && awayTotal !== null && awayTotal > homeTotal;
  const hasLineup = lineupsForMatch(match.id).length > 0;

  return (
    <button type="button" className="match-card" onClick={() => onSelect(match)}>
      <div className="match-card__meta">
        <span>{stageLabel(match.stage, match.round)}</span>
        <span>
          {formatDate(match.date)}
          {match.time ? ` · ${match.time}` : ""}
        </span>
      </div>
      <div className={`match-card__row ${homeWin ? "is-winner" : ""}`}>
        <TeamLine
          championship={championship}
          teamId={homeId}
          label={sideLabel(championship, match.home)}
        />
        <span className="match-card__score">
          {match.homeScore ? formatScore(match.homeScore) : "–"}
        </span>
      </div>
      <div className={`match-card__row ${awayWin ? "is-winner" : ""}`}>
        <TeamLine
          championship={championship}
          teamId={awayId}
          label={sideLabel(championship, match.away)}
        />
        <span className="match-card__score">
          {match.awayScore ? formatScore(match.awayScore) : "–"}
        </span>
      </div>
      {match.venue && <p className="match-card__venue">{match.venue}</p>}
      <span className="match-card__action">
        {played ? "Edit result" : "Enter result"}
        {hasLineup ? " · Line-out" : ""}
      </span>
    </button>
  );
}
