import { useEffect, useState } from "react";
import { seedChampionship } from "../data/championship";
import { ClubBadge } from "../components/ClubBadge";
import { compactName } from "../lib/display";
import { teamGroup } from "../lib/resolve";
import { ratedSquad } from "../lib/players";
import { WAIT_OPTIONS } from "../lib/multiplayer/campaign";
import { normaliseCode } from "../lib/multiplayer/codes";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_OPTIONS,
  WELCOME_STORAGE_KEY,
  difficultyCopy,
} from "../lib/difficulty";
import {
  BALANCE_OPTIONS,
  DEFAULT_BALANCE,
  balanceCopy,
} from "../lib/balance";
import type { Difficulty, SquadBalance, WaitHours } from "../types";

export type HostPayload = {
  name: string;
  clubId: string;
  waitHours: WaitHours;
  difficulty: Difficulty;
  balance: SquadBalance;
};

export type JoinPayload = {
  name: string;
  clubId: string;
  code: string;
  snapshot?: string;
};

type Props = {
  onTakeCharge: (clubId: string, difficulty: Difficulty, balance: SquadBalance) => void;
  onHost: (payload: HostPayload) => void;
  onJoin: (payload: JoinPayload) => Promise<{ ok: true } | { ok: false; error: string }> | { ok: true } | { ok: false; error: string };
  onPreviewTaken?: (code: string, snapshot?: string) => Promise<string[]> | string[];
};

type Mode = "solo" | "host" | "join";

