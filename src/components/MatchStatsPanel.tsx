import type { PlayerMatchStats, TeamMatchStats } from "../types";
import { formatPair } from "../lib/matchStats";

type Props = {
  homeName: string;
  awayName: string;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
  players: PlayerMatchStats[];
  compact?: boolean;
};

function TeamRow({
  label,
  home,
  away,
}: {
  label: string;
  home: string | number;
  away: string | number;
}) {
  return (
    <tr>
      <td>{home}</td>
      <th>{label}</th>
      <td>{away}</td>
    </tr>
  );
}

export function MatchStatsPanel({ homeName, awayName, homeStats, awayStats, players, compact = false }: Props) {
  const shown = compact ? players.filter((player) => player.started || player.minutes > 0).slice(0, 10) : players;
  return (
    <div className="match-stats">
      <table className="stat-compare">
        <thead>
          <tr>
            <th>{homeName}</th>
            <th></th>
            <th>{awayName}</th>
          </tr>
        </thead>
        <tbody>
          <TeamRow label="Possessions" home={homeStats.possessions} away={awayStats.possessions} />
          <TeamRow
            label="Passes"
            home={formatPair(homeStats.passesCompleted, homeStats.passesAttempted)}
            away={formatPair(awayStats.passesCompleted, awayStats.passesAttempted)}
          />
          <TeamRow
            label="Shots (scored)"
            home={formatPair(homeStats.scores, homeStats.shots)}
            away={formatPair(awayStats.scores, awayStats.shots)}
          />
          <TeamRow
            label="High fielding"
            home={formatPair(homeStats.highFieldingWon, homeStats.highFieldingAttempted)}
            away={formatPair(awayStats.highFieldingWon, awayStats.highFieldingAttempted)}
          />
          <TeamRow label="Puck-outs won" home={homeStats.puckoutsWon} away={awayStats.puckoutsWon} />
          <TeamRow
            label="Tackles"
            home={formatPair(homeStats.tacklesWon, homeStats.tacklesAttempted)}
            away={formatPair(awayStats.tacklesWon, awayStats.tacklesAttempted)}
          />
          <TeamRow label="Ground km" home={homeStats.groundCovered} away={awayStats.groundCovered} />
          <TeamRow label="Fatigue" home={homeStats.fatigue} away={awayStats.fatigue} />
          <TeamRow label="Overall" home={homeStats.overall} away={awayStats.overall} />
        </tbody>
      </table>
      <h4>{compact ? "On the ball" : "Players"}</h4>
      <ul className="player-stats">
        {shown.map((player) => (
          <li key={`${player.teamId}:${player.name}`}>
            <strong>{player.name}</strong>
            <span>
              {player.started ? "XV" : "Bench"} · {player.minutes}&apos; · rating {player.rating} · overall {player.overall} ·
              fatigue {player.fatigue}
            </span>
            <em>
              Poss {player.possessions} · Pass {formatPair(player.passesCompleted, player.passesAttempted)} · Shots{" "}
              {formatPair(player.scores, player.shots)} · Field {formatPair(player.highFieldingWon, player.highFieldingAttempted)}{" "}
              · Puck-outs {player.puckoutsWon} · Tackles {formatPair(player.tacklesWon, player.tacklesAttempted)} · {player.groundCovered} km
            </em>
          </li>
        ))}
      </ul>
    </div>
  );
}
