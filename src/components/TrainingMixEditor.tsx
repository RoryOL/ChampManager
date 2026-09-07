import type { PlayerPlan, TrainingIntensity, TrainingType } from "../types";
import { INTENSITY_OPTIONS, TRAINING_TYPE_OPTIONS, intensityTitle, mixTotal, setMixShare } from "../lib/training";

type Props = {
  plan: PlayerPlan;
  squadIntensity?: TrainingIntensity;
  disabled?: boolean;
  onChange: (plan: PlayerPlan) => void;
};

export function TrainingMixEditor({ plan, squadIntensity = "balanced", disabled, onChange }: Props) {
  const intensity = plan.intensity;
  return (
    <div className="mix-editor">
      <p className="kicker">Intensity</p>
      <div className="template-row">
        <button
          type="button"
          className={intensity === undefined ? "is-active" : ""}
          disabled={disabled}
          onClick={() => onChange({ ...plan, recovery: false, intensity: undefined })}
        >
          Squad · {intensityTitle(squadIntensity)}
        </button>
        {INTENSITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={intensity === option.value ? "is-active" : ""}
            disabled={disabled}
            onClick={() => onChange({ ...plan, recovery: false, intensity: option.value })}
          >
            {option.title}
          </button>
        ))}
      </div>
      {TRAINING_TYPE_OPTIONS.map((option) => (
        <label key={option.value} className={`mix-row${disabled ? " is-disabled" : ""}`}>
          <span>
            <strong>{option.title}</strong>
            <em>{option.copy}</em>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            disabled={disabled}
            value={plan.mix[option.value as TrainingType]}
            onChange={(event) =>
              onChange({
                ...plan,
                recovery: false,
                mix: setMixShare(plan.mix, option.value, Number(event.target.value)),
              })
            }
          />
          <b>{plan.mix[option.value]}%</b>
        </label>
      ))}
      <p className="hint hint--tight">
        Work splits to {mixTotal(plan.mix)}%. Workrate and composure cannot be trained. Light intensity is the rest
        week: legs come back and attributes only tick a little.
      </p>
    </div>
  );
}
