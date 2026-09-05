import { useEffect } from "react";
import type { Championship } from "../types";
import type { LiveMatch } from "../hooks/useGame";
import { compactName, sideLabel } from "../lib/display";
import { scoreFromEvents } from "../lib/matchEngine";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatScore } from "../lib/scoring";

type Props = {
  championship: Championship;
  live: LiveMatch;
  onAdvance: () => void;
  onSkip: () => void;
  onClose: () => void;
};

export function MatchScreen({ championship, live, onAdvance, onSkip, onClose }: Props) {
  const { homeId, awayId } = resolveMatchSides(championship, live.match);
  const home = homeId ? teamById(championship, homeId) : undefined;
  const away = awayId ? teamById(championship, awayId) : undefined;
  const score = scoreFromEvents(live.user.events, homeId ?? "", live.cursor);
  const visible = live.user.events.slice(0, live.cursor).filter((event) => event.kind !== "full");
  const clock = visible.at(-1)?.minute ?? 0;

  useEffect(() => {
    if (live.finished) return;
    const timer = window.setInterval(onAdvance, 150);
    return () => window.clearInterval(timer);
  }, [live.finished, onAdvance]);

  return (
    <div className="screen screen--match">
      <header className="match-bar">
        <span>{live.label}</span>
        <strong>{clock}&apos;</strong>
      </header>
      <section className="scoreboard">
        <div>
          <em>{home ? compactName(home) : sideLabel(championship, live.match.home)}</em>
          <b>{formatScore(score.home)}</b>
        </div>
        <div>
          <em>{away ? compactName(away) : sideLabel(championship, live.match.away)}</em>
          <b>{formatScore(score.away)}</b>
        </div>
      </section>
      <ol className="commentary">
        {visible
          .slice(-12)
          .reverse()
          .map((event, index) => (
            <li key={`${event.minute}-${index}`}>
              <span>{event.minute}&apos;</span>
              {event.text}
            </li>
          ))}
      </ol>
      <div className="match-actions">
        {live.finished ? (
          <button type="button" className="btn" onClick={onClose}>
            Continue
          </button>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            Skip to result
          </button>
        )}
      </div>
    </div>
  );
}
