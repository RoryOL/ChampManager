import type { Championship, GameSave, Match } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { compactName, sideLabel } from "../lib/display";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatDate, formatScore, matchPlayed, stageLabel } from "../lib/scoring";

type Props = {
  championship: Championship;
  save: GameSave;
  onOpenMatch: (match: Match) => void;
};

export function FixturesScreen({ championship, save, onOpenMatch }: Props) {
  return (
    <div className="screen">
      <p className="hint">Tap any tie for tactics and match stats — not just your own championship days.</p>
      <ul className="fixture-list">
        {championship.matches.map((match) => {
          const { homeId, awayId } = resolveMatchSides(championship, match);
          const yours = homeId === save.clubId || awayId === save.clubId;
          const home = homeId ? teamById(championship, homeId) : undefined;
          const away = awayId ? teamById(championship, awayId) : undefined;
          const played = matchPlayed(match) && match.homeScore && match.awayScore;
          return (
            <li key={match.id} className={yours ? "is-you" : ""}>
              <button type="button" onClick={() => onOpenMatch(match)}>
                <p>
                  {stageLabel(match.stage, match.round)} · {formatDate(match.date)}
                  {match.venue ? ` · ${match.venue}` : ""}
                </p>
                <strong className="fixture-sides">
                  <span>
                    {home ? <ClubBadge team={home} size="sm" variant="colours" /> : null}
                    {home ? compactName(home) : sideLabel(championship, match.home)}
                  </span>
                  {played ? ` ${formatScore(match.homeScore!)} ${formatScore(match.awayScore!)} ` : " v "}
                  <span>
                    {away ? <ClubBadge team={away} size="sm" variant="colours" /> : null}
                    {away ? compactName(away) : sideLabel(championship, match.away)}
                  </span>
                </strong>
                <em>{played ? (save.reports[match.id] ? "Stats and tactics" : "Result") : "Preview tactics"}</em>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
