import type { PlayerCondition, PlayerMatchStats, RatedPlayer, TeamSheet } from "../types";
import { ATTRIBUTE_LABELS } from "../lib/attributes";
import { CHART_RATING_KEYS, CHART_RATING_SHORT, formatPair } from "../lib/matchStats";
import { matchOrderIndex, matchShirtNumber, matchSlot } from "../lib/players";
import { conditionFor, matchRatings } from "../lib/training";

type Props = {
  teamName: string;
  squad: RatedPlayer[];
  stats: PlayerMatchStats[];
  sheet?: TeamSheet;
  condition?: Record<string, PlayerCondition>;
  showAttributes?: boolean;
};

export function PlayerMatchTable({
  teamName,
  squad,
  stats,
  sheet,
  condition = {},
  showAttributes = true,
}: Props) {
  const byName = new Map(squad.map((player) => [player.name, player]));
  const rows = stats
    .filter((row) => row.started || row.minutes > 0 || byName.has(row.name))
    .map((row) => {
      const player = byName.get(row.name);
      const ratings = player ? matchRatings(player, conditionFor(row.name, condition)) : undefined;
      const number = sheet ? matchShirtNumber(sheet, row.name) : undefined;
      const slot = sheet ? matchSlot(sheet, row.name) : undefined;
      return { row, player, ratings, number, slot };
    })
    .sort((a, b) => {
      if (sheet) return matchOrderIndex(sheet, a.row.name) - matchOrderIndex(sheet, b.row.name);
      return Number(b.row.started) - Number(a.row.started);
    });

  return (
    <div className="chart-scroll">
      <table className="player-chart">
        <caption>{teamName}</caption>
        <thead>
          <tr>
            <th className="is-sticky">Player</th>
            <th>Pos</th>
            {showAttributes ? (
              <>
                <th>Ovr</th>
                {CHART_RATING_KEYS.map((key) => (
                  <th key={key} title={ATTRIBUTE_LABELS[key]}>
                    {CHART_RATING_SHORT[key]}
                  </th>
                ))}
              </>
            ) : null}
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
          {rows.map(({ row, player, ratings, number, slot }) => (
            <tr key={`${row.teamId}:${row.name}`}>
              <th className="is-sticky">{number ? `${number} ${row.name}` : row.name}</th>
              <td>{slot && slot !== "SUB" ? slot : slot === "SUB" ? "SUB" : player?.position ?? ""}</td>
              {showAttributes ? (
                <>
                  <td>{ratings?.overall ?? row.overall}</td>
                  {CHART_RATING_KEYS.map((key) => (
                    <td key={key}>{ratings?.[key] ?? "–"}</td>
                  ))}
                </>
              ) : null}
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
