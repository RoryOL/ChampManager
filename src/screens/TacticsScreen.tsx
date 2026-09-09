import { useEffect, useMemo, useState } from "react";
import type { Championship, GameSave, Match, RatedPlayer, Tactics, TeamSheet } from "../types";
import { PlayerCompare } from "../components/PlayerCompare";
import { SwapConfirmBar, nextSwapPick } from "../components/SwapConfirmBar";
import { TacticControls } from "../components/TacticControls";
import { ManMarkPicker } from "../components/ManMarkPicker";
import { TacticsColumnPicker } from "../components/TacticsColumnPicker";
import { ATTRIBUTE_LABELS, ATTRIBUTE_SHORT, type AttributeKey } from "../lib/attributes";
import { compactName } from "../lib/display";
import { isInjured, isSuspended, isUnavailable } from "../lib/injuries";
import { formatMatchRating, lastMatchRating, seasonStatsFor } from "../lib/matchStats";
import { coachPickSheet, defaultSheet, expandSheetToPanel, matchShirtNumber, matchSlot, ratedSquad, sheetPlayers } from "../lib/players";
import { resolveMatchSides, teamById } from "../lib/resolve";
import {
  compareStatLine,
  loadTacticsColumns,
  saveTacticsColumns,
  tacticsCompareAttributeOrder,
  type CompareLine,
} from "../lib/tacticsGrid";
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

function slotLabel(sheet: TeamSheet, name: string): string {
  if (!sheet.starters.includes(name)) return "Bench";
  return matchSlot(sheet, name) ?? "Bench";
}

function ratingLine(id: string, label: string, left?: number, right?: number): CompareLine | null {
  if (left === undefined && right === undefined) return null;
  if (typeof left !== "number" || typeof right !== "number") {
    return {
      id,
      label,
      left: formatMatchRating(left),
      right: formatMatchRating(right),
      winner: "none",
    };
  }
  return compareStatLine(id, label, left, right);
}

function comparePanelLines(
  save: GameSave,
  sheet: TeamSheet,
  leftName: string,
  rightName: string,
  left: RatedPlayer,
  right: RatedPlayer,
  columns: AttributeKey[],
): CompareLine[] {
  const leftCondition = conditionFor(leftName, save.condition);
  const rightCondition = conditionFor(rightName, save.condition);
  const leftRatings = matchRatings(left, leftCondition);
  const rightRatings = matchRatings(right, rightCondition);
  const leftSeason = seasonStatsFor(save.reports, save.clubId, leftName);
  const rightSeason = seasonStatsFor(save.reports, save.clubId, rightName);
  const matchIds = save.matches.map((match) => match.id);
  const lines: CompareLine[] = [
    { id: "slot", label: "Slot", left: slotLabel(sheet, leftName), right: slotLabel(sheet, rightName), winner: "none" },
    { id: "pref", label: "Pref", left: left.position, right: right.position, winner: "none" },
    { id: "age", label: "Age", left: left.age, right: right.age, winner: "none" },
    compareStatLine("ovr", "Ovr", leftRatings.overall, rightRatings.overall),
    compareStatLine("fit", "Fit", fitnessOf(leftCondition), fitnessOf(rightCondition)),
  ];
  const avg = ratingLine(
    "avg",
    "Avg",
    leftSeason.minutes > 0 ? leftSeason.rating : undefined,
    rightSeason.minutes > 0 ? rightSeason.rating : undefined,
  );
  const last = ratingLine(
    "last",
    "Last",
    lastMatchRating(save.reports, save.clubId, leftName, matchIds),
    lastMatchRating(save.reports, save.clubId, rightName, matchIds),
  );
  if (avg) lines.push(avg);
  if (last) lines.push(last);
  for (const key of tacticsCompareAttributeOrder(columns)) {
    lines.push(compareStatLine(key, ATTRIBUTE_LABELS[key], leftRatings[key], rightRatings[key]));
  }
  return lines;
}

