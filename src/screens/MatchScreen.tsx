import { useEffect, useMemo, useState } from "react";
import type { Championship, GameSave, Tactics, TeamSheet } from "../types";
import type { LiveMatch } from "../hooks/useGame";
import { ClubBadge } from "../components/ClubBadge";
import { MatchStatsPanel } from "../components/MatchStatsPanel";
import { TacticControls } from "../components/TacticControls";
import { compactName, sideLabel, teamAccent } from "../lib/display";
import { commentaryFeed, isScoreKind, momentumAt, scoreFromEvents } from "../lib/matchEngine";
import { KeyEventsBar } from "../components/KeyEventsBar";
import { ShotMap } from "../components/ShotMap";
import { WeatherBanner } from "../components/WeatherBanner";
import { liveStats } from "../lib/matchStats";
import { ratedSquad, sheetPlayers, swapPlayersInSheet } from "../lib/players";
import { injuredNamesFromEvents, isInjured, sitInjuredPlayers } from "../lib/injuries";
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
  waitingOn?: { name: string; clubId: string }[];
  onPassDevice?: (playerId: string) => void;
  passSeats?: { playerId: string; name: string }[];
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
  waitingOn = [],
  onPassDevice,
  passSeats = [],
}: Props) {
  const { homeId, awayId } = resolveMatchSides(championship, live.match);
  const home = homeId ? teamById(championship, homeId) : undefined;
  const away = awayId ? teamById(championship, awayId) : undefined;
  const score = scoreFromEvents(live.user.events, homeId ?? "", live.cursor);
  const visible = live.user.events.slice(0, live.cursor).filter((event) => event.kind !== "full");
  const clock = visible.at(-1)?.minute ?? 0;
  const momentum = momentumAt(live.user.events, live.cursor);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["id"]>("slow");
  const [pane, setPane] = useState<"call" | "stats">("call");
  const [htTactics, setHtTactics] = useState<Tactics>(save.tactics);
  const [htSheet, setHtSheet] = useState<TeamSheet>(live.openingSheet);
  const [htPicked, setHtPicked] = useState<string | null>(null);
  const interval = SPEEDS.find((item) => item.id === speed)?.ms ?? 1100;
  const playing = live.phase === "first" || live.phase === "second";

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(onAdvance, interval);
    return () => window.clearInterval(timer);
  }, [interval, onAdvance, playing]);

  useEffect(() => {
    if (live.phase === "finished") setPane("stats");
  }, [live.phase]);

  const squad = useMemo(() => ratedSquad(save.clubId), [save.clubId]);
  const byName = useMemo(() => new Map(squad.map((player) => [player.name, player])), [squad]);
  const homeSquad = useMemo(() => (homeId ? ratedSquad(homeId) : []), [homeId]);
  const awaySquad = useMemo(() => (awayId ? ratedSquad(awayId) : []), [awayId]);
  const htXv = useMemo(() => sheetPlayers(save.clubId, htSheet), [htSheet, save.clubId]);

  useEffect(() => {
    if (live.phase !== "half-time") return;
    const hurt = injuredNamesFromEvents(live.user.events.slice(0, live.cursor), save.clubId);
    if (hurt.length === 0) return;
    setHtSheet((current) => sitInjuredPlayers(current, squad, save.condition, hurt));
  }, [live.cursor, live.phase, live.user.events, save.clubId, save.condition, squad]);
  const chart = liveStats(live.user, Math.max(live.cursor, 1), {
    home: homeId === save.clubId ? save.condition : undefined,
    away: awayId === save.clubId ? save.condition : undefined,
  });
  const statsPanel = homeId && awayId ? (
    <MatchStatsPanel
      homeName={home ? compactName(home) : "Home"}
      awayName={away ? compactName(away) : "Away"}
      homeId={homeId}
      awayId={awayId}
      homeStats={chart.homeStats}
      awayStats={chart.awayStats}
      players={chart.players}
      homeSquad={homeSquad}
      awaySquad={awaySquad}
      homeCondition={homeId === save.clubId ? save.condition : undefined}
      awayCondition={awayId === save.clubId ? save.condition : undefined}
      compact={live.phase !== "finished"}
    />
  ) : null;

  const homeAccent = teamAccent(home);
  const awayAccent = teamAccent(away);
  const teamFor = (teamId: string) => (teamId === homeId ? home : teamId === awayId ? away : undefined);
  const eventClass = (kind: string) => {
    if (kind === "goal") return "is-goal";
    if (kind === "point" || kind === "free" || kind === "sixtyFive" || kind === "sideline") return "is-score";
    if (kind === "red") return "is-card is-red";
    if (kind === "booking") return "is-card is-yellow";
    if (kind === "coach" || kind === "half") return "is-coach";
    if (kind === "injury") return "is-injury";
    return "is-play";
  };

  const tapHt = (name: string) => {
    if (!htPicked) {
      setHtPicked(name);
      return;
    }
    if (htPicked === name) {
      setHtPicked(null);
      return;
    }
    const inSheet = (player: string) => htSheet.starters.includes(player) || htSheet.subs.includes(player);
    if ((isInjured(save.condition[name]) && !inSheet(name)) || (isInjured(save.condition[htPicked]) && !inSheet(htPicked))) {
      setHtPicked(name);
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
          <span className="scoreboard-club">
            <ClubBadge team={home} size="md" variant="colours" />
            <em style={{ color: homeAccent.ink }}>
              {home ? compactName(home) : sideLabel(championship, live.match.home)}
            </em>
          </span>
          <b>{formatScore(score.home)}</b>
        </div>
        <div>
          <span className="scoreboard-club">
            <ClubBadge team={away} size="md" variant="colours" />
            <em style={{ color: awayAccent.ink }}>
              {away ? compactName(away) : sideLabel(championship, live.match.away)}
            </em>
          </span>
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
      <KeyEventsBar
        events={visible}
        homeId={homeId}
        awayId={awayId}
        home={home}
        away={away}
      />
      {live.user.climate ? (
        <WeatherBanner
          climate={live.user.climate}
          period={live.phase === "second" ? "second" : live.phase === "first" || live.phase === "half-time" ? "first" : undefined}
        />
      ) : null}
      <p className="live-strip">
        Poss {chart.homeStats.possessions}-{chart.awayStats.possessions} · Shots {chart.homeStats.scores}/{chart.homeStats.shots}-{chart.awayStats.scores}/{chart.awayStats.shots} · Puck-outs {chart.homeStats.puckoutsWon}-{chart.awayStats.puckoutsWon} · Tackles {chart.homeStats.tacklesWon}-{chart.awayStats.tacklesWon}
      </p>
      {live.phase !== "half-time" && live.phase !== "half-wait" ? (
        <div className="speed-row pane-row">
          <button type="button" className={pane === "call" ? "is-active" : ""} onClick={() => setPane("call")}>
            Commentary
          </button>
          <button type="button" className={pane === "stats" ? "is-active" : ""} onClick={() => setPane("stats")}>
            Stats
          </button>
        </div>
      ) : null}
      {live.phase === "half-wait" ? (
        <div className="ht-panel">
          <h3>Waiting on second-half tactics</h3>
          <p className="hint">
            Your half-time changes are in. The second half starts when{" "}
            {waitingOn.map((seat) => seat.name).join(" and ") || "the other manager"} confirms theirs.
          </p>
          {passSeats.length > 0 && onPassDevice ? (
            <div className="row-actions">
              {passSeats.map((seat) => (
                <button key={seat.playerId} type="button" className="btn" onClick={() => onPassDevice(seat.playerId)}>
                  Pass to {seat.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="tactic-copy">Keep the app open or come back after the wait window.</p>
          )}
        </div>
      ) : live.phase === "half-time" ? (
        <div className="ht-panel">
          <h3>Half-time</h3>
          <p className="hint">Ratings and live stats for both panels. Change dials or takers, tap two names to sub, then send them out.</p>
          {statsPanel}
          <TacticControls tactics={htTactics} onChange={setHtTactics} compact xv={htXv} />
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
      ) : pane === "stats" ? (
        <div className="ht-panel">
          {live.phase === "finished" && live.user.coachReport.length > 0 ? (
            <section className="card">
              <h3>Coach report</h3>
              {live.user.coachReport.map((note) => (
                <p key={note} className="tactic-copy">
                  {note}
                </p>
              ))}
            </section>
          ) : null}
          {live.phase === "finished" && live.user.shots.length > 0 ? (
            <ShotMap
              shots={live.user.shots}
              home={home}
              away={away}
              homeId={homeId ?? ""}
              awayId={awayId ?? ""}
              climate={live.user.climate}
            />
          ) : null}
          {statsPanel}
        </div>
      ) : (
        <ol className="commentary">
          {commentaryFeed(visible).map((event, index) => {
              const accent = teamAccent(teamFor(event.teamId));
              return (
                <li
                  key={`${event.minute}-${event.kind}-${index}`}
                  className={`commentary__item ${eventClass(event.kind)}`}
                  style={{
                    ["--team" as string]: accent.stripe,
                    ["--team-ink" as string]: accent.ink,
                    ["--team-wash" as string]: accent.wash,
                    borderLeftColor: accent.stripe,
                    color: accent.ink,
                    background: isScoreKind(event.kind) ? accent.wash : undefined,
                  }}
                >
                  <span>{event.minute}&apos;</span>
                  {event.text}
                </li>
              );
            })}
        </ol>
      )}
      <div className="match-actions">
        {live.phase === "finished" ? (
          <button type="button" className="btn" onClick={onClose}>
            Continue
          </button>
        ) : live.phase === "half-wait" ? (
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Back to the week
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
