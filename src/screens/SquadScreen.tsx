import { useEffect, useRef } from "react";
import type { GameSave, PlayerCondition, RatedPlayer, Team } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, LINE_LABELS, POSITION_LINES, type AttributeKey } from "../lib/attributes";
import { compactName } from "../lib/display";
import { defaultSheet, designatedRoles, ratedSquad, sheetPlayers } from "../lib/players";
import { FORMATION_ROWS } from "../lib/squads";
import { boostTotal, conditionFor, isOvertrained, matchRatings, matchStat } from "../lib/training";

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

function deltaClass(delta: number): string {
  if (delta > 0) return "delta is-up";
  if (delta < 0) return "delta is-down";
  return "delta";
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "";
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
  const match = showCondition && condition ? matchRatings(player, condition) : player.ratings;
  const overallDelta = match.overall - player.ratings.overall;
  return (
    <section className="player-card" id="player-detail">
      <header>
        <div>
          <h3>{player.name}</h3>
          <p>
            {LINE_LABELS[player.position]} · match {match.overall}
            {overallDelta !== 0 ? ` (${formatDelta(overallDelta)})` : ""} · ability {player.ratings.overall}
            {showCondition && condition ? ` · fatigue ${condition.fatigue}` : ""}
          </p>
        </div>
        <b className={overallDelta > 0 ? "is-up" : overallDelta < 0 ? "is-down" : ""}>{match.overall}</b>
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
            <span className="delta" />
          </div>
          <div className="attr-row">
            <span>Sharpness</span>
            <div className="attr-bar">
              <i style={{ width: `${condition.sharpness}%` }} />
            </div>
            <em>{condition.sharpness}</em>
            <span className="delta" />
          </div>
          {isOvertrained(condition) ? (
            <p className="warn">Overtrained — match ratings are down until you recover.</p>
          ) : (
            <p className="hint hint--tight">
              Bars are match form. Training lifts the stats you work on; the ability number does not change.
            </p>
          )}
        </div>
      ) : null}
      {ATTRIBUTE_GROUPS.map((group) => (
        <div key={group.id} className="attr-group">
          <h4>{group.label}</h4>
          {group.keys.map((key: AttributeKey) => {
            const value = match[key];
            const delta = showCondition && condition ? matchStat(player.ratings[key], condition, key) - player.ratings[key] : 0;
            return (
              <div key={key} className="attr-row">
                <span>{ATTRIBUTE_LABELS[key]}</span>
                <div className="attr-bar">
                  <i className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""} style={{ width: `${(value / 20) * 100}%` }} />
                </div>
                <em>{value}</em>
                <span className={deltaClass(delta)}>{formatDelta(delta)}</span>
              </div>
            );
          })}
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

  const displayOverall = (player: RatedPlayer) => {
    if (!ownTeam) return { value: player.ratings.overall, delta: 0 };
    const condition = conditionFor(player.name, save.condition);
    const match = matchRatings(player, condition);
    return { value: match.overall, delta: match.overall - player.ratings.overall };
  };

  return (
    <div className="screen">
      <p className="hint">
        {ownTeam
          ? "Pitch numbers are match form. Train, then tap a name — the bars that session works will move. Tap a second name to swap."
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
                  {(() => {
                    const shown = displayOverall(player);
                    return (
                      <em className={shown.delta > 0 ? "is-up" : shown.delta < 0 ? "is-down" : ""}>
                        {shown.value}
                        {shown.delta !== 0 ? <small>{formatDelta(shown.delta)}</small> : null}
                      </em>
                    );
                  })()}
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
                    {ownTeam && boostTotal(conditionFor(player.name, save.condition)) > 0 ? " · In form" : ""}
                  </em>
                </span>
                {(() => {
                  const shown = displayOverall(player);
                  return (
                    <i className={shown.delta > 0 ? "is-up" : shown.delta < 0 ? "is-down" : ""}>
                      {shown.value}
                    </i>
                  );
                })()}
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
