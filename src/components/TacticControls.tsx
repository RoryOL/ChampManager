import type { RatedPlayer, Tactics } from "../types";
import {
  aggressionLabel,
  buildLabel,
  MENTALITY_OPTIONS,
  pressureLabel,
  puckoutLabel,
  SHAPE_OPTIONS,
} from "../lib/attributes";

type Props = {
  tactics: Tactics;
  onChange: (tactics: Tactics) => void;
  compact?: boolean;
  xv?: RatedPlayer[];
};

function TakerSelect({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string | undefined;
  players: RatedPlayer[];
  onChange: (name: string) => void;
}) {
  const selected = value && players.some((player) => player.name === value) ? value : "";
  return (
    <label className="taker-select">
      <span>{label}</span>
      <select value={selected} onChange={(event) => onChange(event.target.value)}>
        <option value="">Best available</option>
        {players.map((player) => (
          <option key={player.name} value={player.name}>
            {player.number}. {player.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TacticControls({ tactics, onChange, compact = false, xv = [] }: Props) {
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
          Light tackling on the left, aggressive on the right. Currently{" "}
          <strong>{aggressionLabel(tactics.aggression)}</strong>
          {tactics.aggression >= 80
            ? " — hooks land more often, but you will give away frees and yellow cards. Match fitness drops faster."
            : tactics.aggression < 25
              ? " — fewer frees given away, fewer blocks."
              : " — higher aggression costs more match fitness."}
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
        <h3>Pressure</h3>
        <p className="tactic-copy">
          Sit off on the left, hunt every possession on the right. Currently{" "}
          <strong>{pressureLabel(tactics.pressure ?? 48)}</strong>
          {tactics.pressure >= 70
            ? " — more successful tackles, but the press drains match fitness."
            : "."}
        </p>
        <label className="dial">
          <span>Sit off</span>
          <input
            type="range"
            min={0}
            max={100}
            value={tactics.pressure ?? 48}
            onChange={(event) => onChange({ ...tactics, pressure: Number(event.target.value) })}
          />
          <span>Press</span>
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
        {tactics.shape === "sweeper" ? (
          <p className="tactic-copy">Five forwards cover more ground — their match fitness drops faster.</p>
        ) : null}
      </section>
      {xv.length > 0 ? (
        <section className="card">
          <h3>Set-piece takers</h3>
          <p className="tactic-copy">Long frees and 65s, close-in frees, and sideline cuts.</p>
          <TakerSelect
            label="Long frees"
            value={tactics.longFreeTaker}
            players={xv}
            onChange={(name) => onChange({ ...tactics, longFreeTaker: name || undefined })}
          />
          <TakerSelect
            label="Short frees"
            value={tactics.shortFreeTaker}
            players={xv}
            onChange={(name) => onChange({ ...tactics, shortFreeTaker: name || undefined })}
          />
          <TakerSelect
            label="Sidelines"
            value={tactics.sidelineTaker}
            players={xv}
            onChange={(name) => onChange({ ...tactics, sidelineTaker: name || undefined })}
          />
        </section>
      ) : null}
    </div>
  );
}
