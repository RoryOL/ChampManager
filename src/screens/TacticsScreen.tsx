import type { GameSave, Tactics } from "../types";
import { TacticControls } from "../components/TacticControls";

type Props = {
  save: GameSave;
  onChange: (tactics: Tactics) => void;
};

export function TacticsScreen({ save, onChange }: Props) {
  return (
    <div className="screen">
      <p className="hint">
        Build-up and puck-outs are dials, not switches. Slide toward short passing or long ball, and toward short or
        long restarts.
      </p>
      <TacticControls tactics={save.tactics} onChange={onChange} />
    </div>
  );
}
