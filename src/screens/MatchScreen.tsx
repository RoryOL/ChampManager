import { useEffect, useMemo, useState } from "react";
import type { Championship, GameSave, Tactics, TeamSheet } from "../types";
import type { LiveMatch } from "../hooks/useGame";
import { TacticControls } from "../components/TacticControls";
import { compactName, sideLabel } from "../lib/display";
import { momentumAt, scoreFromEvents } from "../lib/matchEngine";
import { ratedSquad, swapPlayersInSheet } from "../lib/players";
import { conditionFor, matchRatings } from "../lib/training";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatScore } from "../lib/scoring";

const SPEEDS = [
  { id: "slow", label: "Slow", ms: 1100 },
  { id: "normal", label: "Normal", ms: 700 },
  { id: "fast", label: "Fast", ms: 280 },
] as const;

type Props = {
  championship: Championship;
  save: GameSave;
  live: LiveMatch;
  onAdvance: () => void;
  onSkip: () => void;
  onClose: () => void;
  onContinueSecond: (tactics: Tactics, sheet: TeamSheet) => void;
  onSkipRest: (tactics: Tactics, sheet: TeamSheet) => void;
};

export function MatchScreen({
  championship,
  save,
  live,
  onAdvance,
  onSkip,
  onClose,
  onContinueSecond,
  onSkipRest,
}: Props) {
  const { homeId, awayId } = resolveMatchSides(championship, live.match);
  const home = homeId ? teamById(championship, homeId) : undefined;
  const away = awayId ? teamById(championship, awayId) : undefined;
  const score = scoreFromEvents(live.user.events, homeId ?? "", live.cursor);
  const visible = live.user.events.slice(0, live.cursor).filter((event) => event.kind !== "full");
  const clock = visible.at(-1)?.minute ?? 0;
  const momentum = momentumAt(live.user.events, live.cursor);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["id"]>("slow");
  const [htTactics, setHtTactics] = useState<Tactics>(save.tactics);
  const [htSheet, setHtSheet] = useState<TeamSheet>(save.sheet);
  const [htPicked, setHtPicked] = useState<string | null>(null);
  const interval = SPEEDS.find((item) => item.id === speed)?.ms ?? 1100;
  const playing = live.phase === "first" || live.phase === "second";

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(onAdvance, interval);
    return () => window.clearInterval(timer);
  }, [interval, onAdvance, playing]);

  const squad = useMemo(() => ratedSquad(save.clubId), [save.clubId]);
  const byName = useMemo(() => new Map(squad.map((player) => [player.name, player])), [squad]);

  const tapHt = (name: string) => {
    if (!htPicked) {
      setHtPicked(name);
      return;
    }
    if (htPicked === name) {
      setHtPicked(null);
      return;
    }
    setHtSheet(swapPlayersInSheet(htSheet, htPicked, name));
    setHtPicked(null);
  };

  return (
    <div className="screen screen--match">
      <header className="match-bar">
        <span>{live.label}</span>
        <strong>{clock}&apos;</strong>
        <div className="speed-row">
          {SPEEDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={speed === item.id ? "is-active" : ""}
              onClick={() => setSpeed(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
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
      <div className="momentum" aria-label="Momentum">
        <span>{home ? compactName(home) : "Home"}</span>
        <div className="momentum-track">
          <i style={{ width: `${momentum}%` }} />
        </div>
        <span>{away ? compactName(away) : "Away"}</span>
      </div>
      {live.phase === "half-time" ? (
        <div className="ht-panel">
          <h3>Half-time</h3>
          <p className="hint">Change the dials or tap two names to make a substitution, then send them out again.</p>
          <TacticControls tactics={htTactics} onChange={setHtTactics} compact />
          <ul className="player-list ht-list">
            {[...htSheet.starters, ...htSheet.subs].map((name) => {
              const player = byName.get(name);
              if (!player) return null;
              const onField = htSheet.starters.includes(name);
              return (
                <li key={name}>
                  <button type="button" className={htPicked === name ? "is-picked" : ""} onClick={() => tapHt(name)}>
                    <b>{player.number}</b>
                    <span>
                      <strong>{player.name}</strong>
                      <em>
                        {player.position} · {onField ? "XV" : "Bench"}
                      </em>
                    </span>
                    <i>
                      {matchRatings(player, conditionFor(player.name, save.condition)).overall}
                    </i>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <ol className="commentary">
          {visible
            .slice(-10)
            .reverse()
            .map((event, index) => (
              <li key={`${event.minute}-${event.kind}-${index}`}>
                <span>{event.minute}&apos;</span>
                {event.text}
              </li>
            ))}
        </ol>
      )}
      <div className="match-actions">
        {live.phase === "finished" ? (
          <button type="button" className="btn" onClick={onClose}>
            Continue
          </button>
        ) : live.phase === "half-time" ? (
          <>
            <button type="button" className="btn" onClick={() => onContinueSecond(htTactics, htSheet)}>
              Second half
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onSkipRest(htTactics, htSheet)}>
              Skip to full-time
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            {live.phase === "first" ? "Skip to half-time" : "Skip to result"}
          </button>
        )}
      </div>
    </div>
  );
}
