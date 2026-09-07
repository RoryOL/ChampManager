import { useMemo, useState } from "react";
import type { GameSave, Tactics } from "../types";
import { SwapConfirmBar, nextSwapPick } from "../components/SwapConfirmBar";
import { TacticControls } from "../components/TacticControls";
import { isInjured } from "../lib/injuries";
import { formatMatchRating, lastMatchRating, seasonStatsFor } from "../lib/matchStats";
import { moodLabel, moodValue } from "../lib/mood";
import { matchShirtNumber, matchSlot, ratedSquad, sheetPlayers } from "../lib/players";
import { conditionFor, fitnessOf } from "../lib/training";

type Props = {
  save: GameSave;
  onChange: (tactics: Tactics) => void;
  onSwap: (first: string, second: string) => void;
};

export function TacticsScreen({ save, onChange, onSwap }: Props) {
  const xv = sheetPlayers(save.clubId, save.sheet, save.seed);
  const squad = useMemo(() => ratedSquad(save.clubId, save.seed), [save.clubId, save.seed]);
  const byName = useMemo(() => new Map(squad.map((player) => [player.name, player])), [squad]);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const names = [...save.sheet.starters, ...save.sheet.subs];
  const matchIds = save.matches.map((match) => match.id);

  const tap = (name: string) => {
    const next = nextSwapPick(first, second, name);
    setFirst(next.first);
    setSecond(next.second);
  };

  const confirmSwap = () => {
    if (!first || !second) return;
    const inSheet = (player: string) => save.sheet.starters.includes(player) || save.sheet.subs.includes(player);
    if ((isInjured(save.condition[first]) && !inSheet(first)) || (isInjured(save.condition[second]) && !inSheet(second))) {
      return;
    }
    onSwap(first, second);
    setFirst(null);
    setSecond(null);
  };

  return (
    <div className="screen">
      <p className="hint">
        Match numbers follow today&apos;s fifteen, not squad jerseys. Fitness, average match rating, slot and form sit
        on each row. Tap two names, then Swap, to change a position or bring a sub on — it will not move until you
        confirm.
      </p>
      <h3 className="list-title">Fifteen and bench</h3>
      <SwapConfirmBar
        first={first}
        second={second}
        onSwap={confirmSwap}
        onClear={() => {
          setFirst(null);
          setSecond(null);
        }}
        hint="Pick two names, then tap Swap. A second tap on the same name drops him from the pair."
      />
      <ul className="player-list">
        {names.map((name) => {
          const player = byName.get(name);
          if (!player) return null;
          const condition = conditionFor(name, save.condition);
          const season = seasonStatsFor(save.reports, save.clubId, name);
          const last = lastMatchRating(save.reports, save.clubId, name, matchIds);
          const slot = matchSlot(save.sheet, name);
          const number = matchShirtNumber(save.sheet, name);
          const onField = save.sheet.starters.includes(name);
          const form = `${moodLabel(moodValue(condition))}${last !== undefined ? ` · last ${formatMatchRating(last)}` : ""}`;
          const picked = name === first || name === second;
          return (
            <li key={name}>
              <button type="button" className={picked ? "is-picked" : ""} onClick={() => tap(name)}>
                <b>{number}</b>
                <span>
                  <strong>{player.name}</strong>
                  <em>
                    {onField ? slot : "Bench"} · Fit {fitnessOf(condition)} · Avg{" "}
                    {formatMatchRating(season.minutes > 0 ? season.rating : undefined)} · {form}
                    {isInjured(condition) ? " · Out" : ""}
                  </em>
                </span>
                <i>{formatMatchRating(season.minutes > 0 ? season.rating : undefined)}</i>
              </button>
            </li>
          );
        })}
      </ul>
      <TacticControls tactics={save.tactics} onChange={onChange} xv={xv} />
    </div>
  );
}
