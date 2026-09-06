import { useState } from "react";
import type { Championship, GameSave, Match, TrainingFocus } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { compactName, sideLabel } from "../lib/display";
import { resolveMatchSides, teamById, teamGroup } from "../lib/resolve";
import { formatDate, stageLabel } from "../lib/scoring";
import { averageFitness, averageMatchOverall, averageSharpness, PRESEASON_WEEKS, TRAINING_OPTIONS } from "../lib/training";
import { ratedSquad } from "../lib/players";
import { rollClimate, climateSummary } from "../lib/weather";

type Props = {
  championship: Championship;
  save: GameSave;
  nextMatch: Match | null;
  batchLabel: string | null;
  onGoToMatch: () => void;
  onSkip: () => void;
  onResign: () => void;
  onTrain: (focus: TrainingFocus) => void;
};

export function HomeScreen({
  championship,
  save,
  nextMatch,
  batchLabel,
  onGoToMatch,
  onSkip,
  onResign,
  onTrain,
}: Props) {
  const club = teamById(championship, save.clubId);
  const group = teamGroup(championship, save.clubId);
  const sides = nextMatch ? resolveMatchSides(championship, nextMatch) : null;
  const [focus, setFocus] = useState<TrainingFocus>("skills");
  const squad = ratedSquad(save.clubId);
  const names = squad.map((player) => player.name);
  const fitness = averageFitness(save.condition, names);
  const sharpness = averageSharpness(save.condition, names);
  const form = averageMatchOverall(squad, save.condition, save.sheet.starters);
  const preseason = save.phase === "preseason";
  const formDelta = Math.round((form.match - form.ability) * 10) / 10;

  return (
    <div className="screen">
      <section className="club-banner">
        <span
          className="colour-sash"
          style={
            club
              ? { background: `linear-gradient(180deg, ${club.colours.primary} 50%, ${club.colours.secondary} 50%)` }
              : undefined
          }
        />
        <ClubBadge team={club} size="lg" variant="crest" />
        <div>
          <p>{group?.name}</p>
          <h1>{club ? compactName(club) : "Club"}</h1>
          {club ? <span className="colour-label">{club.colours.label}</span> : null}
        </div>
        <button type="button" className="text-btn" onClick={onResign}>
          Resign
        </button>
      </section>

      <section className="card">
        <p className="kicker">{preseason ? `Preseason · week ${Math.min(save.preseasonWeek, PRESEASON_WEEKS)} of ${PRESEASON_WEEKS}` : "Condition"}</p>
        <h3>
          Panel fitness {fitness} · sharpness {sharpness}
        </h3>
        <div className="attr-bar fatigue-bar">
          <i className={fitness <= 22 ? "is-warn" : ""} style={{ width: `${fitness}%` }} />
        </div>
        <p className="xv-form">
          Championship XV match rating {form.match}
          {formDelta !== 0 ? ` (${formDelta > 0 ? "+" : ""}${formDelta})` : ""} · ability {form.ability}
        </p>
        <p className="tactic-copy">
          {fitness <= 22
            ? "Match fitness is on the floor. Ratings are down — a recovery week will pay you back in championship."
            : preseason
              ? "Each session slightly changes stats on the player profile (up to +4). Open Squad after you train."
              : save.trainingDue
                ? "A midweek session is available. Pick a focus and those profile stats will move a little."
                : "The next championship day is the priority."}
        </p>
        {save.trainingDue ? (
          <>
            <div className="choice-stack">
              {TRAINING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={focus === option.value ? "is-active" : ""}
                  onClick={() => setFocus(option.value)}
                >
                  <strong>{option.title}</strong>
                  <span>{option.copy}</span>
                </button>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => onTrain(focus)}>
                {preseason ? `Train week ${save.preseasonWeek}` : "Run midweek session"}
              </button>
            </div>
          </>
        ) : null}
      </section>

      {!preseason ? (
        <section className="card next-card">
          <p className="kicker">{batchLabel ?? "Championship complete"}</p>
          {nextMatch && sides ? (
            <>
              <h2>
                {sideLabel(championship, nextMatch.home)}
                <small>v</small>
                {sideLabel(championship, nextMatch.away)}
              </h2>
              <p>
                {stageLabel(nextMatch.stage, nextMatch.round)} · {formatDate(nextMatch.date)}
                {nextMatch.venue ? ` · ${nextMatch.venue}` : ""}
              </p>
              <p className="weather-banner">{climateSummary(rollClimate(save.seed, nextMatch.id))}</p>
              <div className="row-actions">
                <button type="button" className="btn" onClick={onGoToMatch}>
                  Go to match
                </button>
                <button type="button" className="btn btn--ghost" onClick={onSkip}>
                  Instant result
                </button>
              </div>
            </>
          ) : (
            <>
              <h2>{batchLabel ? "Results to come in" : "Season over"}</h2>
              <p>
                {batchLabel
                  ? "You are not in this round. Simulate the remaining ties to keep the championship moving."
                  : "Every championship match has been played."}
              </p>
              {batchLabel && (
                <button type="button" className="btn" onClick={onSkip}>
                  Simulate {batchLabel}
                </button>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="card">
          <p className="kicker">Coming up</p>
          <h2>Round 1 after six weeks</h2>
          <p>Finish preseason training and the championship fifteen will be waiting.</p>
        </section>
      )}

      <section>
        <h3 className="list-title">Inbox</h3>
        <ul className="inbox">
          {save.inbox.length === 0 ? (
            <li className="empty">Set your team, then go to the first match.</li>
          ) : (
            save.inbox.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
