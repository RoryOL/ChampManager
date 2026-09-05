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
        Build-up, puck-outs and aggression are dials. Slide tackling from light to aggressive — you win more hooks, but
        give away more frees and bookings.
      </p>
      <TacticControls tactics={save.tactics} onChange={onChange} />
    </div>
  );
}
