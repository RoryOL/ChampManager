import { useCallback, useMemo, useState } from "react";
import type { GameSave, MatchPrep, PlayerPlan, TrainingIntensity, WeekSession, WeekShape } from "../types";
import { Toast } from "../components/Toast";
import { TrainingMixEditor } from "../components/TrainingMixEditor";
import { WeekShapePicker } from "../components/WeekShapePicker";
import { ATTRIBUTE_LABELS, ATTRIBUTE_SHORT } from "../lib/attributes";
import { isInjured, isSuspended } from "../lib/injuries";
import { ratedSquad } from "../lib/players";
import {
  INTENSITY_OPTIONS,
  MATCH_PREP_OPTIONS,
  PRESEASON_WEEKS,
  SQUAD_TEMPLATES,
  TRAINABLE_KEYS,
  applyIntensityToPlayers,
  applyTemplateToPlayers,
  bankedLift,
  conditionFor,
  defaultMixFor,
  fitnessOf,
  formatBoostDelta,
  intensityTitle,
  mixAbbrev,
  mixSummary,
  matchPrepTitle,
  planFor,
  planIntensity,
  sessionForSlot,
  sessionsPerWeek,
  tableLift,
  trainedOverallLift,
  trainedRatings,
  trainedStat,
  type SquadTemplateId,
} from "../lib/training";

type Props = {
  save: GameSave;
  onBack: () => void;
  onTrain: (session: WeekSession) => void;
  onMatchPrep: (prep: MatchPrep) => void;
  onSetPlans: (plans: GameSave["plans"]) => void;
  onSetIntensity: (intensity: TrainingIntensity) => void;
  onSetWeekShape: (shape: WeekShape) => void;
};

function liftClass(value: number): string {
  if (value > 0) return "is-lift-up";
  if (value < 0) return "is-lift-down";
  return "";
}

