import { useCallback, useMemo, useState } from "react";
import type { GameSave, PlayerPlan, TrainingIntensity, WeekSession, WeekShape } from "../types";
import { Toast } from "../components/Toast";
import { TrainingMixEditor } from "../components/TrainingMixEditor";
import { ATTRIBUTE_LABELS } from "../lib/attributes";
import { isInjured } from "../lib/injuries";
import { ratedSquad } from "../lib/players";
import {
  IN_SEASON_SESSION_OPTIONS,
  INTENSITY_OPTIONS,
  PRESEASON_WEEKS,
  SQUAD_TEMPLATES,
  WEEK_SHAPE_OPTIONS,
  applyIntensityToPlayers,
  applyTemplateToPlayers,
  conditionFor,
  defaultMixFor,
  fitnessOf,
  intensityTitle,
  mixAbbrev,
  mixSummary,
  planFor,
  planIntensity,
  sessionForSlot,
  sessionsPerWeek,
  trainedStat,
  trainingDelta,
  type SquadTemplateId,
} from "../lib/training";

type Props = {
  save: GameSave;
  onBack: () => void;
  onTrain: (session: WeekSession) => void;
  onSetPlans: (plans: GameSave["plans"]) => void;
  onSetIntensity: (intensity: TrainingIntensity) => void;
  onSetWeekShape: (shape: WeekShape) => void;
};

const TABLE_KEYS = ["shooting", "passing", "hooking", "speed", "teamwork"] as const;

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return "0";
}

function deltaClass(value: number): string {
  if (value > 0) return "is-up";
  if (value < 0) return "is-down";
  return "";
}

export function TrainingScreen({ save, onBack, onTrain, onSetPlans, onSetIntensity, onSetWeekShape }: Props) {
  const squad = ratedSquad(save.clubId, save.seed);
  const [selected, setSelected] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<SquadTemplateId>("position");
  const [session, setSession] = useState<WeekSession>("mixed");
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
  const nextKind = sessionForSlot(save.phase, weekShape, sessionsDone, session === "recovery" ? "mixed" : session);
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
    : session === "challenge"
      ? "Play challenge match"
      : "Run midweek session";

  return (
    <div className="screen">
      <button type="button" className="text-btn text-btn--back" onClick={onBack}>
        Back to squad
      </button>
      <p className="kicker">
        {preseason
          ? `Preseason · week ${Math.min(save.preseasonWeek, PRESEASON_WEEKS)} of ${PRESEASON_WEEKS}`
          : "Midweek training"}
      </p>
      <h2>Training</h2>
      <p className="hint hint--tight">
        Set schedules and intensity for the panel or for individuals. Light is the recovery week: legs come back and
        attributes only tick a little.
      </p>

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

      {preseason ? (
        <section className="card card--compact">
          <p className="kicker">This week&apos;s shape</p>
          <div className="choice-stack">
            {WEEK_SHAPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={weekShape === option.value ? "is-active" : ""}
                onClick={() => {
                  onSetWeekShape(option.value);
                  showToast(`Week shape set to ${option.title}.`);
                }}
              >
                <strong>{option.title}</strong>
                <span>{option.copy}</span>
              </button>
            ))}
          </div>
          <p className="hint hint--tight">
            Next up: {nextKind === "challenge" ? "challenge match" : "mixed session"} · {sessionsDone} of {total} done
            this week.
          </p>
        </section>
      ) : (
        <section className="card card--compact">
          <p className="kicker">This week&apos;s session</p>
          <div className="choice-stack">
            {IN_SEASON_SESSION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={session === option.value ? "is-active" : ""}
                onClick={() => setSession(option.value)}
              >
                <strong>{option.title}</strong>
                <span>{option.copy}</span>
              </button>
            ))}
          </div>
        </section>
      )}

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

      <section className="card card--compact">
        <p className="kicker">Panel</p>
        <div className="training-table-wrap">
          <table className="training-table">
            <thead>
              <tr>
                <th />
                <th>Player</th>
                <th>Schedule</th>
                <th>Intensity</th>
                <th>Fit</th>
                {TABLE_KEYS.map((key) => (
                  <th key={key}>{ATTRIBUTE_LABELS[key]}</th>
                ))}
                <th>Last lifts</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((player) => {
                const plan = planFor(player.name, save.plans, player.position);
                const condition = conditionFor(player.name, save.condition);
                const checked = names.has(player.name);
                const last = save.trainingDeltas?.[player.name] ?? {};
                const lastBits = Object.entries(last)
                  .filter(([, value]) => Math.round(value ?? 0) !== 0)
                  .map(([key, value]) => `${ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS]} ${formatDelta(Math.round(value ?? 0))}`);
                const playerIntensity = planIntensity(plan, intensity);
                return (
                  <tr key={player.name} className={checked ? "is-selected" : ""}>
                    <td>
                      <input type="checkbox" checked={checked} onChange={() => toggle(player.name)} aria-label={`Select ${player.name}`} />
                    </td>
                    <td>
                      <strong>{player.name}</strong>
                      <em>
                        {player.position}
                        {isInjured(condition) ? " · Out" : ""}
                      </em>
                    </td>
                    <td>{mixAbbrev(plan.mix)}</td>
                    <td>{plan.intensity || plan.recovery ? intensityTitle(playerIntensity) : `Squad · ${intensityTitle(intensity)}`}</td>
                    <td>{fitnessOf(condition)}</td>
                    {TABLE_KEYS.map((key) => {
                      const value = trainedStat(player.ratings[key], condition, key);
                      const delta = trainingDelta(condition, key);
                      return (
                        <td key={key}>
                          {value}
                          {delta !== 0 ? <small className={deltaClass(delta)}>{formatDelta(delta)}</small> : null}
                        </td>
                      );
                    })}
                    <td>{lastBits.length > 0 ? lastBits.join(" · ") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {selected.length === 1 ? (
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
          <button type="button" className="btn" onClick={() => onTrain(preseason ? nextKind : session)}>
            {runLabel}
          </button>
        </div>
      ) : (
        <p className="hint hint--tight">
          {preseason
            ? "This week's sessions are in. Waiting on the calendar to turn."
            : "Midweek work is in. Championship day is next."}
        </p>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
