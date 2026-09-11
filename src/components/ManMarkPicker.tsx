import type { RatedPlayer, Tactics, TeamSheet } from "../types";
import { ATTRIBUTE_SHORT } from "../lib/attributes";
import {
  isAttackerSlot,
  isMarkerSlot,
  setManMark,
  slotLineLabel,
  willPushToHalfBack,
} from "../lib/manMarking";
import { matchShirtNumber } from "../lib/players";

type Props = {
  tactics: Tactics;
  onChange: (tactics: Tactics) => void;
  ourSheet: TeamSheet;
  theirSheet: TeamSheet;
  ourXv: RatedPlayer[];
  theirXv: RatedPlayer[];
  ourName?: string;
  theirName?: string;
  compact?: boolean;
  disabled?: boolean;
};

function playerLine(name: string, xv: RatedPlayer[], sheet: TeamSheet): string {
  const player = xv.find((item) => item.name === name);
  const number = matchShirtNumber(sheet, name);
  const index = sheet.starters.indexOf(name);
  const line = index >= 0 ? slotLineLabel(index) : "Bench";
  const marking = player?.ratings.manMarking;
  const markBit = typeof marking === "number" ? ` · ${ATTRIBUTE_SHORT.manMarking} ${marking}` : "";
  return `${number}. ${name} (${line}${markBit})`;
}

export function ManMarkPicker({
  tactics,
  onChange,
  ourSheet,
  theirSheet,
  ourXv,
  theirXv,
  ourName = "Us",
  theirName = "Them",
  compact = false,
  disabled = false,
}: Props) {
  const markers = ourSheet.starters
    .map((name, index) => ({ name, index }))
    .filter((row) => isMarkerSlot(row.index));
  const attackers = theirSheet.starters
    .map((name, index) => ({ name, index }))
    .filter((row) => isAttackerSlot(row.index));
  if (markers.length === 0 || attackers.length === 0) return null;

  const marks = tactics.manMarks ?? {};
  const taken = new Set(Object.values(marks));

  return (
    <section className={compact ? "card card--compact" : "card"}>
      <h3>Man marking</h3>
      <p className="tactic-copy">
        Backs and midfielders can track a named attacker. Marking, pace, strength, workrate and hooking all go toward
        shutting him down. A full-back on a half-forward pushes onto the half-back line and a half-back drops.
      </p>
      <ul className="man-mark-list">
        {markers.map((row) => {
          const selected = marks[row.name] ?? "";
          const push = selected ? willPushToHalfBack(ourSheet.starters, theirSheet.starters, row.name, selected) : false;
          return (
            <li key={row.name}>
              <label className="taker-select">
                <span>{playerLine(row.name, ourXv, ourSheet)}</span>
                <select
                  value={selected}
                  disabled={disabled}
                  onChange={(event) => onChange(setManMark(tactics, row.name, event.target.value || undefined))}
                  aria-label={`Man mark for ${row.name}`}
                >
                  <option value="">Positional marker</option>
                  {attackers.map((attack) => (
                    <option
                      key={attack.name}
                      value={attack.name}
                      disabled={taken.has(attack.name) && selected !== attack.name}
                    >
                      {playerLine(attack.name, theirXv, theirSheet)}
                    </option>
                  ))}
                </select>
              </label>
              {push ? <em className="man-mark-note">Pushes onto the half-back line.</em> : null}
            </li>
          );
        })}
      </ul>
      <p className="hint hint--tight">
        {ourName} tracking {theirName}. Clear a row to leave him in his usual slot.
      </p>
    </section>
  );
}
