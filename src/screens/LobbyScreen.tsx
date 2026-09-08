import { useState } from "react";
import type { Campaign, Seat, WaitHours } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { compactName } from "../lib/display";
import { seedChampionship } from "../data/championship";
import { teamById } from "../lib/resolve";
import { WAIT_OPTIONS, waitLabel, campaignDifficulty, campaignBalance } from "../lib/multiplayer/campaign";
import { difficultyTitle } from "../lib/difficulty";
import { balanceTitle } from "../lib/balance";

type Props = {
  campaign: Campaign;
  playerId: string;
  localSeats: Seat[];
  roomStatus?: "offline" | "connecting" | "live";
  onStart: () => { ok: true } | { ok: false; error: string };
  onLeave: () => void;
  onWaitHours: (hours: WaitHours) => void;
  onAddManager: (name: string, clubId: string) => { ok: true } | { ok: false; error: string };
  onCopyCode: () => void;
  onCopySnapshot: () => void;
};

export function LobbyScreen({
  campaign,
  playerId,
  onStart,
  onLeave,
  onWaitHours,
  onAddManager,
  onCopyCode,
  onCopySnapshot,
  roomStatus = "offline",
}: Props) {
  const host = campaign.hostPlayerId === playerId;
  const [name, setName] = useState("");
  const [clubId, setClubId] = useState(
    seedChampionship.teams.find((team) => !campaign.seats.some((seat) => seat.clubId === team.id))?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const taken = campaign.seats.map((seat) => seat.clubId);
  const free = seedChampionship.teams.filter((team) => !taken.includes(team.id));

  return (
    <div className="screen">
      <header className="select-hero">
        <p>Together</p>
        <h1>Championship lobby</h1>
        <span>
          Invite code {campaign.code} · {difficultyTitle(campaignDifficulty(campaign))}
          {campaignBalance(campaign) === "balanced" ? ` · ${balanceTitle("balanced")}` : ""}
        </span>
      </header>

      <section className="card">
        <p className="kicker">Room</p>
        <h2 className="invite-code">{campaign.code}</h2>
        <p className="hint">
          {roomStatus === "live"
            ? "Live room is up. Friends can join from another phone with this code."
            : roomStatus === "connecting"
              ? "Opening the live room so other phones can find this code…"
              : "Local lobby. Other phones need a connection, or paste a snapshot."}{" "}
          Wait window: {waitLabel(campaign.waitHours)}. Missing managers are filled in when it closes. Human v human
          ties wait for both second-half plans before full-time.
        </p>
        <div className="row-actions">
          <button type="button" className="btn" onClick={onCopyCode}>
            Copy code
          </button>
          <button type="button" className="btn btn--ghost" onClick={onCopySnapshot}>
            Copy snapshot
          </button>
        </div>
        {host ? (
          <label className="field">
            <span>Wait for responses</span>
            <select
              value={campaign.waitHours}
              onChange={(event) => onWaitHours(Number(event.target.value) as WaitHours)}
            >
              {WAIT_OPTIONS.map((option) => (
                <option key={option.hours} value={option.hours}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section>
        <h3 className="list-title">Managers</h3>
        <ul className="inbox">
          {campaign.seats.map((seat) => {
            const team = teamById(seedChampionship, seat.clubId);
            return (
              <li key={seat.playerId} className="lobby-seat">
                <ClubBadge team={team} size="sm" variant="crest" />
                <span>
                  <strong>
                    {seat.name}
                    {seat.playerId === campaign.hostPlayerId ? " · host" : ""}
                  </strong>
                  <em>{team ? compactName(team) : seat.clubId}</em>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {host && free.length > 0 ? (
        <section className="card">
          <p className="kicker">This phone</p>
          <h3>Add another manager</h3>
          <p className="hint">Pass-and-play: they pick a club now, then you hand them the phone each game week.</p>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Manager" />
          </label>
          <label className="field">
            <span>Club</span>
            <select value={clubId} onChange={(event) => setClubId(event.target.value)}>
              {free.map((team) => (
                <option key={team.id} value={team.id}>
                  {compactName(team)}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="hint hint--warn">{error}</p> : null}
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const result = onAddManager(name, clubId);
                if (!result.ok) setError(result.error);
                else {
                  setError(null);
                  setName("");
                }
              }}
            >
              Add manager
            </button>
          </div>
        </section>
      ) : null}

      <div className="row-actions">
        {host ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const result = onStart();
              if (!result.ok) setError(result.error);
            }}
          >
            Start championship
          </button>
        ) : (
          <p className="hint">Waiting for the host to throw in.</p>
        )}
        <button type="button" className="btn btn--ghost" onClick={onLeave}>
          Leave lobby
        </button>
      </div>
    </div>
  );
}
