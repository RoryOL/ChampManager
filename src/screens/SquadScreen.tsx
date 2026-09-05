import type { GameSave } from "../types";
import { ratedSquad } from "../lib/players";
import { FORMATION_ROWS } from "../lib/squads";

type Props = {
  save: GameSave;
  picked: string | null;
  onTapPlayer: (name: string) => void;
};

export function SquadScreen({ save, picked, onTapPlayer }: Props) {
  const squad = ratedSquad(save.clubId);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const starters = save.sheet.starters
    .map((name) => byName.get(name))
    .filter((player) => Boolean(player));
  const rest = squad.filter((player) => !save.sheet.starters.includes(player.name));

  return (
    <div className="screen">
      <p className="hint">Tap two players to swap, like the old Champ Man team sheets.</p>
      <div className="mini-pitch">
        {FORMATION_ROWS.map((row) => (
          <div key={row.label} className="mini-row">
            {starters.slice(row.start, row.end).map((player) =>
              player ? (
                <button
                  key={player.name}
                  type="button"
                  className={picked === player.name ? "is-picked" : ""}
                  onClick={() => onTapPlayer(player.name)}
                >
                  <em>{player.ratings.overall}</em>
                  {player.name.split(" ").slice(-1)}
                </button>
              ) : null,
            )}
          </div>
        ))}
      </div>
      <h3 className="list-title">Squad</h3>
      <ul className="player-list">
        {[...starters, ...rest].map((player) =>
          player ? (
            <li key={player.name}>
              <button
                type="button"
                className={picked === player.name ? "is-picked" : ""}
                onClick={() => onTapPlayer(player.name)}
              >
                <b>{player.number}</b>
                <span>
                  <strong>{player.name}</strong>
                  <em>
                    {player.position} · {save.sheet.starters.includes(player.name) ? "XI" : "Bench"}
                  </em>
                </span>
                <i>{player.ratings.overall}</i>
              </button>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
