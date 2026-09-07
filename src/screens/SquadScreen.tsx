import { useEffect, useRef } from "react";
import type { GameSave, PlayerCondition, PlayerMatchStats, PlayerPlan, RatedPlayer, Team } from "../types";
import { GRADE_LABEL } from "../data/playerProfiles";
import { ClubBadge } from "../components/ClubBadge";
import { TrainingMixEditor } from "../components/TrainingMixEditor";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, LINE_LABELS, MENTAL_KEYS, POSITION_LINES, type AttributeKey } from "../lib/attributes";
import { compactName } from "../lib/display";
import { formatPair, seasonStatsFor } from "../lib/matchStats";
import { moodLabel, moodValue } from "../lib/mood";
import { defaultSheet, designatedRoles, ratedSquad, sheetPlayers } from "../lib/players";
import { FORMATION_ROWS } from "../lib/squads";
import { boostTotal, conditionFor, fitnessOf, isOvertrained, matchRatings, matchStat, planFor } from "../lib/training";
import { injuryLine, isInjured } from "../lib/injuries";

type Props = {
  save: GameSave;
  teams: Team[];
  viewTeamId: string;
  onViewTeam: (teamId: string) => void;
  picked: string | null;
  onTapPlayer: (name: string) => void;
  onSetPlan?: (name: string, plan: PlayerPlan) => void;
  onOpenTraining?: () => void;
};

function roleTags(player: RatedPlayer, roles: ReturnType<typeof designatedRoles>, inXv: boolean): string[] {
  const tags: string[] = [];
  if (inXv && roles.longFreeTaker === player.name) tags.push("Long frees");
  if (inXv && roles.shortFreeTaker === player.name && roles.longFreeTaker !== player.name) tags.push("Short frees");
  if (inXv && roles.sidelineTaker === player.name) tags.push("Sidelines");
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
  season,
  plan,
  onSetPlan,
}: {
  player: RatedPlayer;
  condition?: PlayerCondition;
  showCondition: boolean;
  season: PlayerMatchStats;
  plan?: PlayerPlan;
  onSetPlan?: (plan: PlayerPlan) => void;
}) {
  const match = showCondition && condition ? matchRatings(player, condition) : player.ratings;
  const overallDelta = match.overall - player.ratings.overall;
  const trainingLifts =
    showCondition && condition
      ? ATTRIBUTE_KEYS.map((key) => {
          const delta = matchStat(player.ratings[key], condition, key) - player.ratings[key];
          return delta !== 0 ? `${ATTRIBUTE_LABELS[key].toLowerCase()} ${formatDelta(delta)}` : null;
        }).filter((item): item is string => Boolean(item))
      : [];
  return (
    <section className="player-card" id="player-detail">
      <header>
        <div>
          <h3>{player.name}</h3>
          <p>
            {LINE_LABELS[player.position]} · {player.age} · {GRADE_LABEL[player.grade]} · {match.overall}
            {overallDelta !== 0 ? ` (${formatDelta(overallDelta)} from training)` : ""}
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
          <div className="attr-row">
            <span>Mood</span>
            <div className="attr-bar">
              <i style={{ width: `${moodValue(condition)}%` }} />
            </div>
            <em>{moodValue(condition)}</em>
            <span className="delta" />
          </div>
          <p className="hint hint--tight">
            {moodLabel(moodValue(condition))}
            {condition.moodNote ? ` — ${condition.moodNote}` : ". Wins, losses, the bench, substitutions and playing out of position all move this, and it feeds into match ratings."}
          </p>
          {trainingLifts.length > 0 ? <p className="form-line">Profile stats: {trainingLifts.join(" · ")}</p> : null}
          {isOvertrained(condition) ? (
            <p className="warn">Overtrained — match fitness is too low, so profile stats are down until you recover.</p>
          ) : isInjured(condition) ? (
            <p className="warn">
              Injured — {condition.injury ? injuryLine(condition.injury) : "sidelined"}. He is out of the fifteen until
              he comes back.
            </p>
          ) : (
            <p className="hint hint--tight">
              Training can lift these numbers a little (up to +4). Younger players take the work better and get match
              fitness back quicker; veterans feel the legs longer. Green is the change from their natural rating.
              Workrate, composure and ability under pressure do not change in training. Teamwork rises when the same
              lads play together.
            </p>
          )}
        </div>
      ) : null}
      {showCondition && plan && onSetPlan ? (
        <div className="attr-group">
          <h4>This week</h4>
          <TrainingMixEditor plan={plan} onChange={onSetPlan} />
        </div>
      ) : null}
      {ATTRIBUTE_GROUPS.map((group) => (
        <div key={group.id} className="attr-group">
          <h4>{group.label}</h4>
          {group.keys.map((key: AttributeKey) => {
            const value = match[key];
            const delta = showCondition && condition ? matchStat(player.ratings[key], condition, key) - player.ratings[key] : 0;
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

export function SquadScreen({ save, teams, viewTeamId, onViewTeam, picked, onTapPlayer, onSetPlan, onOpenTraining }: Props) {
  const ownTeam = viewTeamId === save.clubId;
  const squad = ratedSquad(viewTeamId);
  const byName = new Map(squad.map((player) => [player.name, player]));
  const sheet = ownTeam ? save.sheet : defaultSheet(viewTeamId);
  const starters = sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
  const rest = squad.filter((player) => !sheet.starters.includes(player.name));
  const xv = sheetPlayers(viewTeamId, sheet);
  const roles = designatedRoles(xv, ownTeam ? save.tactics : undefined);
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

  const viewed = teams.find((team) => team.id === viewTeamId);

  return (
    <div className="screen">
      <p className="hint">
        {ownTeam
          ? "Pitch numbers are current profile stats. Train, then tap a name — those bars move a little. Younger players react better to training. Tap a second name to swap."
          : "Scouting view — inspect any championship panel. Grades come from Clare senior and underage history. Swap is only for your own club."}
      </p>
      <div className="club-strip">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={viewTeamId === team.id ? "is-active" : ""}
            onClick={() => onViewTeam(team.id)}
          >
            <ClubBadge team={team} size="sm" variant="crest" />
            {compactName(team)}
          </button>
        ))}
      </div>
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
                    {player.position} · {player.age} · {GRADE_LABEL[player.grade]}
                    {sheet.starters.includes(player.name) ? " · XV" : " · Bench"}
                    {roleTags(player, roles, sheet.starters.includes(player.name)).map((tag) => ` · ${tag}`)}
                    {ownTeam && isInjured(conditionFor(player.name, save.condition))
                      ? ` · Out · ${injuryLine(conditionFor(player.name, save.condition).injury!)}`
                      : ""}
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
                  season={seasonStatsFor(save.reports, viewTeamId, selected.name)}
                  plan={ownTeam ? planFor(selected.name, save.plans, selected.position) : undefined}
                  onSetPlan={ownTeam && onSetPlan ? (plan) => onSetPlan(selected.name, plan) : undefined}
                />
              ) : null}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
