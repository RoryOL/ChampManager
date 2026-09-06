import type { PlayerPlan, TrainingType } from "../types";
import { TRAINING_TYPE_OPTIONS, mixTotal, setMixShare } from "../lib/training";

type Props = {
  plan: PlayerPlan;
  disabled?: boolean;
  onChange: (plan: PlayerPlan) => void;
};

export function TrainingMixEditor({ plan, disabled, onChange }: Props) {
  return (
    <div className="mix-editor">
      <label className="mix-recovery">
        <input
          type="checkbox"
          checked={plan.recovery}
          disabled={disabled}
          onChange={(event) => onChange({ ...plan, recovery: event.target.checked })}
        />
        Recovery this week
      </label>
      {TRAINING_TYPE_OPTIONS.map((option) => (
        <label key={option.value} className={`mix-row${plan.recovery || disabled ? " is-disabled" : ""}`}>
          <span>
            <strong>{option.title}</strong>
            <em>{option.copy}</em>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            disabled={disabled || plan.recovery}
            value={plan.mix[option.value as TrainingType]}
            onChange={(event) =>
              onChange({
                ...plan,
                mix: setMixShare(plan.mix, option.value, Number(event.target.value)),
              })
            }
          />
          <b>{plan.recovery ? 0 : plan.mix[option.value]}%</b>
        </label>
      ))}
      <p className="hint hint--tight">
        {plan.recovery
          ? "He sits out the work. Match fitness comes back; profile stats stay banked."
          : `Work splits to ${mixTotal(plan.mix)}%. Workrate and composure cannot be trained.`}
      </p>
    </div>
  );
}
