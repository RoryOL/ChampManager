import type { GameSave, Tactics } from "../types";

type Props = {
  save: GameSave;
  onChange: (tactics: Tactics) => void;
};

const mentalities: Tactics["mentality"][] = ["contain", "balanced", "attacking"];
const styles: Tactics["style"][] = ["possession", "direct"];
const pressing: Tactics["pressing"][] = ["low", "medium", "high"];

export function TacticsScreen({ save, onChange }: Props) {
  const tactics = save.tactics;
  return (
    <div className="screen">
      <p className="hint">Tactics feed the match engine. Other clubs use a balanced setup.</p>
      <section className="card">
        <h3>Mentality</h3>
        <div className="choice-row">
          {mentalities.map((value) => (
            <button
              key={value}
              type="button"
              className={tactics.mentality === value ? "is-active" : ""}
              onClick={() => onChange({ ...tactics, mentality: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>Style</h3>
        <div className="choice-row">
          {styles.map((value) => (
            <button
              key={value}
              type="button"
              className={tactics.style === value ? "is-active" : ""}
              onClick={() => onChange({ ...tactics, style: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>Pressing</h3>
        <div className="choice-row">
          {pressing.map((value) => (
            <button
              key={value}
              type="button"
              className={tactics.pressing === value ? "is-active" : ""}
              onClick={() => onChange({ ...tactics, pressing: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