export function TacticsScreen({ save, championship, nextMatch, onChange, onSwap, onSetSheet, onOpenTeam }: Props) {
  const squad = useMemo(() => ratedSquad(save.clubId, save), [save]);
  const byName = useMemo(() => new Map(squad.map((player) => [player.name, player])), [squad]);
  const [first, setFirst] = useState<string | null>(null);
  const [second, setSecond] = useState<string | null>(null);
  const [columns, setColumns] = useState<AttributeKey[]>(() => loadTacticsColumns());
  const sheet = expandSheetToPanel(save.clubId, save.sheet, save);
  const xv = sheetPlayers(save.clubId, sheet, save);
  const names = [...sheet.starters, ...sheet.subs];
  const matchIds = save.matches.map((match) => match.id);
  const sides = championship && nextMatch ? resolveMatchSides(championship, nextMatch) : null;
  const opponentId =
    sides && (sides.homeId === save.clubId ? sides.awayId : sides.awayId === save.clubId ? sides.homeId : null);
  const opponent = championship && opponentId ? teamById(championship, opponentId) : undefined;
  const us = championship ? teamById(championship, save.clubId) : undefined;
  const opponentSheet = opponentId
    ? expandSheetToPanel(opponentId, save.rivals[opponentId]?.sheet ?? defaultSheet(opponentId, save), save)
    : null;
  const opponentXv = opponentId && opponentSheet ? sheetPlayers(opponentId, opponentSheet, save) : [];

  useEffect(() => {
    const full = expandSheetToPanel(save.clubId, save.sheet, save);
    if (full.subs.length === save.sheet.subs.length && full.starters.length === save.sheet.starters.length) return;
    onSetSheet(full);
  }, [onSetSheet, save.clubId, save.seed, save.sheet]);

  const setGridColumns = (keys: AttributeKey[]) => {
    setColumns(keys);
    saveTacticsColumns(keys);
  };

  const tap = (name: string) => {
    const next = nextSwapPick(first, second, name);
    setFirst(next.first);
    setSecond(next.second);
  };

  const confirmSwap = () => {
    if (!first || !second) return;
    const inSheet = (player: string) => sheet.starters.includes(player) || sheet.subs.includes(player);
    if ((isUnavailable(save.condition[first]) && !inSheet(first)) || (isUnavailable(save.condition[second]) && !inSheet(second))) {
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

  const left = first ? byName.get(first) : undefined;
  const right = second ? byName.get(second) : undefined;
  const compareLines = left && right && first && second ? comparePanelLines(save, sheet, first, second, left, right, columns) : [];

  return (
    <div className="screen">
      <p className="hint">
        Whole panel is available. Fifteen start; five substitutions on the day. Tap two names to compare who is better
        where, then Swap beside the list — it will not move until you confirm.
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
        {left && right ? <PlayerCompare leftName={left.name} rightName={right.name} lines={compareLines} /> : null}
        <TacticsColumnPicker selected={columns} onChange={setGridColumns} />
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
                {columns.map((key) => (
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
                const slot = matchSlot(sheet, name);
                const number = matchShirtNumber(sheet, name);
                const overallDelta = ratings.overall - player.ratings.overall;
                const onField = sheet.starters.includes(name);
                const picked = name === first || name === second;
                return (
                  <tr key={name} className={picked ? "is-picked" : ""} onClick={() => tap(name)}>
                    <td className="num">{number}</td>
                    <td className="name">
                      <strong>{player.name}</strong>
                      {isInjured(condition) ? <em>Out</em> : isSuspended(condition) ? <em>Suspended</em> : null}
                    </td>
                    <td>{onField ? slot : "Bench"}</td>
                    <td>{player.position}</td>
                    <td className={`ovr ${toneClass(overallDelta)}`}>{ratings.overall}</td>
                    <td>{fitnessOf(condition)}</td>
                    <td>{formatMatchRating(season.minutes > 0 ? season.rating : undefined)}</td>
                    <td>{formatMatchRating(last)}</td>
                    <td>{player.age}</td>
                    {columns.map((key) => (
                      <td key={key}>{ratings[key]}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <TacticControls tactics={save.tactics} onChange={onChange} xv={xv} />
      {opponent && opponentSheet ? (
        <ManMarkPicker
          tactics={save.tactics}
          onChange={onChange}
          ourSheet={sheet}
          theirSheet={opponentSheet}
          ourXv={xv}
          theirXv={opponentXv}
          ourName={us ? compactName(us) : "Us"}
          theirName={compactName(opponent)}
        />
      ) : null}
    </div>
  );
}
