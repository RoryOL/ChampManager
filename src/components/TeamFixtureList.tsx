import type { Championship, Match } from "../types";
import { ClubBadge } from "./ClubBadge";
import { compactName, sideLabel } from "../lib/display";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatDate, formatScore, matchPlayed, stageLabel } from "../lib/scoring";

type Props = {
  championship: Championship;
  teamId: string;
  reports?: Record<string, unknown>;
  onOpenMatch: (match: Match) => void;
};

export function TeamFixtureList({ championship, teamId, reports = {}, onOpenMatch }: Props) {
  const played = championship.matches.filter((match) => {
    if (!matchPlayed(match) || !match.homeScore || !match.awayScore) return false;
    const { homeId, awayId } = resolveMatchSides(championship, match);
    return homeId === teamId || awayId === teamId;
  });

  return (
    <section>
      <h3 className="list-title">Previous fixtures</h3>
      {played.length === 0 ? (
        <p className="hint hint--tight">No championship results yet for this side.</p>
      ) : (
        <ul className="fixture-list">
          {played.map((match) => {
            const { homeId, awayId } = resolveMatchSides(championship, match);
            const home = homeId ? teamById(championship, homeId) : undefined;
            const away = awayId ? teamById(championship, awayId) : undefined;
            const yours = homeId === teamId || awayId === teamId;
            return (
              <li key={match.id} className={yours ? "is-you" : ""}>
                <button type="button" onClick={() => onOpenMatch(match)}>
                  <p>
                    {stageLabel(match.stage, match.round)} · {formatDate(match.date)}
                  </p>
                  <strong className="fixture-sides">
                    <span>
                      {home ? <ClubBadge team={home} size="sm" variant="colours" /> : null}
                      {home ? compactName(home) : sideLabel(championship, match.home)}
                    </span>
                    {` ${formatScore(match.homeScore!)} ${formatScore(match.awayScore!)} `}
                    <span>
                      {away ? <ClubBadge team={away} size="sm" variant="colours" /> : null}
                      {away ? compactName(away) : sideLabel(championship, match.away)}
                    </span>
                  </strong>
                  <em>{reports[match.id] ? "Stats and tactics" : "Result"}</em>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
