import type { CompareLine } from "../lib/tacticsGrid";
import { winnerTone } from "../lib/tacticsGrid";

type Props = {
  leftName: string;
  rightName: string;
  lines: CompareLine[];
};

export function PlayerCompare({ leftName, rightName, lines }: Props) {
  return (
    <div className="player-compare">
      <p className="kicker">Compare</p>
      <div className="player-compare__scroll">
        <table className="player-compare__table">
          <thead>
            <tr>
              <th className="is-sticky">Stat</th>
              <th>{leftName}</th>
              <th>{rightName}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <th className="is-sticky">{line.label}</th>
                <td className={winnerTone(line.winner, "left")}>{line.left}</td>
                <td className={winnerTone(line.winner, "right")}>{line.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
