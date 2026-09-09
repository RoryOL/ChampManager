import { ATTRIBUTE_LABELS, type AttributeKey } from "../lib/attributes";
import { STAT_ICON_PATH } from "../lib/statIcons";

type Props = {
  stat: AttributeKey;
  value?: number;
  className?: string;
};

export function StatIcon({ stat, value, className }: Props) {
  const label = value != null ? `${ATTRIBUTE_LABELS[stat]} ${value}` : ATTRIBUTE_LABELS[stat];
  return (
    <span className={`stat-icon${className ? ` ${className}` : ""}`} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={STAT_ICON_PATH[stat]} fill="currentColor" />
      </svg>
    </span>
  );
}
