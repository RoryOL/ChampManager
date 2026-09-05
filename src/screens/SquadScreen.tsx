import { useEffect, useRef } from "react";
import type { GameSave, PlayerCondition, RatedPlayer, Team } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, LINE_LABELS, POSITION_LINES } from "../lib/attributes";
import { compactName } from "../lib/display";
import { defaultSheet, designatedRoles, ratedSquad, sheetPlayers } from "../lib/players";
import { FORMATION_ROWS } from "../lib/squads";
import { conditionFor, isOvertrained } from "../lib/training";

type Props = {
  save: GameSave;
  teams: Team[];
  viewTeamId: string;
  onViewTeam: (teamId: string) => void;
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

function PlayerDetail({
  player,
  condition,
  showCondition,
}: {
  player: RatedPlayer;
  condition?: PlayerCondition;
  showCondition: boolean;
}) {
  return (
    <section className="player-card" id="player-detail">
      <header>
        <div>
          <h3>{player.name}</h3>
          <p>
            {LINE_LABELS[player.position]} · overall {player.ratings.overall}
            {showCondition && condition ? ` · fatigue ${condition.fatigue}` : ""}
          </p>
        </div>
        <b>{player.ratings.overall}</b>
      </header>
      {showCondition && condition ? (
        <div className="attr-group">
          <h4>Condition</h4>
          <div className="attr-row">
            <span>Fatigue</span>
            <div className="attr-bar">
              <i className={isOvertrained(condition) ? "is-warn" : ""} style={{ width: `${condition.fatigue}%` }} />
            </div>
            <em>{condition.fatigue}</em>
          </div>
          <div className="attr-row">
            <span>Sharpness</span>
            <div className="attr-bar">
              <i style={{ width: `${condition.sharpness}%` }} />
            </div>
            <em>{condition.sharpness}</em>
          </div>
          {isOvertrained(condition) ? <p className="warn">Overtrained — back off or championship form will dip.</p> : null}
        </div>
      ) : null}
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

export function SquadScreen({ save, teams, viewTeamId, onViewTeam, picked, onTapPlayer }: Props) {
  const ownTeam = viewTeamId === save.clubId;
  const squad = ratedSquad(viewTeamId);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const sheet = ownTeam ? save.sheet : defaultSheet(viewTeamId);
  const starters = sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
  const rest = squad.filter((player) => !sheet.starters.includes(player.name));
  const xv = sheetPlayers(viewTeamId, sheet);
  const roles = designatedRoles(xv);
  const selected = picked ? byName.get(picked) : undefined;
  const detailRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!picked) return;
    detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [picked]);

  return (
    <div className="screen">
      <p className="hint">
        {ownTeam
          ? "Tap a name to inspect attributes. Tap a second name to swap."
          : "Scouting view — inspect any championship panel. Swap is only for your own club."}
      </p>
      <div className="club-strip">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={viewTeamId === team.id ? "is-active" : ""}
            onClick={() => onViewTeam(team.id)}
          >
            <ClubBadge team={team} size="sm" />
            {compactName(team)}
          </button>
        ))}
      </div>
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
      <h3 className="list-title">{ownTeam ? "Your squad" : "Squad"}</h3>
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
                    {player.position} · {sheet.starters.includes(player.name) ? "XV" : "Bench"}
                    {roleTags(player, roles, sheet.starters.includes(player.name)).map((tag) => ` · ${tag}`)}
                    {ownTeam && isOvertrained(conditionFor(player.name, save.condition)) ? " · Tired" : ""}
                  </em>
                </span>
                <i>{player.ratings.overall}</i>
              </button>
              {selected?.name === player.name ? (
                <PlayerDetail
                  player={selected}
                  condition={ownTeam ? conditionFor(selected.name, save.condition) : undefined}
                  showCondition={ownTeam}
                />
              ) : null}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