function ClubList({
  taken,
  action,
  onPick,
  balance,
}: {
  taken: string[];
  action: string;
  onPick: (clubId: string) => void;
  balance: SquadBalance;
}) {
  return (
    <ul className="club-pick">
      {seedChampionship.teams.map((team) => {
        const group = teamGroup(seedChampionship, team.id);
        const stars = [...ratedSquad(team.id, { balance })].sort((a, b) => b.ratings.overall - a.ratings.overall);
        const best = stars[0];
        const claimed = taken.includes(team.id);
        return (
          <li key={team.id}>
            <button type="button" disabled={claimed} onClick={() => onPick(team.id)}>
              <ClubBadge team={team} size="lg" variant="crest" />
              <span>
                <strong>{compactName(team)}</strong>
                <em>
                  {team.colours.label} · {group?.name}
                  {best ? ` · ${best.name} ${best.ratings.overall}` : ""}
                  {claimed ? " · taken" : ""}
                </em>
              </span>
              <b>{claimed ? "Taken" : action}</b>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function readWelcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ClubSelectScreen({ onTakeCharge, onHost, onJoin, onPreviewTaken }: Props) {
  const [mode, setMode] = useState<Mode>("solo");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [waitHours, setWaitHours] = useState<WaitHours>(24);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [balance, setBalance] = useState<SquadBalance>(DEFAULT_BALANCE);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [looking, setLooking] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !readWelcomeSeen());

  useEffect(() => {
    if (mode !== "join") {
      setTaken([]);
      setLooking(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLooking(true);
      void Promise.resolve(onPreviewTaken?.(normaliseCode(code), snapshot) ?? []).then((clubs) => {
        if (cancelled) return;
        setTaken(clubs);
        setLooking(false);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, mode, onPreviewTaken, snapshot]);

  const hostReady = name.trim().length > 0;
  const joinReady = name.trim().length > 0 && (normaliseCode(code).length >= 4 || snapshot.trim().length > 8);

  const dismissWelcome = () => {
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowWelcome(false);
  };

  return (
    <div className="screen screen--select">
      {showWelcome ? (
        <div className="welcome-scrim" role="presentation">
          <section className="welcome-card" role="dialog" aria-labelledby="welcome-title">
            <p>Capture the Canon</p>
            <h2 id="welcome-title">Welcome</h2>
            <p>
              The best of luck hunting the Canon Hamilton Cup for the 2026 season. Sixteen clubs, one trophy,
              and a long Clare summer ahead of you.
            </p>
            <p>
              The panels here are simulated from a few simple assumptions — lineups, a handful of known names,
              and a bit of guesswork. They are not a scout&apos;s notebook, not accurate, and just a bit of fun.
            </p>
            <button type="button" className="btn" onClick={dismissWelcome}>
              Take charge
            </button>
          </section>
        </div>
      ) : null}

      <header className="select-hero">
        <p>Capture the Canon</p>
        <h1>{mode === "solo" ? "Take charge" : mode === "host" ? "Host a championship" : "Join a championship"}</h1>
        <span>TUS Clare Senior Hurling Championship 2026</span>
      </header>

      <section className="difficulty-picker">
        <p className="kicker">Panels</p>
        <div className="difficulty-grid">
          {BALANCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={balance === option.value ? "is-active" : ""}
              onClick={() => setBalance(option.value)}
              disabled={mode === "join"}
            >
              <strong>{option.title}</strong>
              <em>{option.subtitle}</em>
            </button>
          ))}
        </div>
        <p className="hint">
          {mode === "join"
            ? "The host already set the panels for this championship."
            : balanceCopy(balance)}
        </p>
      </section>

      <section className="difficulty-picker">
        <p className="kicker">Difficulty</p>
        <div className="difficulty-grid">
          {DIFFICULTY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={difficulty === option.value ? "is-active" : ""}
              onClick={() => setDifficulty(option.value)}
              disabled={mode === "join"}
            >
              <strong>{option.title}</strong>
              <em>{option.subtitle}</em>
            </button>
          ))}
        </div>
        <p className="hint">
          {mode === "join"
            ? "The host already set the standard for this championship."
            : difficultyCopy(difficulty)}
        </p>
      </section>

      <div className="speed-row pane-row">
        <button type="button" className={mode === "solo" ? "is-active" : ""} onClick={() => setMode("solo")}>
          Solo
        </button>
        <button type="button" className={mode === "host" ? "is-active" : ""} onClick={() => setMode("host")}>
          Host
        </button>
        <button type="button" className={mode === "join" ? "is-active" : ""} onClick={() => setMode("join")}>
          Join
        </button>
      </div>

      {mode === "solo" ? (
        <p className="hint">Pick a club and run the championship on your own. Host or join to play the same campaign with friends.</p>
      ) : (
        <section className="card">
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Manager" />
          </label>
          {mode === "host" ? (
            <label className="field">
              <span>Wait for other managers</span>
              <select value={waitHours} onChange={(event) => setWaitHours(Number(event.target.value) as WaitHours)}>
                {WAIT_OPTIONS.map((option) => (
                  <option key={option.hours} value={option.hours}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field">
                <span>Invite code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="e.g. 7K2MPQ"
                  autoCapitalize="characters"
                />
              </label>
              <label className="field">
                <span>Or paste a shared championship</span>
                <textarea
                  value={snapshot}
                  onChange={(event) => setSnapshot(event.target.value)}
                  rows={3}
                  placeholder="Paste the host's championship snapshot"
                />
              </label>
            </>
          )}
          {error ? <p className="hint hint--warn">{error}</p> : null}
          <p className="hint">
            {mode === "host"
              ? "Then pick your club. Friends can join on this phone or on theirs with the invite code. Each manager trains and plays their own games; you only wait when you face each other, or until your window closes."
              : looking
                ? "Looking up that room…"
                : "Enter the host's invite code. It works on another phone if both have a connection. You can still paste a snapshot if the live room is quiet."}
          </p>
        </section>
      )}

      {mode === "solo" ? (
        <ClubList taken={[]} action="Take charge" balance={balance} onPick={(clubId) => onTakeCharge(clubId, difficulty, balance)} />
      ) : mode === "host" ? (
        <ClubList
          taken={[]}
          action="Host"
          balance={balance}
          onPick={(clubId) => {
            if (!hostReady) {
              setError("Put your name in first.");
              return;
            }
            setError(null);
            onHost({ name, clubId, waitHours, difficulty, balance });
          }}
        />
      ) : (
        <ClubList
          taken={taken}
          action="Join"
          balance={balance}
          onPick={async (clubId) => {
            if (!joinReady) {
              setError("Name and an invite code or snapshot are required.");
              return;
            }
            setError(null);
            const result = await onJoin({ name, clubId, code: normaliseCode(code), snapshot });
            if (!result.ok) setError(result.error);
          }}
        />
      )}
    </div>
  );
}
