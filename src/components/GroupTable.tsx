import type { Championship, Group, Match } from "../types";
import { compactName } from "../lib/display";
import { groupIsComplete, groupStandings } from "../lib/standings";
import { ClubBadge } from "./ClubBadge";
import { teamById } from "../lib/resolve";

type Props = {
  championship: Championship;
  group: Group;
};

const statusLabel = {
  "quarter-final": "QF",
  relegation: "REL",
  safe: "",
  pending: "",
};

export function GroupTable({ championship, group }: Props) {
  const matches: Match[] = championship.matches.filter(
    (match) => match.stage === "group" && match.groupId === group.id,
  );
  const complete = groupIsComplete(championship.matches, group.id);
  const rows = groupStandings(group.teamIds, matches, complete);

  return (
    <section className="group-card">
      <header className="group-card__head">
        <h3>{group.name}</h3>
        <span>{complete ? "Group complete" : "In progress"}</span>
      </header>
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Club</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>F</th>
              <th>A</th>
              <th>+/−</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const team = teamById(championship, row.teamId);
              return (
                <tr key={row.teamId} className={`status-${row.status}`}>
                  <td>{row.position}</td>
                  <td>
                    <span className="club-cell">
                      <ClubBadge team={team} />
                      <span>{team ? compactName(team) : row.teamId}</span>
                      {statusLabel[row.status] && (
                        <em className="status-tag">{statusLabel[row.status]}</em>
                      )}
                    </span>
                  </td>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>{row.scored}</td>
                  <td>{row.conceded}</td>
                  <td>{row.difference > 0 ? `+${row.difference}` : row.difference}</td>
                  <td className="pts">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
