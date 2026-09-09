import { useEffect, useMemo, useState } from "react";
import type { Championship, GameSave, Tactics, TeamSheet } from "../types";
import type { LiveMatch } from "../hooks/useGame";
import { ClubBadge } from "../components/ClubBadge";
import { MatchStatsPanel } from "../components/MatchStatsPanel";
import { TacticControls } from "../components/TacticControls";
import { ManMarkPicker } from "../components/ManMarkPicker";
import { compactName, sideLabel, teamAccent } from "../lib/display";
import { commentaryFeed, isScoreKind, momentumAt, scoreFromEvents } from "../lib/matchEngine";
import { KeyEventsBar } from "../components/KeyEventsBar";
import { ShotMap } from "../components/ShotMap";
import { WeatherBanner } from "../components/WeatherBanner";
import { formatWonLost, liveStats } from "../lib/matchStats";
import { ratedSquad, sheetPlayers, swapPlayersInSheet } from "../lib/players";
import { closingSheetOf, injuredNamesFromEvents, isInjured } from "../lib/injuries";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatScore } from "../lib/scoring";
import { SwapConfirmBar, nextSwapPick } from "../components/SwapConfirmBar";
import { MATCH_SUB_LIMIT, isSubstitutionSwap, remainingMatchSubs } from "../lib/subs";

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
  onSetTactics?: (tactics: Tactics) => void;
  onStartThrowIn?: () => void;
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
  onSetTactics,
  onStartThrowIn,
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
  const [htSheet, setHtSheet] = useState<TeamSheet>(() => closingSheetOf(live.user, save.clubId));
  const [htFirst, setHtFirst] = useState<string | null>(null);
  const [htSecond, setHtSecond] = useState<string | null>(null);
  const interval = SPEEDS.find((item) => item.id === speed)?.ms ?? 1100;
  const playing = live.phase === "first" || live.phase === "second" || live.phase === "et1" || live.phase === "et2";
  const atThrowIn = live.phase === "throw-in";

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(onAdvance, interval);
    return () => window.clearInterval(timer);
  }, [interval, onAdvance, playing]);

  useEffect(() => {
    if (live.phase === "finished") setPane("stats");
  }, [live.phase]);

  const homeSquad = useMemo(() => (homeId ? ratedSquad(homeId, save) : []), [homeId, save]);
  const awaySquad = useMemo(() => (awayId ? ratedSquad(awayId, save) : []), [awayId, save]);
  const htXv = useMemo(() => sheetPlayers(save.clubId, htSheet, save), [htSheet, save.clubId, save]);

  useEffect(() => {
    if (live.phase !== "half-time" && live.phase !== "extra-time" && live.phase !== "extra-half") return;
    setHtSheet(closingSheetOf(live.user, save.clubId));
    setHtFirst(null);
    setHtSecond(null);
  }, [live.phase, save.clubId, live.user.matchId]);
  const chart = liveStats(live.user, Math.max(live.cursor, 1), {
    home: homeId === save.clubId ? save.condition : undefined,
    away: awayId === save.clubId ? save.condition : undefined,
  });
  const atHalfTime = live.phase === "half-time" || live.phase === "extra-time" || live.phase === "extra-half";
  const ourThrowInSheet = save.clubId === homeId ? live.user.homeSheet : live.user.awaySheet;
  const theirThrowInSheet = save.clubId === homeId ? live.user.awaySheet : live.user.homeSheet;
  const ourThrowInXv = save.clubId === homeId ? homeSquad : awaySquad;
  const theirThrowInXv = save.clubId === homeId ? awaySquad : homeSquad;
  const theirHtSheet =
    save.clubId === homeId
      ? (live.user.awayClosingSheet ?? live.user.awaySheet)
      : (live.user.homeClosingSheet ?? live.user.homeSheet);
  const theirHtXv = save.clubId === homeId ? awaySquad : homeSquad;
  const remainingSubs = remainingMatchSubs(
    live.user.events.slice(0, live.cursor),
    save.clubId,
    live.openingSheet,
    htSheet,
  );

  const tapHt = (name: string) => {
    const onSheet = htSheet.starters.includes(name) || htSheet.subs.includes(name);
    if (!onSheet) return;
    const next = nextSwapPick(htFirst, htSecond, name);
    setHtFirst(next.first);
    setHtSecond(next.second);
  };

  const confirmHtSwap = () => {
    if (!htFirst || !htSecond) return;
    const inSheet = (player: string) => htSheet.starters.includes(player) || htSheet.subs.includes(player);
    if (!inSheet(htFirst) || !inSheet(htSecond)) return;
    const hurt = new Set(injuredNamesFromEvents(live.user.events.slice(0, live.cursor), save.clubId));
    if (
      hurt.has(htFirst) ||
      hurt.has(htSecond) ||
      isInjured(save.condition[htFirst]) ||
      isInjured(save.condition[htSecond])
    ) {
      return;
    }
    if (isSubstitutionSwap(htSheet, htFirst, htSecond) && remainingSubs <= 0) return;
    setHtSheet(swapPlayersInSheet(htSheet, htFirst, htSecond));
    setHtFirst(null);
    setHtSecond(null);
  };

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
      homeSheet={
        homeId === save.clubId && atHalfTime
          ? htSheet
          : live.phase === "finished"
            ? (live.user.homeClosingSheet ?? live.user.homeSheet)
            : live.user.homeSheet
      }
      awaySheet={
        awayId === save.clubId && atHalfTime
          ? htSheet
          : live.phase === "finished"
            ? (live.user.awayClosingSheet ?? live.user.awaySheet)
            : live.user.awaySheet
      }
      numberHomeSheet={live.openingHomeSheet}
      numberAwaySheet={live.openingAwaySheet}
      events={live.user.events.slice(0, live.cursor)}
      compact={live.phase !== "finished" && !atHalfTime}
      interactive={atHalfTime}
      picked={[htFirst, htSecond].filter((name): name is string => Boolean(name))}
      onTapPlayer={atHalfTime ? tapHt : undefined}
      pickerClubId={atHalfTime ? save.clubId : undefined}
      toolbar={
        atHalfTime ? (
          <SwapConfirmBar
            first={htFirst}
            second={htSecond}
            onSwap={confirmHtSwap}
            disabled={Boolean(htFirst && htSecond && isSubstitutionSwap(htSheet, htFirst, htSecond) && remainingSubs <= 0)}
            onClear={() => {
              setHtFirst(null);
              setHtSecond(null);
            }}
            hint={
              remainingSubs <= 0
                ? "No substitutions left — you can still shuffle the fifteen."
                : "Pick two names below, then Swap."
            }
          />
        ) : undefined
      }
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
    if (kind === "injury" || kind === "sub") return "is-injury";
    return "is-play";
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
      {!atThrowIn ? (
        <>
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
        </>
      ) : null}
      {live.user.climate ? (
        <WeatherBanner
          climate={live.user.climate}
          period={
            live.phase === "second" || live.phase === "et2" || live.phase === "extra-half"
              ? "second"
              : live.phase === "first" ||
                  live.phase === "half-time" ||
                  live.phase === "et1" ||
                  live.phase === "extra-time"
                ? "first"
                : undefined
          }
        />
      ) : null}
      {!atThrowIn ? (
        <p className="live-strip">
          Poss {chart.homeStats.possessions}-{chart.awayStats.possessions} · Shots {chart.homeStats.scores}/{chart.homeStats.shots}-{chart.awayStats.scores}/{chart.awayStats.shots} · Puck-outs {formatWonLost(chart.homeStats.puckoutsWon, chart.homeStats.puckoutsAttempted ?? 0)} / {formatWonLost(chart.awayStats.puckoutsWon, chart.awayStats.puckoutsAttempted ?? 0)} · Tackles {chart.homeStats.tacklesWon}-{chart.awayStats.tacklesWon}
        </p>
      ) : null}
      {live.phase !== "half-time" &&
      live.phase !== "half-wait" &&
      live.phase !== "extra-time" &&
      live.phase !== "extra-half" &&
      !atThrowIn ? (
        <div className="speed-row pane-row">
          <button type="button" className={pane === "call" ? "is-active" : ""} onClick={() => setPane("call")}>
            Commentary
          </button>
          <button type="button" className={pane === "stats" ? "is-active" : ""} onClick={() => setPane("stats")}>
            Stats
          </button>
        </div>
      ) : null}
      {atThrowIn ? (
        <div className="ht-panel">
          <h3>Before throw-in</h3>
          <p className="hint">
            The fifteen is locked. You can still change tactics and man marking, then throw in. Shirt numbers stay as
            selected.
          </p>
          {onSetTactics ? (
            <>
              <TacticControls tactics={save.tactics} onChange={onSetTactics} compact xv={ourThrowInXv} />
              <ManMarkPicker
                tactics={save.tactics}
                onChange={onSetTactics}
                ourSheet={ourThrowInSheet}
                theirSheet={theirThrowInSheet}
                ourXv={ourThrowInXv}
                theirXv={theirThrowInXv}
                ourName={save.clubId === homeId ? (home ? compactName(home) : "Home") : away ? compactName(away) : "Away"}
                theirName={save.clubId === homeId ? (away ? compactName(away) : "Away") : home ? compactName(home) : "Home"}
                compact
              />
            </>
          ) : null}
        </div>
      ) : live.phase === "half-wait" ? (
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
      ) : live.phase === "half-time" || live.phase === "extra-time" || live.phase === "extra-half" ? (
        <div className="ht-panel">
          <h3>
            {live.phase === "extra-time"
              ? "Extra time"
              : live.phase === "extra-half"
                ? "Half-time in extra time"
                : "Half-time"}
          </h3>
          <p className="hint">
            {live.phase === "extra-time"
              ? "The sides are level. Two periods of ten minutes. Pick two names in your grid and tap Swap beside it."
              : live.phase === "extra-half"
                ? "Change ends for the second extra period. Pick two names in your grid and tap Swap beside it."
                : "Pick two names in your grid and tap Swap beside it. Shirt numbers stay from the throw-in — a 16 stays 16 if he comes on."}{" "}
            You have {remainingSubs} of {MATCH_SUB_LIMIT} substitutions left.
          </p>
          {statsPanel}
          <TacticControls tactics={htTactics} onChange={setHtTactics} compact xv={htXv} />
          <ManMarkPicker
            tactics={htTactics}
            onChange={setHtTactics}
            ourSheet={htSheet}
            theirSheet={theirHtSheet}
            ourXv={htXv}
            theirXv={theirHtXv}
            compact
          />
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
        ) : atThrowIn ? (
          <>
            <button type="button" className="btn" onClick={() => onStartThrowIn?.()}>
              Throw in
            </button>
            <button type="button" className="btn btn--ghost" onClick={onSkip}>
              Instant result
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Back
            </button>
          </>
        ) : live.phase === "half-wait" ? (
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Back to the week
          </button>
        ) : live.phase === "half-time" || live.phase === "extra-time" || live.phase === "extra-half" ? (
          <>
            <button type="button" className="btn" onClick={() => onContinueSecond(htTactics, htSheet)}>
              {live.phase === "extra-time"
                ? "First extra period"
                : live.phase === "extra-half"
                  ? "Second extra period"
                  : "Second half"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onSkipRest(htTactics, htSheet)}>
              {live.phase === "half-time" ? "Skip to full-time" : "Skip extra time"}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={onSkip}>
            {live.phase === "first"
              ? "Skip to half-time"
              : live.phase === "et1"
                ? "Skip extra-time half"
                : "Skip to result"}
          </button>
        )}
      </div>
    </div>
  );
}
