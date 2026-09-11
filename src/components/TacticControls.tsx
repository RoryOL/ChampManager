import type { RatedPlayer, Tactics } from "../types";
import {
  aggressionLabel,
  buildLabel,
  MENTALITY_OPTIONS,
  pressureLabel,
  puckoutLabel,
  SHAPE_OPTIONS,
} from "../lib/attributes";
import { shootingLabel } from "../lib/shooting";

type Props = {
  tactics: Tactics;
  onChange: (tactics: Tactics) => void;
  compact?: boolean;
  xv?: RatedPlayer[];
  disabled?: boolean;
};

function TakerSelect({
  label,
  value,
  players,
  onChange,
  numbered = true,
}: {
  label: string;
  value: string | undefined;
  players: RatedPlayer[];
  onChange: (name: string) => void;
  numbered?: boolean;
}) {
  const selected = value && players.some((player) => player.name === value) ? value : "";
  return (
    <label className="taker-select">
      <span>{label}</span>
      <select value={selected} onChange={(event) => onChange(event.target.value)}>
        <option value="">Best available</option>
        {players.map((player, index) => (
          <option key={player.name} value={player.name}>
            {numbered ? `${index + 1}. ${player.name}` : player.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TacticControls({ tactics, onChange, compact = false, xv = [], disabled = false }: Props) {
  return (
    <fieldset disabled={disabled} className={compact ? "tactic-controls tactic-controls--compact" : "tactic-controls"}>
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
        <p className="tactic-status">{buildLabel(tactics.build)}</p>
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
        <p className="tactic-status">{puckoutLabel(tactics.puckout)}</p>
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
        {xv.length > 0 ? (
          <TakerSelect
            label="Puck-out target"
            value={tactics.puckoutTarget}
            players={xv.slice(7, 12)}
            numbered={false}
            onChange={(name) => onChange({ ...tactics, puckoutTarget: name || undefined })}
          />
        ) : null}
      </section>
      <section className="card">
        <h3>Aggression</h3>
        <p className="tactic-status">{aggressionLabel(tactics.aggression)}</p>
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
        <p className="tactic-status">{pressureLabel(tactics.pressure ?? 48)}</p>
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
        <h3>Shot certainty</h3>
        <p className="tactic-status">{shootingLabel(tactics.shooting ?? 50)}</p>
        <label className="dial">
          <span>Speculative</span>
          <input
            type="range"
            min={0}
            max={100}
            value={tactics.shooting ?? 50}
            onChange={(event) => onChange({ ...tactics, shooting: Number(event.target.value) })}
          />
          <span>Certain</span>
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
            </button>
          ))}
        </div>
      </section>
      {xv.length > 0 ? (
        <section className="card">
          <h3>Set-piece takers</h3>
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
        </section>
      ) : null}
    </fieldset>
  );
}
