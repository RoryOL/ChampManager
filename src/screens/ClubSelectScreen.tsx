import { useEffect, useState } from "react";
import { seedChampionship } from "../data/championship";
import { ClubBadge } from "../components/ClubBadge";
import { compactName } from "../lib/display";
import { teamGroup } from "../lib/resolve";
import { ratedSquad } from "../lib/players";
import { WAIT_OPTIONS } from "../lib/multiplayer/campaign";
import { normaliseCode } from "../lib/multiplayer/codes";
import type { WaitHours } from "../types";

export type HostPayload = {
  name: string;
  clubId: string;
  waitHours: WaitHours;
};

export type JoinPayload = {
  name: string;
  clubId: string;
  code: string;
  snapshot?: string;
};

type Props = {
  onTakeCharge: (clubId: string) => void;
  onHost: (payload: HostPayload) => void;
  onJoin: (payload: JoinPayload) => Promise<{ ok: true } | { ok: false; error: string }> | { ok: true } | { ok: false; error: string };
  onPreviewTaken?: (code: string, snapshot?: string) => Promise<string[]> | string[];
};

type Mode = "solo" | "host" | "join";

function ClubList({
  taken,
  action,
  onPick,
}: {
  taken: string[];
  action: string;
  onPick: (clubId: string) => void;
}) {
  return (
    <ul className="club-pick">
      {seedChampionship.teams.map((team) => {
        const group = teamGroup(seedChampionship, team.id);
        const stars = [...ratedSquad(team.id)].sort((a, b) => b.ratings.overall - a.ratings.overall);
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

export function ClubSelectScreen({ onTakeCharge, onHost, onJoin, onPreviewTaken }: Props) {
  const [mode, setMode] = useState<Mode>("solo");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [waitHours, setWaitHours] = useState<WaitHours>(24);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const [looking, setLooking] = useState(false);

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

  return (
    <div className="screen screen--select">
      <header className="select-hero">
        <p>Capture the Canon</p>
        <h1>{mode === "solo" ? "Take charge" : mode === "host" ? "Host a championship" : "Join a championship"}</h1>
        <span>TUS Clare Senior Hurling Championship 2026</span>
      </header>

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
              ? "Then pick your club. Friends can join on this phone or on theirs with the invite code. Championship weeks wait until every manager has acted, or until your window closes."
              : looking
                ? "Looking up that room…"
                : "Enter the host's invite code. It works on another phone if both have a connection. You can still paste a snapshot if the live room is quiet."}
          </p>
        </section>
      )}

      {mode === "solo" ? (
        <ClubList taken={[]} action="Take charge" onPick={onTakeCharge} />
      ) : mode === "host" ? (
        <ClubList
          taken={[]}
          action="Host"
          onPick={(clubId) => {
            if (!hostReady) {
              setError("Put your name in first.");
              return;
            }
            setError(null);
            onHost({ name, clubId, waitHours });
          }}
        />
      ) : (
        <ClubList
          taken={taken}
          action="Join"
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
