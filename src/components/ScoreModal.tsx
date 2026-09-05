import { type FormEvent, useEffect, useState } from "react";
import type { Championship, Match, Score } from "../types";
import { formatScoreWithTotal, isValidScore, scoreTotal, stageLabel } from "../lib/scoring";
import { matchTitle } from "../lib/display";
import { resolveMatchSides, teamById } from "../lib/resolve";

type Props = {
  championship: Championship;
  match: Match;
  onClose: () => void;
  onSave: (homeScore: Score | null, awayScore: Score | null) => void;
};

function toFields(score: Score | null): { goals: string; points: string } {
  return {
    goals: score ? String(score.goals) : "",
    points: score ? String(score.points) : "",
  };
}

function parseScore(goals: string, points: string): Score | null {
  if (goals === "" && points === "") return null;
  const parsed: Score = {
    goals: Number(goals),
    points: Number(points),
  };
  return isValidScore(parsed) ? parsed : null;
}

export function ScoreModal({ championship, match, onClose, onSave }: Props) {
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const homeTeam = homeId ? teamById(championship, homeId) : undefined;
  const awayTeam = awayId ? teamById(championship, awayId) : undefined;
  const [home, setHome] = useState(toFields(match.homeScore));
  const [away, setAway] = useState(toFields(match.awayScore));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const homeScore = parseScore(home.goals, home.points);
  const awayScore = parseScore(away.goals, away.points);
  const complete = homeScore !== null && awayScore !== null;
  const sidesReady = Boolean(homeId && awayId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!complete) return;
    onSave(homeScore, awayScore);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">{stageLabel(match.stage, match.round)}</p>
        <h2 id="score-modal-title">{matchTitle(championship, match)}</h2>
        <p className="modal__meta">
          {match.venue ?? "Venue TBC"}
          {match.time ? ` · ${match.time}` : ""}
        </p>

        {!sidesReady && (
          <p className="notice">Both sides still depend on earlier results. Record those first.</p>
        )}

        <form onSubmit={handleSubmit} className="score-form">
          <ScoreFields
            label={homeTeam?.name ?? "Home"}
            colour={homeTeam?.colours.primary}
            value={home}
            onChange={setHome}
            parsed={homeScore}
          />
          <ScoreFields
            label={awayTeam?.name ?? "Away"}
            colour={awayTeam?.colours.primary}
            value={away}
            onChange={setAway}
            parsed={awayScore}
          />

          {complete && (
            <p className="score-form__preview">
              {homeTeam?.name} {formatScoreWithTotal(homeScore)} — {formatScoreWithTotal(awayScore)}{" "}
              {awayTeam?.name}
              <span>
                {" "}
                · totals {scoreTotal(homeScore)}–{scoreTotal(awayScore)}
              </span>
            </p>
          )}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onSave(null, null)}
            >
              Clear result
            </button>
            <button type="submit" className="btn" disabled={!complete || !sidesReady}>
              Save result
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScoreFields({
  label,
  colour,
  value,
  onChange,
  parsed,
}: {
  label: string;
  colour?: string;
  value: { goals: string; points: string };
  onChange: (next: { goals: string; points: string }) => void;
  parsed: Score | null;
}) {
  return (
    <fieldset className="score-fields">
      <legend>
        <span className="swatch" style={{ background: colour }} />
        {label}
      </legend>
      <label>
        Goals
        <input
          inputMode="numeric"
          min={0}
          value={value.goals}
          onChange={(event) => onChange({ ...value, goals: event.target.value })}
        />
      </label>
      <label>
        Points
        <input
          inputMode="numeric"
          min={0}
          value={value.points}
          onChange={(event) => onChange({ ...value, points: event.target.value })}
        />
      </label>
      <p className="score-fields__total">
        {parsed ? formatScoreWithTotal(parsed) : "–"}
      </p>
    </fieldset>
  );
}
