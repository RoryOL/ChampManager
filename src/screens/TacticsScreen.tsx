import type { GameSave, Tactics } from "../types";
import { TacticControls } from "../components/TacticControls";
import { sheetPlayers } from "../lib/players";

type Props = {
  save: GameSave;
  onChange: (tactics: Tactics) => void;
};

export function TacticsScreen({ save, onChange }: Props) {
  const xv = sheetPlayers(save.clubId, save.sheet);
  return (
    <div className="screen">
      <p className="hint">
        Build-up, puck-outs, shooting, aggression and pressure are dials. Speculative shooting takes more looks from
        distance; waiting for a certain shot converts better. High pressure and aggression win more tackles but cost
        match fitness. Pick long-free, short-free and sideline takers from the fifteen.
      </p>
      <TacticControls tactics={save.tactics} onChange={onChange} xv={xv} />
    </div>
  );
}
