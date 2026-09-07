import { useMemo, useState } from "react";
import type { GameSave, Tactics, TeamSheet } from "../types";
import { SwapConfirmBar, nextSwapPick } from "../components/SwapConfirmBar";
import { TacticControls } from "../components/TacticControls";
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_SHORT,
} from "../lib/attributes";
import { isInjured } from "../lib/injuries";
import { formatMatchRating, lastMatchRating, seasonStatsFor } from "../lib/matchStats";
import { coachPickSheet, matchShirtNumber, matchSlot, ratedSquad, sheetPlayers } from "../lib/players";
import { conditionFor, fitnessOf, matchRatings } from "../lib/training";

type Props = {
  save: GameSave;
  onChange: (tactics: Tactics) => void;
  onSwap: (first: string, second: string) => void;
  onSetSheet: (sheet: TeamSheet) => void;
};

export function TacticsScreen({ save, onChange, onSwap, onSetSheet }: Props) {
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

  const askCoach = () => {
    onSetSheet(coachPickSheet(squad, save.condition));
    setFirst(null);
    setSecond(null);
  };

  return (
    <div className="screen">
      <p className="hint">
        Match numbers follow today&apos;s fifteen, not squad jerseys. Scroll the table right for every attribute.
        Tap two names, then Swap, to change a position or bring a sub on — it will not move until you confirm.
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
      <div className="row-actions">
        <button type="button" className="btn btn--ghost" onClick={askCoach}>
          Ask the coach to pick the team
        </button>
      </div>
      <div className="squad-table-wrap tactics-table-wrap">
        <table className="squad-table tactics-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="name">Player</th>
              <th>Slot</th>
              <th>Fit</th>
              <th>Avg</th>
              <th>Last</th>
              <th>Pos</th>
              <th>Age</th>
              <th>Ovr</th>
              {ATTRIBUTE_KEYS.map((key) => (
                <th key={key} title={ATTRIBUTE_LABELS[key]}>
                  {ATTRIBUTE_SHORT[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {names.map((name) => {
              const player = byName.get(name);
              if (!player) return null;
              const condition = conditionFor(name, save.condition);
              const ratings = matchRatings(player, condition);
              const season = seasonStatsFor(save.reports, save.clubId, name);
              const last = lastMatchRating(save.reports, save.clubId, name, matchIds);
              const slot = matchSlot(save.sheet, name);
              const number = matchShirtNumber(save.sheet, name);
              const onField = save.sheet.starters.includes(name);
              const picked = name === first || name === second;
              return (
                <tr
                  key={name}
                  className={picked ? "is-picked" : ""}
                  onClick={() => tap(name)}
                >
                  <td className="num">{number}</td>
                  <td className="name">
                    <strong>{player.name}</strong>
                    {isInjured(condition) ? <em>Out</em> : null}
                  </td>
                  <td>{onField ? slot : "Bench"}</td>
                  <td>{fitnessOf(condition)}</td>
                  <td>{formatMatchRating(season.minutes > 0 ? season.rating : undefined)}</td>
                  <td>{formatMatchRating(last)}</td>
                  <td>{player.position}</td>
                  <td>{player.age}</td>
                  <td>{ratings.overall}</td>
                  {ATTRIBUTE_KEYS.map((key) => (
                    <td key={key}>{ratings[key]}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TacticControls tactics={save.tactics} onChange={onChange} xv={xv} />
    </div>
  );
}
