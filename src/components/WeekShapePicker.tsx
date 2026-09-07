import type { WeekShape } from "../types";
import { WEEK_SHAPE_OPTIONS } from "../lib/training";

type Props = {
  weekShape: WeekShape;
  onChange: (shape: WeekShape) => void;
};

export function WeekShapePicker({ weekShape, onChange }: Props) {
  return (
    <div className="choice-stack">
      {WEEK_SHAPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={weekShape === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.title}</strong>
          <span>{option.copy}</span>
        </button>
      ))}
    </div>
  );
}
