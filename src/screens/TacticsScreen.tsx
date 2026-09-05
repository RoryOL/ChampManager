import type { GameSave, Tactics } from "../types";
import {
  BUILD_OPTIONS,
  MENTALITY_OPTIONS,
  PUCKOUT_OPTIONS,
  SHAPE_OPTIONS,
} from "../lib/attributes";

type Props = {
  save: GameSave;
  onChange: (tactics: Tactics) => void;
};

function TacticBlock<T extends string>({
  title,
  hint,
  value,
  options,
  onPick,
}: {
  title: string;
  hint: string;
  value: T;
  options: { value: T; title: string; copy: string }[];
  onPick: (value: T) => void;
}) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="tactic-copy">{hint}</p>
      <div className="choice-stack">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-active" : ""}
            onClick={() => onPick(option.value)}
          >
            <strong>{option.title}</strong>
            <span>{option.copy}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function TacticsScreen({ save, onChange }: Props) {
  const tactics = save.tactics;
  return (
    <div className="screen">
      <p className="hint">
        These knobs feed the match engine: long ball versus a running game, how you restart, and whether you play a sweeper.
      </p>
      <TacticBlock
        title="Mentality"
        hint="How hard you chase the next score."
        value={tactics.mentality}
        options={MENTALITY_OPTIONS}
        onPick={(mentality) => onChange({ ...tactics, mentality })}
      />
      <TacticBlock
        title="Build-up"
        hint="Direct long ball versus running the sliotar through midfield."
        value={tactics.build}
        options={BUILD_OPTIONS}
        onPick={(build) => onChange({ ...tactics, build })}
      />
      <TacticBlock
        title="Puck-out"
        hint="Win the aerial duel, or work it short to the half-back line."
        value={tactics.puckout}
        options={PUCKOUT_OPTIONS}
        onPick={(puckout) => onChange({ ...tactics, puckout })}
      />
      <TacticBlock
        title="Shape"
        hint="Traditional 6-2-6, or a seventh defender sweeping in front of the full-back line."
        value={tactics.shape}
        options={SHAPE_OPTIONS}
        onPick={(shape) => onChange({ ...tactics, shape })}
      />
    </div>
  );
}
