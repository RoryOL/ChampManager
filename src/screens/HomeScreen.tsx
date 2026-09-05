import type { Championship, GameSave, Match } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { compactName, sideLabel } from "../lib/display";
import { resolveMatchSides, teamById, teamGroup } from "../lib/resolve";
import { formatDate, stageLabel } from "../lib/scoring";

type Props = {
  championship: Championship;
  save: GameSave;
  nextMatch: Match | null;
  batchLabel: string | null;
  onGoToMatch: () => void;
  onSkip: () => void;
  onResign: () => void;
};

export function HomeScreen({
  championship,
  save,
  nextMatch,
  batchLabel,
  onGoToMatch,
  onSkip,
  onResign,
}: Props) {
  const club = teamById(championship, save.clubId);
  const group = teamGroup(championship, save.clubId);
  const sides = nextMatch ? resolveMatchSides(championship, nextMatch) : null;

  return (
    <div className="screen">
      <section className="club-banner">
        <ClubBadge team={club} size="md" />
        <div>
          <p>{group?.name}</p>
          <h1>{club ? compactName(club) : "Club"}</h1>
        </div>
        <button type="button" className="text-btn" onClick={onResign}>
          Resign
        </button>
      </section>

      <section className="card next-card">
        <p className="kicker">{batchLabel ?? "Championship complete"}</p>
        {nextMatch && sides ? (
          <>
            <h2>
              {sideLabel(championship, nextMatch.home)}
              <small>v</small>
              {sideLabel(championship, nextMatch.away)}
            </h2>
            <p>
              {stageLabel(nextMatch.stage, nextMatch.round)} · {formatDate(nextMatch.date)}
              {nextMatch.venue ? ` · ${nextMatch.venue}` : ""}
            </p>
            <div className="row-actions">
              <button type="button" className="btn" onClick={onGoToMatch}>
                Go to match
              </button>
              <button type="button" className="btn btn--ghost" onClick={onSkip}>
                Instant result
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{batchLabel ? "Results to come in" : "Season over"}</h2>
            <p>
              {batchLabel
                ? "You are not in this round. Simulate the remaining ties to keep the championship moving."
                : "Every championship match has been played."}
            </p>
            {batchLabel && (
              <button type="button" className="btn" onClick={onSkip}>
                Simulate {batchLabel}
              </button>
            )}
          </>
        )}
      </section>

      <section>
        <h3 className="list-title">Inbox</h3>
        <ul className="inbox">
          {save.inbox.length === 0 ? (
            <li className="empty">Set your team, then go to the first match.</li>
          ) : (
            save.inbox.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
