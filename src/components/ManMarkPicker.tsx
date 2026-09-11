import type { RatedPlayer, Tactics, TeamSheet } from "../types";
import { ATTRIBUTE_SHORT } from "../lib/attributes";
import {
  isMarkTargetFor,
  lineLabelFor,
  markerRoleFor,
  poolNames,
  setManMark,
  willPushToHalfBack,
  type ManMarkPool,
} from "../lib/manMarking";

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
  /** Tactics: whole panel. Match: the fifteen actually selected. */
  pool?: ManMarkPool;
};

function findPlayer(xv: RatedPlayer[], name: string): RatedPlayer | undefined {
  return xv.find((item) => item.name === name);
}

function markerLabel(name: string, xv: RatedPlayer[], sheet: TeamSheet): string {
  const player = findPlayer(xv, name);
  const line = lineLabelFor(name, sheet, player);
  const marking = player?.ratings.manMarking;
  const markBit = typeof marking === "number" ? ` · ${ATTRIBUTE_SHORT.manMarking} ${marking}` : "";
  return `${name} (${line}${markBit})`;
}

function targetLabel(name: string, xv: RatedPlayer[], sheet: TeamSheet): string {
  const player = findPlayer(xv, name);
  const line = lineLabelFor(name, sheet, player);
  const overall = player?.ratings.overall;
  const ovrBit = typeof overall === "number" ? ` · Ovr ${overall}` : "";
  return `${name} (${line}${ovrBit})`;
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
  pool = "team",
}: Props) {
  const ourNames = poolNames(ourSheet, pool);
  const theirNames = poolNames(theirSheet, pool);
  const markers = ourNames.filter((name) => markerRoleFor(name, ourSheet, findPlayer(ourXv, name), pool));
  const marks = tactics.manMarks ?? {};
  const taken = new Set(Object.values(marks));

  if (markers.length === 0) return null;

  return (
    <section className={compact ? "card card--compact" : "card"}>
      <h3>Man marking</h3>
      <ul className="man-mark-list">
        {markers.map((name) => {
          const role = markerRoleFor(name, ourSheet, findPlayer(ourXv, name), pool);
          if (!role) return null;
          const selected = marks[name] ?? "";
          const targets = theirNames.filter((target) =>
            isMarkTargetFor(role, target, theirSheet, findPlayer(theirXv, target), pool),
          );
          if (targets.length === 0 && !selected) return null;
          const push = selected ? willPushToHalfBack(ourSheet.starters, theirSheet.starters, name, selected) : false;
          return (
            <li key={name}>
              <label className="taker-select">
                <span>{markerLabel(name, ourXv, ourSheet)}</span>
                <select
                  value={targets.includes(selected) ? selected : ""}
                  disabled={disabled}
                  onChange={(event) => onChange(setManMark(tactics, name, event.target.value || undefined))}
                  aria-label={`Man mark for ${name}`}
                >
                  <option value="">Positional marker</option>
                  {targets.map((target) => (
                    <option key={target} value={target} disabled={taken.has(target) && selected !== target}>
                      {targetLabel(target, theirXv, theirSheet)}
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
