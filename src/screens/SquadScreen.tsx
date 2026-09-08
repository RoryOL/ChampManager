import type { Championship, GameSave, Match, PlayerCondition, PlayerMatchStats, RatedPlayer, Team } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { TeamFixtureList } from "../components/TeamFixtureList";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_SHORT,
  LINE_LABELS,
  MENTAL_KEYS,
  POSITION_LINES,
  type AttributeKey,
} from "../lib/attributes";
import { compactName } from "../lib/display";
import { formatPair, seasonStatsFor } from "../lib/matchStats";
import { defaultSheet, expandSheetToPanel, matchOrderIndex, matchShirtNumber, ratedSquad } from "../lib/players";
import { FORMATION_ROWS } from "../lib/squads";
import { conditionFor, fitnessOf, isOvertrained, matchRatings, toneClass, trainedRatings, trainingDelta } from "../lib/training";
import { injuryLine, isInjured } from "../lib/injuries";

type Props = {
  save: GameSave;
  championship: Championship;
  teams: Team[];
  viewTeamId: string;
  onViewTeam: (teamId: string) => void;
  picked: string | null;
  onTapPlayer: (name: string) => void;
  onOpenTraining?: () => void;
  onOpenMatch?: (match: Match) => void;
};

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
  season,
}: {
  player: RatedPlayer;
  condition?: PlayerCondition;
  showCondition: boolean;
  season: PlayerMatchStats;
}) {
  const match = showCondition && condition ? matchRatings(player, condition) : player.ratings;
  const trained = showCondition && condition ? trainedRatings(player, condition) : player.ratings;
  const overallDelta = trained.overall - player.ratings.overall;
  const trainingLifts =
    showCondition && condition
      ? ATTRIBUTE_KEYS.map((key) => {
          const delta = trainingDelta(condition, key);
          return delta !== 0 ? `${ATTRIBUTE_LABELS[key].toLowerCase()} ${formatDelta(delta)}` : null;
        }).filter((item): item is string => Boolean(item))
      : [];
  return (
    <section className="player-card" id="player-detail">
      <header>
        <div>
          <h3>{player.name}</h3>
          <p>
            {LINE_LABELS[player.position]} · {player.age} · {match.overall}
            {overallDelta !== 0 ? ` (${formatDelta(overallDelta)} banked from training)` : ""}
            {showCondition && condition ? ` · fitness ${fitnessOf(condition)}` : ""}
          </p>
        </div>
        <b className={overallDelta > 0 ? "is-up" : overallDelta < 0 ? "is-down" : ""}>{match.overall}</b>
      </header>
      {showCondition && condition ? (
        <div className="attr-group">
          <h4>Condition</h4>
          <div className="attr-row">
            <span>Match fitness</span>
            <div className="attr-bar">
              <i className={isOvertrained(condition) ? "is-warn" : ""} style={{ width: `${fitnessOf(condition)}%` }} />
            </div>
            <em>{fitnessOf(condition)}</em>
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
          {trainingLifts.length > 0 ? <p className="form-line">Profile stats: {trainingLifts.join(" · ")}</p> : null}
          {isOvertrained(condition) ? (
            <p className="warn">
              Gassed — match fitness is on the floor and will not fall further. Tackling, shooting and first touch are
              well down, he is more liable to concede frees, and a knock is more likely until you recover.
            </p>
          ) : isInjured(condition) ? (
            <p className="warn">
              Injured — {condition.injury ? injuryLine(condition.injury) : "sidelined"}. He is out of the fifteen until
              he comes back.
            </p>
          ) : (
            <p className="hint hint--tight">
              Training can lift these numbers a little (up to +2), and the work slows once a rating is already high.
              Work one area hard and neglected stats can drift a little. Small lifts stack even when the card still
              shows the same integer. Younger players take the work better and get match fitness back quicker; veterans
              feel the legs longer. Green is the change from their natural rating. Workrate, composure and ability under
              pressure do not change in training. Teamwork rises when the same lads play together.
            </p>
          )}
        </div>
      ) : null}
      {ATTRIBUTE_GROUPS.map((group) => (
        <div key={group.id} className="attr-group">
          <h4>{group.label}</h4>
          {group.keys.map((key: AttributeKey) => {
            const value = match[key];
            const delta = showCondition && condition ? trainingDelta(condition, key) : 0;
            const locked = MENTAL_KEYS.includes(key);
            return (
              <div key={key} className="attr-row">
                <span>
                  {ATTRIBUTE_LABELS[key]}
                  {locked ? <em className="attr-lock"> natural</em> : ""}
                </span>
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
        <h4>Season so far</h4>
        {season.minutes <= 0 ? (
          <p className="hint hint--tight">No championship minutes yet.</p>
        ) : (
          <ul className="season-stats">
            <li>Minutes {season.minutes} · match rating {season.rating} · overall {season.overall}</li>
            <li>Possessions {season.possessions} · passes {formatPair(season.passesCompleted, season.passesAttempted)}</li>
            <li>Shots {formatPair(season.scores, season.shots)} · high fielding {formatPair(season.highFieldingWon, season.highFieldingAttempted)}</li>
            <li>Puck-outs won {season.puckoutsWon} · tackles {formatPair(season.tacklesWon, season.tacklesAttempted)}</li>
            <li>
              Frees {formatPair(season.freesScored ?? 0, season.freesAttempted ?? 0)} · 65s{" "}
              {formatPair(season.sixtyFivesScored ?? 0, season.sixtyFivesAttempted ?? 0)} · frees conceded{" "}
              {season.freesConceded ?? 0}
            </li>
            <li>Ground {season.groundCovered} km · fitness {season.fitness}</li>
          </ul>
        )}
      </div>
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

export function SquadScreen({
  save,
  championship,
  teams,
  viewTeamId,
  onViewTeam,
  picked,
  onTapPlayer,
  onOpenTraining,
  onOpenMatch,
}: Props) {
  const ownTeam = viewTeamId === save.clubId;
  const squad = ratedSquad(viewTeamId, save);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const sheet = ownTeam
    ? expandSheetToPanel(viewTeamId, save.sheet, save.seed)
    : (save.rivals[viewTeamId]?.sheet ?? defaultSheet(viewTeamId));
  const starters = sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
  const selected = picked ? byName.get(picked) : undefined;

  const displayOverall = (player: RatedPlayer) => {
    if (!ownTeam) return { value: player.ratings.overall, delta: 0 };
    const condition = conditionFor(player.name, save.condition);
    const match = matchRatings(player, condition);
    return { value: match.overall, delta: match.overall - player.ratings.overall };
  };

  const ratingsFor = (player: RatedPlayer) => {
    if (!ownTeam) return player.ratings;
    return matchRatings(player, conditionFor(player.name, save.condition));
  };

  const ordered = [...squad].sort((a, b) => {
    const order = matchOrderIndex(sheet, a.name) - matchOrderIndex(sheet, b.name);
    return order !== 0 ? order : a.name.localeCompare(b.name);
  });

  const viewed = teams.find((team) => team.id === viewTeamId);

  return (
    <div className="screen">
      <p className="hint">
        {ownTeam
          ? "Tap a row for the full card. Swaps are on Tactics. Green and red are training lifts. Other clubs are on the Table tab."
          : "Scouting view — inspect the championship panel. You cannot change their team from here. Other clubs are on the Table tab."}
      </p>
      {viewed ? (
        <section className="club-banner club-banner--overview">
          <span
            className="colour-sash"
            style={{
              background: `linear-gradient(180deg, ${viewed.colours.primary} 50%, ${viewed.colours.secondary} 50%)`,
            }}
          />
          <ClubBadge team={viewed} size="lg" variant="crest" />
          <div>
            <p>{ownTeam ? "Your club" : "Scouting"}</p>
            <h1>{compactName(viewed)}</h1>
            <span className="colour-label">{viewed.colours.label}</span>
          </div>
          {ownTeam && onOpenTraining ? (
            <button type="button" className="btn" onClick={onOpenTraining}>
              Training
            </button>
          ) : !ownTeam ? (
            <button type="button" className="btn btn--ghost" onClick={() => onViewTeam(save.clubId)}>
              Your squad
            </button>
          ) : null}
        </section>
      ) : null}
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
      <div className="squad-table-wrap">
        <table className="squad-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="name">Player</th>
              <th>Pos</th>
              <th>Age</th>
              <th className="ovr">Ovr</th>
              {ATTRIBUTE_KEYS.map((key) => (
                <th key={key} title={ATTRIBUTE_LABELS[key]}>
                  {ATTRIBUTE_SHORT[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((player) => {
              const shown = displayOverall(player);
              const ratings = ratingsFor(player);
              const number = matchShirtNumber(sheet, player.name);
              const condition = ownTeam ? conditionFor(player.name, save.condition) : undefined;
              const injured = Boolean(condition && isInjured(condition));
              const tired = Boolean(condition && isOvertrained(condition));
              return (
                <tr
                  key={player.name}
                  className={picked === player.name ? "is-picked" : ""}
                  onClick={() => onTapPlayer(player.name)}
                >
                  <td className="num">{number ?? "—"}</td>
                  <td className="name">
                    <strong>{player.name}</strong>
                    {injured && condition?.injury ? <em>Out · {injuryLine(condition.injury)}</em> : null}
                    {tired ? <em>Tired</em> : null}
                  </td>
                  <td>{player.position}</td>
                  <td>{player.age}</td>
                  <td className={`ovr ${toneClass(shown.delta)}`}>{shown.value}</td>
                  {ATTRIBUTE_KEYS.map((key) => {
                    const delta = condition ? trainingDelta(condition, key) : 0;
                    return (
                      <td key={key} className={toneClass(delta)}>
                        {ratings[key]}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selected ? (
        <div
          className="player-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-detail"
          onClick={() => onTapPlayer(selected.name)}
        >
          <div className="player-overlay__panel" onClick={(event) => event.stopPropagation()}>
            <div className="player-overlay__bar">
              <button type="button" className="btn btn--ghost" onClick={() => onTapPlayer(selected.name)}>
                Close
              </button>
            </div>
            <PlayerDetail
              player={selected}
              condition={ownTeam ? conditionFor(selected.name, save.condition) : undefined}
              showCondition={ownTeam}
              season={seasonStatsFor(save.reports, viewTeamId, selected.name)}
            />
          </div>
        </div>
      ) : null}
      {onOpenMatch ? (
        <TeamFixtureList
          championship={championship}
          teamId={viewTeamId}
          reports={save.reports}
          onOpenMatch={onOpenMatch}
        />
      ) : null}
    </div>
  );
}
