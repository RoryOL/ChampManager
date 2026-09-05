import type { Championship, GameSave } from "../types";
import { compactName, sideLabel } from "../lib/display";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatDate, formatScore, matchPlayed, stageLabel } from "../lib/scoring";

type Props = {
  championship: Championship;
  save: GameSave;
};

export function FixturesScreen({ championship, save }: Props) {
  return (
    <div className="screen">
      <ul className="fixture-list">
        {championship.matches.map((match) => {
          const { homeId, awayId } = resolveMatchSides(championship, match);
          const yours = homeId === save.clubId || awayId === save.clubId;
          const home = homeId ? teamById(championship, homeId) : undefined;
          const away = awayId ? teamById(championship, awayId) : undefined;
          return (
            <li key={match.id} className={yours ? "is-you" : ""}>
              <p>
                {stageLabel(match.stage, match.round)} · {formatDate(match.date)}
              </p>
              <strong>
                {home ? compactName(home) : sideLabel(championship, match.home)}
                {matchPlayed(match) && match.homeScore && match.awayScore
                  ? ` ${formatScore(match.homeScore)} ${formatScore(match.awayScore)} `
                  : " v "}
                {away ? compactName(away) : sideLabel(championship, match.away)}
              </strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