export function TrainingScreen({ save, onBack, onTrain, onMatchPrep, onSetPlans, onSetIntensity, onSetWeekShape }: Props) {
  const squad = ratedSquad(save.clubId, save);
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<SquadTemplateId>("position");
  const [prep, setPrep] = useState<MatchPrep>(save.nextMatchPrep ?? "puckout");
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlayerPlan>(() => ({
    mix: defaultMixFor("MF"),
    recovery: false,
  }));
  const preseason = save.phase === "preseason";
  const intensity = save.intensity ?? "balanced";
  const weekShape = save.weekShape ?? "challenge";
  const sessionsDone = save.sessionsDone ?? 0;
  const total = sessionsPerWeek(save.phase);
  const nextKind = sessionForSlot(save.phase, weekShape, sessionsDone, "mixed");
  const names = useMemo(() => new Set(selected), [selected]);
  const allNames = useMemo(() => squad.map((player) => player.name), [squad]);
  const showToast = useCallback((message: string) => setToast(message), []);

  const toggle = (name: string) => {
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  };

  const applyTemplate = (targets: string[]) => {
    if (targets.length === 0) return;
    const preset = SQUAD_TEMPLATES.find((item) => item.id === templateId);
    onSetPlans(applyTemplateToPlayers(squad, save.plans, templateId, targets));
    const label = preset?.title ?? "template";
    showToast(
      targets.length === squad.length
        ? `Applied ${label} to the whole panel.`
        : `Applied ${label} to ${targets.length} selected.`,
    );
  };

  const applyDraft = (targets: string[]) => {
    if (targets.length === 0) return;
    const next = { ...save.plans };
    for (const name of targets) {
      next[name] = { mix: draft.mix, recovery: false, intensity: draft.intensity };
    }
    onSetPlans(next);
    showToast(`Assigned mix and intensity to ${targets.length} selected.`);
  };

  const setSquadIntensity = (value: TrainingIntensity) => {
    onSetIntensity(value);
    showToast(`Squad intensity set to ${intensityTitle(value)}. Players with their own setting keep it.`);
  };

  const applySquadIntensity = (targets: string[]) => {
    if (targets.length === 0) return;
    onSetPlans(applyIntensityToPlayers(squad, save.plans, targets, undefined));
    showToast(
      targets.length === squad.length
        ? `Whole panel now uses ${intensityTitle(intensity)}.`
        : `${targets.length} selected now use ${intensityTitle(intensity)}.`,
    );
  };

  const runLabel = preseason
    ? nextKind === "challenge"
      ? `Play challenge · session ${sessionsDone + 1} of ${total}`
      : `Run session ${sessionsDone + 1} of ${total}`
    : `Work ${matchPrepTitle(prep)}`;

  return (
    <div className="screen">
      <button type="button" className="text-btn text-btn--back" onClick={onBack}>
        Back to squad
      </button>
      <p className="kicker">
        {preseason
          ? `Preseason · week ${Math.min(save.preseasonWeek, PRESEASON_WEEKS)} of ${PRESEASON_WEEKS}`
          : "Championship rest"}
      </p>
      <h2>{preseason ? "Training" : "Match work"}</h2>
      <p className="hint hint--tight">
        {preseason
          ? "Set schedules and intensity for the panel or for individuals. Light is the recovery week: legs come back and attributes only tick a little. Mixed sessions — three in a week, or two plus a challenge — use these schedules."
          : "Standard schedules are for preseason. Between championship days the panel recover to nearly full fitness. Pick one aspect for a slight lift on the next day."}
      </p>

      {preseason ? (
      <section className="card card--compact">
        <p className="kicker">Squad intensity</p>
        <div className="choice-stack">
          {INTENSITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={intensity === option.value ? "is-active" : ""}
              onClick={() => setSquadIntensity(option.value)}
            >
              <strong>{option.title}</strong>
              <span>{option.copy}</span>
            </button>
          ))}
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn--ghost" onClick={() => applySquadIntensity(allNames)}>
            Apply intensity to panel
          </button>
        </div>
      </section>
      ) : null}

      {preseason ? (
        <section className="card card--compact">
          <p className="kicker">This week&apos;s shape</p>
          <WeekShapePicker
            weekShape={weekShape}
            onChange={(shape) => {
              onSetWeekShape(shape);
              showToast(shape === "triple" ? "Week set to three sessions." : "Week set to two sessions + challenge.");
            }}
          />
          <p className="hint hint--tight">
            Next up: {nextKind === "challenge" ? "challenge match" : "mixed session"} · {sessionsDone} of {total} done
            this week.
          </p>
        </section>
      ) : (
        <section className="card card--compact">
          <p className="kicker">Next match work</p>
          <div className="choice-stack">
            {MATCH_PREP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={prep === option.value ? "is-active" : ""}
                onClick={() => setPrep(option.value)}
              >
                <strong>{option.title}</strong>
                <span>{option.copy}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {preseason ? (
      <section className="card card--compact">
        <p className="kicker">Schedules</p>
        <div className="template-row">
          {SQUAD_TEMPLATES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={templateId === option.id ? "is-active" : ""}
              onClick={() => setTemplateId(option.id)}
            >
              {option.title}
            </button>
          ))}
        </div>
        <p className="hint hint--tight">{SQUAD_TEMPLATES.find((item) => item.id === templateId)?.copy}</p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={() => applyTemplate(allNames)}>
            Apply template to panel
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={selected.length === 0}
            onClick={() => applyTemplate(selected)}
          >
            Apply to selected
          </button>
        </div>
        <p className="kicker">Custom mix for selected</p>
        <TrainingMixEditor plan={draft} squadIntensity={intensity} onChange={setDraft} />
        <div className="row-actions">
          <button type="button" className="btn btn--ghost" disabled={selected.length === 0} onClick={() => applyDraft(selected)}>
            Assign mix to {selected.length || 0} selected
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={selected.length === 0}
            onClick={() => applySquadIntensity(selected)}
          >
            Use squad intensity
          </button>
          <button type="button" className="text-btn" onClick={() => setSelected(allNames)}>
            Select all
          </button>
          {selected.length > 0 ? (
            <button type="button" className="text-btn" onClick={() => setSelected([])}>
              Clear
            </button>
          ) : null}
        </div>
      </section>
      ) : null}

      <section className="card card--compact">
        <p className="kicker">Panel</p>
        <p className="hint hint--tight">
          Every stat training can move is here. Overall uses the same weights as the profile, including small banked
          lifts that have not ticked the integer yet.
        </p>
        <div className="training-table-wrap">
          <table className="training-table">
            <thead>
              <tr>
                <th className="col-check" />
                <th className="col-player">Player</th>
                <th>Schedule</th>
                <th>Intensity</th>
                <th>Fit</th>
                <th className="ovr">Ovr</th>
                {TRAINABLE_KEYS.map((key) => (
                  <th key={key} title={ATTRIBUTE_LABELS[key]}>
                    {ATTRIBUTE_SHORT[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {squad.map((player) => {
                const plan = planFor(player.name, save.plans, player.position);
                const condition = conditionFor(player.name, save.condition);
                const checked = names.has(player.name);
                const last = save.trainingDeltas?.[player.name] ?? {};
                const playerIntensity = planIntensity(plan, intensity);
                const trained = trainedRatings(player, condition);
                const overallLift = tableLift(trainedOverallLift(player, condition.boosts), trainedOverallLift(player, last));
                const overallAmount = formatBoostDelta(overallLift);
                return (
                  <tr key={player.name} className={checked ? "is-selected" : ""}>
                    <td className="col-check">
                      <input type="checkbox" checked={checked} onChange={() => toggle(player.name)} aria-label={`Select ${player.name}`} />
                    </td>
                    <td className="col-player">
                      <strong>{player.name}</strong>
                      <em>
                        {player.position}
                        {isInjured(condition) ? " · Out" : isSuspended(condition) ? " · Suspended" : ""}
                      </em>
                    </td>
                    <td>{mixAbbrev(plan.mix)}</td>
                    <td>{plan.intensity || plan.recovery ? intensityTitle(playerIntensity) : `Squad · ${intensityTitle(intensity)}`}</td>
                    <td>{fitnessOf(condition)}</td>
                    <td className={`ovr ${liftClass(overallLift)}`}>
                      {trained.overall}
                      {overallAmount ? <small>{overallAmount}</small> : null}
                    </td>
                    {TRAINABLE_KEYS.map((key) => {
                      const value = trainedStat(player.ratings[key], condition, key);
                      const lift = tableLift(bankedLift(condition, key), last[key] ?? 0);
                      const amount = formatBoostDelta(lift);
                      return (
                        <td key={key} className={liftClass(lift)}>
                          {value}
                          {amount ? <small>{amount}</small> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selected.length === 1 && preseason ? (
          <div className="training-schedules">
            <p className="kicker">{selected[0]} · {mixSummary(planFor(selected[0]!, save.plans, squad.find((item) => item.name === selected[0])?.position ?? "MF").mix)}</p>
            <TrainingMixEditor
              plan={planFor(selected[0]!, save.plans, squad.find((item) => item.name === selected[0])?.position ?? "MF")}
              squadIntensity={intensity}
              onChange={(plan) => onSetPlans({ ...save.plans, [selected[0]!]: { ...plan, recovery: false } })}
            />
          </div>
        ) : null}
      </section>

      {save.trainingDue ? (
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => (preseason ? onTrain(nextKind) : onMatchPrep(prep))}
          >
            {runLabel}
          </button>
        </div>
      ) : (
        <p className="hint hint--tight">
          {preseason
            ? "This week's sessions are in. Waiting on the calendar to turn."
            : save.nextMatchPrep
              ? `${matchPrepTitle(save.nextMatchPrep)} is in. Championship day is next.`
              : "Championship day is next."}
        </p>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
