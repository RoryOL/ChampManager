import { useEffect, useMemo, useState } from "react";
import type { Championship, GameSave, Match, Tactics, TeamSheet } from "../types";
import { SwapConfirmBar, nextSwapPick } from "../components/SwapConfirmBar";
import { TacticControls } from "../components/TacticControls";
import { compactName } from "../lib/display";
import { isInjured } from "../lib/injuries";
import { formatMatchRating, lastMatchRating, seasonStatsFor } from "../lib/matchStats";
import { coachPickSheet, expandSheetToPanel, matchShirtNumber, matchSlot, ratedSquad, sheetPlayers } from "../lib/players";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { conditionFor, fitnessOf, matchRatings, toneClass } from "../lib/training";

type Props = {
  save: GameSave;
  championship?: Championship;
  nextMatch?: Match | null;
  onChange: (tactics: Tactics) => void;
  onSwap: (first: string, second: string) => void;
  onSetSheet: (sheet: TeamSheet) => void;
  onOpenTeam?: (teamId: string) => void;
};

export function TacticsScreen({ save, championship, nextMatch, onChange, onSwap, onSetSheet, onOpenTeam }: Props) {
  const squad = useMemo(() => ratedSquad(save.clubId, save), [save]);
  const byName = useMemo(() => new Map(squad.map((player) => [player.name, player])), [squad]);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const sheet = expandSheetToPanel(save.clubId, save.sheet, save);
  const xv = sheetPlayers(save.clubId, sheet, save);
  const names = [...sheet.starters, ...sheet.subs];
  const matchIds = save.matches.map((match) => match.id);
  const sides = championship && nextMatch ? resolveMatchSides(championship, nextMatch) : null;
  const opponentId =
    sides && (sides.homeId === save.clubId ? sides.awayId : sides.awayId === save.clubId ? sides.homeId : null);
  const opponent = championship && opponentId ? teamById(championship, opponentId) : undefined;

  useEffect(() => {
    const full = expandSheetToPanel(save.clubId, save.sheet, save);
    if (full.subs.length === save.sheet.subs.length && full.starters.length === save.sheet.starters.length) return;
    onSetSheet(full);
  }, [onSetSheet, save.clubId, save.seed, save.sheet]);

  const tap = (name: string) => {
    const next = nextSwapPick(first, second, name);
    setFirst(next.first);
    setSecond(next.second);
  };

  const confirmSwap = () => {
    if (!first || !second) return;
    const inSheet = (player: string) => sheet.starters.includes(player) || sheet.subs.includes(player);
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
        Whole panel is available. Fifteen start; five substitutions on the day. Tap two names, then Swap beside the
        list — it will not move until you confirm.
      </p>
      <div className="row-actions">
        <button type="button" className="btn" onClick={askCoach}>
          Ask the coach to pick the team
        </button>
        {opponent && onOpenTeam ? (
          <button type="button" className="btn btn--ghost" onClick={() => onOpenTeam(opponent.id)}>
            Open {compactName(opponent)} squad
          </button>
        ) : null}
      </div>
      <h3 className="list-title">Match-day panel</h3>
      <div className="tactics-pick">
        <SwapConfirmBar
          first={first}
          second={second}
          onSwap={confirmSwap}
          onClear={() => {
            setFirst(null);
            setSecond(null);
          }}
          hint="Pick two names in the list, then Swap. A second tap on the same name drops him from the pair."
        />
        <div className="squad-table-wrap tactics-table-wrap">
        <table className="squad-table tactics-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="name">Player</th>
              <th>Slot</th>
              <th>Pref</th>
              <th className="ovr">Ovr</th>
              <th>Fit</th>
              <th>Avg</th>
              <th>Last</th>
              <th>Age</th>
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
              const slot = matchSlot(sheet, name);
              const number = matchShirtNumber(sheet, name);
              const overallDelta = ratings.overall - player.ratings.overall;
              const onField = sheet.starters.includes(name);
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
                  <td>{player.position}</td>
                  <td className={`ovr ${toneClass(overallDelta)}`}>{ratings.overall}</td>
                  <td>{fitnessOf(condition)}</td>
                  <td>{formatMatchRating(season.minutes > 0 ? season.rating : undefined)}</td>
                  <td>{formatMatchRating(last)}</td>
                  <td>{player.age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      <TacticControls tactics={save.tactics} onChange={onChange} xv={xv} />
    </div>
  );
}
