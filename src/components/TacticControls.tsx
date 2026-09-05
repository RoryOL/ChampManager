import type { Tactics } from "../types";
import { aggressionLabel, buildLabel, MENTALITY_OPTIONS, puckoutLabel, SHAPE_OPTIONS } from "../lib/attributes";

type Props = {
  tactics: Tactics;
  onChange: (tactics: Tactics) => void;
  compact?: boolean;
};

export function TacticControls({ tactics, onChange, compact = false }: Props) {
  return (
    <div className={compact ? "tactic-controls tactic-controls--compact" : "tactic-controls"}>
      <section className="card">
        <h3>Mentality</h3>
        <div className="choice-row">
          {MENTALITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={tactics.mentality === option.value ? "is-active" : ""}
              onClick={() => onChange({ ...tactics, mentality: option.value })}
            >
              {option.title}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>Build-up</h3>
        <p className="tactic-copy">
          Short passing through the lines on the left, direct long ball on the right. Currently{" "}
          <strong>{buildLabel(tactics.build)}</strong>.
        </p>
        <label className="dial">
          <span>Short</span>
          <input
            type="range"
            min={0}
            max={100}
            value={tactics.build}
            onChange={(event) => onChange({ ...tactics, build: Number(event.target.value) })}
          />
          <span>Long</span>
        </label>
      </section>
      <section className="card">
        <h3>Puck-out</h3>
        <p className="tactic-copy">
          Short to the half-backs on the left, long contest on the right. Currently{" "}
          <strong>{puckoutLabel(tactics.puckout)}</strong>.
        </p>
        <label className="dial">
          <span>Short</span>
          <input
            type="range"
            min={0}
            max={100}
            value={tactics.puckout}
            onChange={(event) => onChange({ ...tactics, puckout: Number(event.target.value) })}
          />
          <span>Long</span>
        </label>
      </section>
      <section className="card">
        <h3>Aggression</h3>
        <p className="tactic-copy">
          Light tackling on the left, aggressive on the right. Currently <strong>{aggressionLabel(tactics.aggression)}</strong>
          {tactics.aggression >= 80
            ? " — hooks land more often, but you will give away frees and yellow cards."
            : tactics.aggression < 25
              ? " — fewer frees given away, fewer blocks."
              : "."}
        </p>
        <label className="dial">
          <span>Light</span>
          <input
            type="range"
            min={0}
            max={100}
            value={tactics.aggression ?? 46}
            onChange={(event) => onChange({ ...tactics, aggression: Number(event.target.value) })}
          />
          <span>Aggressive</span>
        </label>
      </section>
      <section className="card">
        <h3>Shape</h3>
        <div className="choice-stack">
          {SHAPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={tactics.shape === option.value ? "is-active" : ""}
              onClick={() => onChange({ ...tactics, shape: option.value })}
            >
              <strong>{option.title}</strong>
              {!compact ? <span>{option.copy}</span> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
