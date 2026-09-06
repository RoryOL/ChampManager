import type { PlayerCondition, PlayerMatchStats, RatedPlayer } from "../types";
import { ATTRIBUTE_LABELS } from "../lib/attributes";
import { CHART_RATING_KEYS, CHART_RATING_SHORT, formatPair } from "../lib/matchStats";
import { conditionFor, matchRatings } from "../lib/training";

type Props = {
  teamName: string;
  squad: RatedPlayer[];
  stats: PlayerMatchStats[];
  condition?: Record<string, PlayerCondition>;
};

export function PlayerMatchTable({ teamName, squad, stats, condition = {} }: Props) {
  const byName = new Map(squad.map((player) => [player.name, player]));
  const rows = stats
    .filter((row) => row.started || row.minutes > 0 || byName.has(row.name))
    .map((row) => {
      const player = byName.get(row.name);
      const ratings = player ? matchRatings(player, conditionFor(row.name, condition)) : undefined;
      return { row, player, ratings };
    });

  return (
    <div className="chart-scroll">
      <table className="player-chart">
        <caption>{teamName}</caption>
        <thead>
          <tr>
            <th className="is-sticky">Player</th>
            <th>Pos</th>
            <th>Ovr</th>
            {CHART_RATING_KEYS.map((key) => (
              <th key={key} title={ATTRIBUTE_LABELS[key]}>
                {CHART_RATING_SHORT[key]}
              </th>
            ))}
            <th>Fit</th>
            <th>Rt</th>
            <th>Min</th>
            <th>Poss</th>
            <th>Pass</th>
            <th>Shot</th>
            <th>HF</th>
            <th>POw</th>
            <th>Tck</th>
            <th>Km</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, player, ratings }) => (
            <tr key={`${row.teamId}:${row.name}`}>
              <th className="is-sticky">{player ? `${player.number} ${row.name}` : row.name}</th>
              <td>{player?.position ?? ""}</td>
              <td>{ratings?.overall ?? row.overall}</td>
              {CHART_RATING_KEYS.map((key) => (
                <td key={key}>{ratings?.[key] ?? "–"}</td>
              ))}
              <td>{row.fitness}</td>
              <td>{row.rating}</td>
              <td>{row.minutes}</td>
              <td>{row.possessions}</td>
              <td>{formatPair(row.passesCompleted, row.passesAttempted)}</td>
              <td>{formatPair(row.scores, row.shots)}</td>
              <td>{formatPair(row.highFieldingWon, row.highFieldingAttempted)}</td>
              <td>{row.puckoutsWon}</td>
              <td>{formatPair(row.tacklesWon, row.tacklesAttempted)}</td>
              <td>{row.groundCovered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
