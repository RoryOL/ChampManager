import type { MatchEvent, PlayerCondition, PlayerMatchStats, RatedPlayer, TeamSheet } from "../types";
import { ATTRIBUTE_LABELS } from "../lib/attributes";
import { CHART_RATING_KEYS, CHART_RATING_SHORT, formatPair } from "../lib/matchStats";
import { matchOrderIndex, matchShirtNumber, matchSlot } from "../lib/players";
import { appearanceOf } from "../lib/subs";
import { conditionFor, matchRatings, toneClass } from "../lib/training";

type Props = {
  teamName: string;
  squad: RatedPlayer[];
  stats: PlayerMatchStats[];
  sheet?: TeamSheet;
  numberSheet?: TeamSheet;
  events?: MatchEvent[];
  condition?: Record<string, PlayerCondition>;
  showAttributes?: boolean;
  interactive?: boolean;
  picked?: string[];
  onTap?: (name: string) => void;
};

function SubMarks({ mark }: { mark: ReturnType<typeof appearanceOf> }) {
  if (mark.onMinute === undefined && mark.offMinute === undefined) return <span className="sub-marks" />;
  return (
    <span className="sub-marks">
      {mark.onMinute !== undefined ? (
        <span className="sub-mark is-on" title={`On ${mark.onMinute}'`}>
          <span aria-hidden="true">↑</span>
          {mark.onMinute}&apos;
        </span>
      ) : null}
      {mark.offMinute !== undefined ? (
        <span
          className={`sub-mark ${mark.offKind === "injury" ? "is-injury" : "is-off"}`}
          title={mark.offKind === "injury" ? `Injured ${mark.offMinute}'` : `Off ${mark.offMinute}'`}
        >
          <span aria-hidden="true">{mark.offKind === "injury" ? "×" : "↓"}</span>
          {mark.offMinute}&apos;
        </span>
      ) : null}
    </span>
  );
}

export function PlayerMatchTable({
  teamName,
  squad,
  stats,
  sheet,
  numberSheet,
  events = [],
  condition = {},
  showAttributes = true,
  interactive = false,
  picked = [],
  onTap,
}: Props) {
  const shirts = numberSheet ?? sheet;
  const byName = new Map(squad.map((player) => [player.name, player]));
  const pickedSet = new Set(picked);
  const rows = stats
    .filter((row) => row.started || row.minutes > 0 || byName.has(row.name))
    .map((row) => {
      const player = byName.get(row.name);
      const ratings = player ? matchRatings(player, conditionFor(row.name, condition)) : undefined;
      const number = shirts ? matchShirtNumber(shirts, row.name) : undefined;
      const slot = sheet ? matchSlot(sheet, row.name) : undefined;
      const mark = appearanceOf(events, row.teamId, row.name, shirts, sheet);
      return { row, player, ratings, number, slot, mark };
    })
    .sort((a, b) => {
      const byShirt = (a.number ?? 1000) - (b.number ?? 1000);
      if (byShirt !== 0) return byShirt;
      if (sheet) return matchOrderIndex(sheet, a.row.name) - matchOrderIndex(sheet, b.row.name);
      return Number(b.row.started) - Number(a.row.started);
    });

  return (
    <div className="chart-scroll">
      <table className="player-chart">
        <caption>{teamName}</caption>
        <thead>
          <tr>
            <th className="is-sticky">Player</th>
            <th>Pref</th>
            <th>Pos</th>
            <th>On/Off</th>
            {showAttributes ? (
              <>
                <th className="ovr">Ovr</th>
                {CHART_RATING_KEYS.map((key) => (
                  <th key={key} title={ATTRIBUTE_LABELS[key]}>
                    {CHART_RATING_SHORT[key]}
                  </th>
                ))}
              </>
            ) : null}
            <th>Fit</th>
            <th>Rt</th>
            <th>Min</th>
            <th>Poss</th>
            <th>Pass</th>
            <th>Shot</th>
            <th title="Frees scored / attempted">Free</th>
            <th title="65s scored / attempted">65</th>
            <th title="Frees conceded">FrC</th>
            <th>HF</th>
            <th>POw</th>
            <th>Tck</th>
            <th>Km</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, player, ratings, number, slot, mark }) => {
            const selected = pickedSet.has(row.name);
            const overallDelta = ratings && player ? ratings.overall - player.ratings.overall : 0;
            const onSheet = sheet
              ? sheet.starters.includes(row.name) || sheet.subs.includes(row.name)
              : true;
            const canTap = Boolean(interactive && onTap && onSheet);
            return (
              <tr
                key={`${row.teamId}:${row.name}`}
                className={[canTap ? "is-interactive" : "", selected ? "is-picked" : ""].filter(Boolean).join(" ")}
                onClick={canTap ? () => onTap?.(row.name) : undefined}
              >
                <th className="is-sticky">{number ? `${number} ${row.name}` : row.name}</th>
                <td>{player?.position ?? ""}</td>
                <td>{slot && slot !== "SUB" ? slot : slot === "SUB" ? "SUB" : player?.position ?? ""}</td>
                <td className="sub-cell">
                  <SubMarks mark={mark} />
                </td>
                {showAttributes ? (
                  <>
                    <td className={`ovr ${toneClass(overallDelta)}`}>{ratings?.overall ?? row.overall}</td>
                    {CHART_RATING_KEYS.map((key) => {
                      const delta = ratings && player ? ratings[key] - player.ratings[key] : 0;
                      return (
                        <td key={key} className={toneClass(delta)}>
                          {ratings?.[key] ?? "–"}
                        </td>
                      );
                    })}
                  </>
                ) : null}
                <td>{row.fitness}</td>
                <td>{row.rating}</td>
                <td>{row.minutes}</td>
                <td>{row.possessions}</td>
                <td>{formatPair(row.passesCompleted, row.passesAttempted)}</td>
                <td>{formatPair(row.scores, row.shots)}</td>
                <td>{formatPair(row.freesScored ?? 0, row.freesAttempted ?? 0)}</td>
                <td>{formatPair(row.sixtyFivesScored ?? 0, row.sixtyFivesAttempted ?? 0)}</td>
                <td>{row.freesConceded ?? 0}</td>
                <td>{formatPair(row.highFieldingWon, row.highFieldingAttempted)}</td>
                <td>{row.puckoutsWon}</td>
                <td>{formatPair(row.tacklesWon, row.tacklesAttempted)}</td>
                <td>{row.groundCovered}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
