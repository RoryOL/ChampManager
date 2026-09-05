import { useEffect, useRef } from "react";
import type { GameSave, RatedPlayer } from "../types";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, LINE_LABELS, POSITION_LINES } from "../lib/attributes";
import { designatedRoles, ratedSquad, sheetPlayers } from "../lib/players";
import { FORMATION_ROWS } from "../lib/squads";

type Props = {
  save: GameSave;
  picked: string | null;
  onTapPlayer: (name: string) => void;
};

function roleTags(player: RatedPlayer, roles: ReturnType<typeof designatedRoles>, inXv: boolean): string[] {
  const tags: string[] = [];
  if (inXv && roles.freeTaker === player.name) tags.push("Frees");
  if (inXv && roles.sidelineTaker === player.name && roles.freeTaker !== player.name) tags.push("Sidelines");
  if (inXv && roles.puckoutKeeper === player.name) tags.push("Puck-outs");
  return tags;
}

function PlayerDetail({ player }: { player: RatedPlayer }) {
  return (
    <section className="player-card" id="player-detail">
      <header>
        <div>
          <h3>{player.name}</h3>
          <p>
            {LINE_LABELS[player.position]} · overall {player.ratings.overall}
          </p>
        </div>
        <b>{player.ratings.overall}</b>
      </header>
      {ATTRIBUTE_GROUPS.map((group) => (
        <div key={group.id} className="attr-group">
          <h4>{group.label}</h4>
          {group.keys.map((key) => (
            <div key={key} className="attr-row">
              <span>{ATTRIBUTE_LABELS[key]}</span>
              <div className="attr-bar">
                <i style={{ width: `${(player.ratings[key] / 20) * 100}%` }} />
              </div>
              <em>{player.ratings[key]}</em>
            </div>
          ))}
        </div>
      ))}
      <div className="attr-group">
        <h4>Position familiarity</h4>
        <div className="fam-grid">
          {POSITION_LINES.map((line) => (
            <div key={line} className={line === player.position ? "is-natural" : ""}>
              <span>{line}</span>
              <strong>{player.ratings.familiarity[line]}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SquadScreen({ save, picked, onTapPlayer }: Props) {
  const squad = ratedSquad(save.clubId);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const starters = save.sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
  const rest = squad.filter((player) => !save.sheet.starters.includes(player.name));
  const xv = sheetPlayers(save.clubId, save.sheet);
  const roles = designatedRoles(xv);
  const selected = picked ? byName.get(picked) : undefined;
  const detailRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!picked) return;
    detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [picked]);

  return (
    <div className="screen">
      <p className="hint">Tap a name to inspect hurling attributes. Tap a second name to swap, Champ Man style.</p>
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
            <li key={player.name} ref={picked === player.name ? detailRef : undefined}>
              <button
                type="button"
                className={picked === player.name ? "is-picked" : ""}
                onClick={() => onTapPlayer(player.name)}
              >
                <b>{player.number}</b>
                <span>
                  <strong>{player.name}</strong>
                  <em>
                    {player.position} · {save.sheet.starters.includes(player.name) ? "XV" : "Bench"}
                    {roleTags(player, roles, save.sheet.starters.includes(player.name)).map((tag) => ` · ${tag}`)}
                  </em>
                </span>
                <i>{player.ratings.overall}</i>
              </button>
              {selected?.name === player.name ? <PlayerDetail player={selected} /> : null}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
