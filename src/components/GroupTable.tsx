import type { Championship, Group } from "../types";
import { compactName } from "../lib/display";
import { groupIsComplete, groupStandings } from "../lib/standings";
import { ClubBadge } from "./ClubBadge";
import { teamById } from "../lib/resolve";

type Props = {
  championship: Championship;
  group: Group;
  clubId?: string;
};

const statusLabel = {
  "quarter-final": "QF",
  relegation: "REL",
  safe: "",
  pending: "",
};

export function GroupTable({ championship, group, clubId }: Props) {
  const matches = championship.matches.filter(
    (match) => match.stage === "group" && match.groupId === group.id,
  );
  const complete = groupIsComplete(championship.matches, group.id);
  const rows = groupStandings(group.teamIds, matches, complete);

  return (
    <section className="group-card">
      <header className="group-card__head">
        <h3>{group.name}</h3>
        <span>{complete ? "Complete" : "In play"}</span>
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
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const team = teamById(championship, row.teamId);
              return (
                <tr
                  key={row.teamId}
                  className={`status-${row.status} ${row.teamId === clubId ? "is-you" : ""}`}
                >
                  <td>{row.position}</td>
                  <td>
                    <span className="club-cell">
                      <ClubBadge team={team} />
                      <span>{team ? compactName(team) : row.teamId}</span>
                      {statusLabel[row.status] ? <em className="status-tag">{statusLabel[row.status]}</em> : null}
                    </span>
                  </td>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
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
