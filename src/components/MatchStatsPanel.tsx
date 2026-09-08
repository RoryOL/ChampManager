import { useState } from "react";
import type { PlayerCondition, PlayerMatchStats, RatedPlayer, TeamMatchStats, TeamSheet } from "../types";
import { formatPair } from "../lib/matchStats";
import { PlayerMatchTable } from "./PlayerMatchTable";

type Props = {
  homeName: string;
  awayName: string;
  homeId: string;
  awayId: string;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
  players: PlayerMatchStats[];
  homeSquad: RatedPlayer[];
  awaySquad: RatedPlayer[];
  homeCondition?: Record<string, PlayerCondition>;
  awayCondition?: Record<string, PlayerCondition>;
  homeSheet?: TeamSheet;
  awaySheet?: TeamSheet;
  compact?: boolean;
  interactive?: boolean;
  picked?: string[];
  onTapPlayer?: (name: string) => void;
  pickerClubId?: string;
};

function TeamRow({
  label,
  home,
  away,
}: {
  label: string;
  home: string | number;
  away: string | number;
}) {
  return (
    <tr>
      <td>{home}</td>
      <th>{label}</th>
      <td>{away}</td>
    </tr>
  );
}

export function MatchStatsPanel({
  homeName,
  awayName,
  homeId,
  awayId,
  homeStats,
  awayStats,
  players,
  homeSquad,
  awaySquad,
  homeCondition,
  awayCondition,
  homeSheet,
  awaySheet,
  compact = false,
  interactive = false,
  picked = [],
  onTapPlayer,
  pickerClubId,
}: Props) {
  const [team, setTeam] = useState<"home" | "away">("home");
  const homePlayers = players.filter((player) => player.teamId === homeId);
  const awayPlayers = players.filter((player) => player.teamId === awayId);
  return (
    <div className="match-stats">
      <table className="stat-compare">
        <thead>
          <tr>
            <th>{homeName}</th>
            <th></th>
            <th>{awayName}</th>
          </tr>
        </thead>
        <tbody>
          <TeamRow label="Possessions" home={homeStats.possessions} away={awayStats.possessions} />
          <TeamRow
            label="Passes"
            home={formatPair(homeStats.passesCompleted, homeStats.passesAttempted)}
            away={formatPair(awayStats.passesCompleted, awayStats.passesAttempted)}
          />
          <TeamRow
            label="Shots (scored)"
            home={formatPair(homeStats.scores, homeStats.shots)}
            away={formatPair(awayStats.scores, awayStats.shots)}
          />
          <TeamRow
            label="Frees (scored)"
            home={formatPair(homeStats.freesScored ?? 0, homeStats.freesAttempted ?? 0)}
            away={formatPair(awayStats.freesScored ?? 0, awayStats.freesAttempted ?? 0)}
          />
          <TeamRow
            label="65s (scored)"
            home={formatPair(homeStats.sixtyFivesScored ?? 0, homeStats.sixtyFivesAttempted ?? 0)}
            away={formatPair(awayStats.sixtyFivesScored ?? 0, awayStats.sixtyFivesAttempted ?? 0)}
          />
          <TeamRow label="Frees conceded" home={homeStats.freesConceded ?? 0} away={awayStats.freesConceded ?? 0} />
          <TeamRow
            label="High fielding"
            home={formatPair(homeStats.highFieldingWon, homeStats.highFieldingAttempted)}
            away={formatPair(awayStats.highFieldingWon, awayStats.highFieldingAttempted)}
          />
          <TeamRow label="Puck-outs won" home={homeStats.puckoutsWon} away={awayStats.puckoutsWon} />
          <TeamRow
            label="Tackles"
            home={formatPair(homeStats.tacklesWon, homeStats.tacklesAttempted)}
            away={formatPair(awayStats.tacklesWon, awayStats.tacklesAttempted)}
          />
          <TeamRow label="Ground km" home={homeStats.groundCovered} away={awayStats.groundCovered} />
          <TeamRow label="Fitness" home={homeStats.fitness} away={awayStats.fitness} />
          {compact ? null : <TeamRow label="Overall" home={homeStats.overall} away={awayStats.overall} />}
        </tbody>
      </table>
      <div className="speed-row pane-row">
        <button type="button" className={team === "home" ? "is-active" : ""} onClick={() => setTeam("home")}>
          {homeName}
        </button>
        <button type="button" className={team === "away" ? "is-active" : ""} onClick={() => setTeam("away")}>
          {awayName}
        </button>
      </div>
      <PlayerMatchTable
        teamName={team === "home" ? homeName : awayName}
        squad={team === "home" ? homeSquad : awaySquad}
        stats={team === "home" ? homePlayers : awayPlayers}
        sheet={team === "home" ? homeSheet : awaySheet}
        condition={team === "home" ? homeCondition : awayCondition}
        showAttributes={!compact}
        interactive={interactive && (team === "home" ? homeId : awayId) === pickerClubId}
        picked={picked}
        onTap={onTapPlayer}
      />
      {compact ? (
        <p className="hint hint--tight">Listed in match position order. Shirt numbers are 1–15 and 16+ on the bench.</p>
      ) : interactive ? (
        <p className="hint hint--tight">Tap two of your lads in the grid, then Swap. Swipe sideways for every rating.</p>
      ) : (
        <p className="hint hint--tight">Swipe the table sideways for every rating and match stat.</p>
      )}
    </div>
  );
}
