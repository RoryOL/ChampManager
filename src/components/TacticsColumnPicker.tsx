import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, ATTRIBUTE_SHORT, type AttributeKey } from "../lib/attributes";
import { toggleTacticsColumn } from "../lib/tacticsGrid";

type Props = {
  selected: AttributeKey[];
  onChange: (keys: AttributeKey[]) => void;
};

export function TacticsColumnPicker({ selected, onChange }: Props) {
  const picked = new Set(selected);
  return (
    <div className="tactics-columns">
      <div className="tactics-columns__head">
        <p className="kicker">Grid columns</p>
        {selected.length > 0 ? (
          <button type="button" className="btn btn--ghost" onClick={() => onChange([])}>
            Clear
          </button>
        ) : null}
      </div>
      <p className="hint hint--tight">Add attributes to the panel list. Pick two names to compare who is better where.</p>
      {ATTRIBUTE_GROUPS.map((group) => (
        <div key={group.id} className="tactics-columns__group">
          <span>{group.label}</span>
          <div className="template-row">
            {group.keys.map((key) => (
              <button
                key={key}
                type="button"
                className={picked.has(key) ? "is-active" : ""}
                title={ATTRIBUTE_LABELS[key]}
                aria-pressed={picked.has(key)}
                onClick={() => onChange(toggleTacticsColumn(selected, key))}
              >
                {ATTRIBUTE_SHORT[key]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
