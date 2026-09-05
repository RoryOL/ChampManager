import type { Championship, Match } from "../types";
import { championshipProgress, formatDate, formatScore, matchPlayed } from "../lib/scoring";
import { sideLabel } from "../lib/display";
import { recentResults, teamById, upcomingMatches } from "../lib/resolve";
import { groupIsComplete, groupStandings } from "../lib/standings";
import { ClubBadge } from "../components/ClubBadge";
import { MatchCard } from "../components/MatchCard";

type Props = {
  championship: Championship;
  onSelectMatch: (match: Match) => void;
};

export function OverviewPage({ championship, onSelectMatch }: Props) {
  const progress = championshipProgress(championship.matches);
  const next = upcomingMatches(championship, 4);
  const recent = recentResults(championship, 4);
  const champion = teamById(championship, championship.defendingChampionId);
  const promoted = teamById(championship, championship.promotedId);

  const winners = championship.groups.map((group) => {
    const complete = groupIsComplete(championship.matches, group.id);
    const rows = groupStandings(
      group.teamIds,
      championship.matches.filter((match) => match.stage === "group" && match.groupId === group.id),
      complete,
    );
    return { group, leader: teamById(championship, rows[0]?.teamId) };
  });

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Canon Hamilton Cup · {championship.year}</p>
        <h1>{championship.title}</h1>
        <p className="lede">
          Sixteen Clare clubs, four groups, one county title. Group stages are in the book —
          quarter-finals at Páirc Chíosóg follow the 2026 draw.
        </p>
        <dl className="stat-row">
          <div>
            <dt>Clubs</dt>
            <dd>16</dd>
          </div>
          <div>
            <dt>Group games</dt>
            <dd>
              {progress.groupPlayed}/{progress.groupTotal}
            </dd>
          </div>
          <div>
            <dt>Knockout</dt>
            <dd>
              {progress.knockoutPlayed}/{progress.knockoutTotal}
            </dd>
          </div>
          <div>
            <dt>Champions</dt>
            <dd>{champion?.name}</dd>
          </div>
        </dl>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Group winners</h2>
          <ul className="winner-list">
            {winners.map(({ group, leader }) => (
              <li key={group.id}>
                <ClubBadge team={leader} size="md" />
                <div>
                  <strong>{leader?.name ?? "TBD"}</strong>
                  <span>{group.name} · seeded for the last eight</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <h2>Championship notes</h2>
          <ul className="note-list">
            <li>
              {champion?.name} are defending the Canon Hamilton Cup, their first senior title in 35
              years.
            </li>
            <li>
              {promoted?.name} return after winning the Premier Intermediate Championship.
            </li>
            <li>
              Top two in each group reach the quarter-finals; group winners are seeded. Bottom clubs
              enter the relegation play-offs.
            </li>
            <li>
              Tied teams are separated by results between themselves — points, score difference,
              then scores for.
            </li>
          </ul>
        </article>
      </section>

      <section>
        <div className="section-head">
          <h2>Next ties</h2>
        </div>
        {next.length === 0 ? (
          <p className="empty">Every fixture has a result.</p>
        ) : (
          <div className="card-grid">
            {next.map((match) => (
              <MatchCard
                key={match.id}
                championship={championship}
                match={match}
                onSelect={onSelectMatch}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Latest scorelines</h2>
        </div>
        <ul className="result-strip">
          {recent.map((match) => {
            if (!matchPlayed(match) || !match.homeScore || !match.awayScore) return null;
            return (
              <li key={match.id}>
                <button type="button" onClick={() => onSelectMatch(match)}>
                  <span>
                    {sideLabel(championship, match.home)} {formatScore(match.homeScore)}
                  </span>
                  <span className="muted">{formatDate(match.date)}</span>
                  <span>
                    {formatScore(match.awayScore)} {sideLabel(championship, match.away)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
