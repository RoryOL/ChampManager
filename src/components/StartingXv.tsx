import type { Player, TeamLineup } from "../types";
import { FORMATION_ROWS } from "../lib/squads";

type Props = {
  lineup: TeamLineup;
  compact?: boolean;
};

export function StartingXv({ lineup, compact = false }: Props) {
  return (
    <div className={compact ? "xv xv--compact" : "xv"}>
      <div className="xv-pitch" role="list" aria-label="Starting fifteen">
        {FORMATION_ROWS.map((row) => (
          <div key={row.label} className="xv-row" role="listitem">
            {!compact && <span className="xv-row__label">{row.label}</span>}
            <div className="xv-row__players">
              {lineup.starters.slice(row.start, row.end).map((player) => (
                <PlayerChip key={`${player.number}-${player.name}`} player={player} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerChip({ player }: { player: Player }) {
  return (
    <span className="player-chip">
      <em>{player.number}</em>
      {player.name}
    </span>
  );
}
