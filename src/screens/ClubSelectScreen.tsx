import { useState } from "react";
import { seedChampionship } from "../data/championship";
import { ClubBadge } from "../components/ClubBadge";
import { compactName } from "../lib/display";
import { teamGroup } from "../lib/resolve";
import { ratedSquad } from "../lib/players";
import { WAIT_OPTIONS } from "../lib/multiplayer/campaign";
import { normaliseCode } from "../lib/multiplayer/codes";
import type { JoinPreview } from "../lib/multiplayer/remote";
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
  onPreviewTaken?: (code: string, snapshot?: string) => Promise<JoinPreview> | JoinPreview;
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
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [showWelcome, setShowWelcome] = useState(() => !readWelcomeSeen());

  const hostReady = name.trim().length > 0;
  const codeReady = normaliseCode(code).length >= 4;
  const snapshotReady = snapshot.trim().length > 8;
  const joinReady = name.trim().length > 0 && (codeReady || snapshotReady);
  const canCheck = codeReady || snapshotReady;

  const checkRoom = async () => {
    if (!canCheck) {
      setError("Put in the host's invite code first, or paste a snapshot.");
      return;
    }
    setError(null);
    setLooking(true);
    setPreview(null);
    const result = await Promise.resolve(
      onPreviewTaken?.(normaliseCode(code), snapshot) ?? {
        connected: false,
        found: false,
        clubs: [],
        source: "none" as const,
      },
    );
    setPreview(result);
    setTaken(result.clubs);
    setLooking(false);
    if (!result.found && !result.connected) {
      setError("Could not reach the live room. Check the code and your connection, then try again.");
    }
  };

  const joinHint = () => {
    if (looking) return "Checking the live room…";
    if (!preview) {
      return "Type the host's six-character code, then press Check room. That confirms both phones can see the same lobby before you pick a club.";
    }
    if (preview.source === "live" && preview.found) {
      return `Live room found${preview.hostName ? ` · hosted by ${preview.hostName}` : ""}. Taken clubs are marked below — pick yours to join.`;
    }
    if (preview.connected && !preview.found) {
      return "The live room is up, but nothing is published on that code yet. Check the digits, or wait for the host to stay in the lobby.";
    }
    if (preview.source === "snapshot" && preview.found) {
      return preview.connected
        ? "Snapshot loaded and the live room is up. Pick a club — the host should see you join."
        : "Snapshot loaded, but the live room is not up. You can still join locally; the host will not see you until Check room succeeds.";
    }
    if (preview.found) {
      return "Found a local copy of that championship. Pick a club to rejoin.";
    }
    return "No championship for that invite yet. Check the code, or paste a snapshot.";
  };

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
                  onChange={(event) => {
                    setCode(event.target.value.toUpperCase());
                    setPreview(null);
                    setTaken([]);
                    setError(null);
                  }}
                  placeholder="e.g. 7K2MPQ"
                  autoCapitalize="characters"
                />
              </label>
              <div className="row-actions">
                <button type="button" className="btn" disabled={!canCheck || looking} onClick={() => void checkRoom()}>
                  {looking ? "Checking…" : "Check room"}
                </button>
              </div>
              <label className="field">
                <span>Or paste a shared championship</span>
                <textarea
                  value={snapshot}
                  onChange={(event) => {
                    setSnapshot(event.target.value);
                    setPreview(null);
                    setTaken([]);
                    setError(null);
                  }}
                  rows={3}
                  placeholder="Paste the host's championship snapshot"
                />
              </label>
            </>
          )}
          {error ? <p className="hint hint--warn">{error}</p> : null}
          <p className={preview?.source === "live" && preview.found ? "hint hint--ok" : "hint"}>
            {mode === "host"
              ? "Then pick your club. Friends can join on this phone or on theirs with the invite code. Each manager trains and plays their own games; you only wait when you face each other, or until your window closes."
              : joinHint()}
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
            if (!preview && codeReady) {
              setError("Press Check room first so we know the live lobby is up.");
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
