import { useMemo, useState } from "react";
import type { GameSave, PlayerPlan, TrainingIntensity, WeekSession, WeekShape } from "../types";
import { TrainingMixEditor } from "../components/TrainingMixEditor";
import { ATTRIBUTE_LABELS } from "../lib/attributes";
import { isInjured } from "../lib/injuries";
import { ratedSquad } from "../lib/players";
import {
  INTENSITY_OPTIONS,
  PRESEASON_WEEKS,
  SESSION_OPTIONS,
  SQUAD_TEMPLATES,
  WEEK_SHAPE_OPTIONS,
  applyTemplateToPlayers,
  conditionFor,
  defaultMixFor,
  fitnessOf,
  mixAbbrev,
  mixSummary,
  planFor,
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
  const [draft, setDraft] = useState<PlayerPlan>(() => ({
    mix: defaultMixFor("MF"),
    recovery: false,
  }));
  const preseason = save.phase === "preseason";
  const intensity = save.intensity ?? "balanced";
  const weekShape = save.weekShape ?? "challenge";
  const sessionsDone = save.sessionsDone ?? 0;
  const total = sessionsPerWeek(save.phase);
  const nextKind = sessionForSlot(save.phase, weekShape, sessionsDone, session);
  const names = useMemo(() => new Set(selected), [selected]);

  const toggle = (name: string) => {
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  };

  const applyTemplate = (targets: string[]) => {
    if (targets.length === 0) return;
    onSetPlans(applyTemplateToPlayers(squad, save.plans, templateId, targets));
  };

  const applyDraft = (targets: string[]) => {
    if (targets.length === 0) return;
    const next = { ...save.plans };
    for (const name of targets) {
      next[name] = { mix: draft.mix, recovery: draft.recovery };
    }
    onSetPlans(next);
  };

  const runLabel = preseason
    ? nextKind === "challenge"
      ? `Play challenge · session ${sessionsDone + 1} of ${total}`
      : `Run session ${sessionsDone + 1} of ${total}`
    : session === "challenge"
      ? "Play challenge match"
      : session === "recovery"
        ? "Run recovery week"
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
        {preseason
          ? "Each preseason week has three slots: two mixed sessions and a challenge match, or three mixed sessions. Intensity is for the whole panel. Gains are small and can take a few sessions to show on the card. Work one area hard and others can drift."
          : "One session before the next championship day. Intensity still applies. Numbers move slowly, and neglected areas can rust a little."}
      </p>

      <section className="card card--compact">
        <p className="kicker">Squad intensity</p>
        <div className="choice-stack">
          {INTENSITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={intensity === option.value ? "is-active" : ""}
              onClick={() => onSetIntensity(option.value)}
            >
              <strong>{option.title}</strong>
              <span>{option.copy}</span>
            </button>
          ))}
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
                onClick={() => onSetWeekShape(option.value)}
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
            {SESSION_OPTIONS.map((option) => (
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
        <p className="kicker">Assign schedules</p>
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
          <button type="button" className="btn" onClick={() => applyTemplate(squad.map((player) => player.name))}>
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
        <TrainingMixEditor plan={draft} onChange={setDraft} />
        <div className="row-actions">
          <button type="button" className="btn btn--ghost" disabled={selected.length === 0} onClick={() => applyDraft(selected)}>
            Assign mix to {selected.length || 0} selected
          </button>
          <button type="button" className="text-btn" onClick={() => setSelected(squad.map((player) => player.name))}>
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
                    <td>{plan.recovery ? "Recovery" : mixAbbrev(plan.mix)}</td>
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
              onChange={(plan) => onSetPlans({ ...save.plans, [selected[0]!]: plan })}
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
    </div>
  );
}
