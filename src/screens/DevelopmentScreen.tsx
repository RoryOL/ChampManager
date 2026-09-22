import { useMemo, useState } from "react";
import type { GameSave } from "../types";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_SHORT,
  LINE_LABELS,
  type AttributeKey,
} from "../lib/attributes";
import { changedStats, developmentRows, type PlayerArc } from "../lib/developmentLog";
import { toneClass } from "../lib/training";

type SortId = "rise" | "fall" | "name";

type Props = {
  save: GameSave;
  playerName: string | null;
  onBack: () => void;
  onSelect: (name: string | null) => void;
};

const SORTS: { id: SortId; label: string }[] = [
  { id: "rise", label: "Biggest rise" },
  { id: "fall", label: "Biggest fall" },
  { id: "name", label: "Name" },
];

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "";
}

function mark(delta: number): string {
  return formatDelta(delta) || "·";
}

function movedLine(arc: PlayerArc): string {
  const moved = changedStats(arc);
  if (moved.length === 0) return "No change on the card";
  return moved
    .slice(0, 4)
    .map((stat) => `${ATTRIBUTE_SHORT[stat.key]} ${formatDelta(stat.delta)}`)
    .join(" · ");
}

function ageLabel(arc: PlayerArc): string {
  return arc.start.age === arc.current.age ? `${arc.current.age}` : `${arc.start.age}→${arc.current.age}`;
}

export function DevelopmentScreen({ save, playerName, onBack, onSelect }: Props) {
  const [sort, setSort] = useState<SortId>("rise");
  const rows = useMemo(() => {
    const list = developmentRows(save);
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "fall") sorted.sort((a, b) => a.overallDelta - b.overallDelta || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.overallDelta - a.overallDelta || b.current.overall - a.current.overall || a.name.localeCompare(b.name));
    return sorted;
  }, [save, sort]);
  const selected = playerName ? rows.find((row) => row.name === playerName) : undefined;
  const anyMove = rows.some((row) => row.overallDelta !== 0 || changedStats(row).length > 0);

  return (
    <div className="screen">
      <button type="button" className="text-btn text-btn--back" onClick={onBack}>
        Back to squad
      </button>
      {selected ? (
        <PlayerTimeline arc={selected} onAll={() => onSelect(null)} />
      ) : (
        <>
          <p className="kicker">Your club</p>
          <h2>Development</h2>
          <p className="hint">
            Natural ratings since each player was first on the panel. The card moves between seasons. Green and red on
            the squad list are this year's training, and only a share of that work is kept here over the winter.
            {!anyMove ? " Nothing has moved yet." : ""}
          </p>
          <div className="template-row" role="group" aria-label="Sort players">
            {SORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={sort === item.id ? "is-active" : ""}
                onClick={() => setSort(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="squad-table-wrap">
            <table className="squad-table dev-table">
              <thead>
                <tr>
                  <th className="name">Player</th>
                  <th>Pos</th>
                  <th>Age</th>
                  <th className="ovr">Ovr</th>
                  {ATTRIBUTE_GROUPS.flatMap((group) =>
                    group.keys.map((key) => (
                      <th key={key} title={ATTRIBUTE_LABELS[key]}>
                        {ATTRIBUTE_SHORT[key]}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((arc) => (
                  <tr key={arc.name} onClick={() => onSelect(arc.name)}>
                    <td className="name">
                      <strong>{arc.name}</strong>
                      <em>
                        {arc.joined ? `Joined ${arc.start.year} · ` : ""}
                        {movedLine(arc)}
                      </em>
                    </td>
                    <td>{arc.position}</td>
                    <td>{ageLabel(arc)}</td>
                    <td className={`ovr ${toneClass(arc.overallDelta)}`}>
                      <span className="dev-ovr">
                        {arc.current.overall}
                        <small>{mark(arc.overallDelta)}</small>
                      </span>
                    </td>
                    {arc.stats.map((stat) => (
                      <td key={stat.key} className={toneClass(stat.delta)} title={`${stat.start} to ${stat.now}`}>
                        {mark(stat.delta)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint hint--tight">Tap a player for every season on his card.</p>
        </>
      )}
    </div>
  );
}

function PlayerTimeline({ arc, onAll }: { arc: PlayerArc; onAll: () => void }) {
  const moved = changedStats(arc);
  const seasons = arc.history.length;
  return (
    <>
      <button type="button" className="text-btn text-btn--back" onClick={onAll}>
        All players
      </button>
      <p className="kicker">{LINE_LABELS[arc.position]}</p>
      <h2>{arc.name}</h2>
      <p className="hint">
        {arc.joined ? `Came onto the panel in ${arc.start.year}. ` : `First recorded in ${arc.start.year}. `}
        {seasons === 1
          ? "One season on the card so far. Attributes move after the championship."
          : `${seasons} seasons, from age ${arc.start.age} to ${arc.current.age}. Overall ${arc.start.overall} to ${arc.current.overall}${arc.overallDelta !== 0 ? ` (${formatDelta(arc.overallDelta)})` : ""}.`}
        {moved.length > 0
          ? ` ${moved.map((stat) => `${ATTRIBUTE_LABELS[stat.key].toLowerCase()} ${formatDelta(stat.delta)}`).join(", ")}.`
          : " No attribute has changed since that first card."}
      </p>
      <div className="squad-table-wrap squad-table-wrap--page">
        <table className="squad-table dev-table">
          <thead>
            <tr>
              <th className="name">Attribute</th>
              {arc.history.map((snap) => (
                <th key={snap.year}>{snap.year}</th>
              ))}
              <th>Since {arc.start.year}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="name">Age</td>
              {arc.history.map((snap) => (
                <td key={snap.year}>{snap.age}</td>
              ))}
              <td>{mark(arc.current.age - arc.start.age)}</td>
            </tr>
            <tr>
              <td className="name">Overall</td>
              {arc.history.map((snap, index) => {
                const previous = index > 0 ? arc.history[index - 1] : undefined;
                const step = previous ? snap.overall - previous.overall : 0;
                return (
                  <td key={snap.year} className={`ovr ${toneClass(step)}`}>
                    {snap.overall}
                  </td>
                );
              })}
              <td className={`ovr ${toneClass(arc.overallDelta)}`}>{mark(arc.overallDelta)}</td>
            </tr>
            {ATTRIBUTE_GROUPS.flatMap((group) => [
              <tr key={group.id} className="dev-group">
                <td className="name" colSpan={arc.history.length + 2}>
                  {group.label}
                </td>
              </tr>,
              ...group.keys.map((key) => <StatRow key={key} arc={arc} stat={key} />),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatRow({ arc, stat }: { arc: PlayerArc; stat: AttributeKey }) {
  const change = arc.stats.find((item) => item.key === stat);
  const delta = change?.delta ?? 0;
  return (
    <tr>
      <td className="name">{ATTRIBUTE_LABELS[stat]}</td>
      {arc.history.map((snap, index) => {
        const previous = index > 0 ? arc.history[index - 1] : undefined;
        const step = previous ? snap.ratings[stat] - previous.ratings[stat] : 0;
        return (
          <td key={snap.year} className={toneClass(step)}>
            {snap.ratings[stat]}
          </td>
        );
      })}
      <td className={toneClass(delta)}>{mark(delta)}</td>
    </tr>
  );
}
