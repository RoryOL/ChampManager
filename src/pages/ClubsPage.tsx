import { useMemo, useState } from "react";
import type { Championship, Match } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { MatchCard } from "../components/MatchCard";
import { PlayerChip, StartingXv } from "../components/StartingXv";
import { teamGroup, teamRecord, resolveMatchSides } from "../lib/resolve";
import { groupIsComplete, groupStandings } from "../lib/standings";
import { latestLineup, squadFor } from "../lib/squads";
import { formatDate } from "../lib/scoring";

type Props = {
  championship: Championship;
  onSelectMatch: (match: Match) => void;
};

export function ClubsPage({ championship, onSelectMatch }: Props) {
  const [selectedId, setSelectedId] = useState(championship.defendingChampionId);
  const selected = championship.teams.find((team) => team.id === selectedId);
  const group = selected ? teamGroup(championship, selected.id) : undefined;
  const record = selected ? teamRecord(championship, selected.id) : undefined;
  const lineup = selected ? latestLineup(selected.id) : undefined;
  const squad = selected ? squadFor(selected.id) : [];
  const sourceMatch = lineup
    ? championship.matches.find((match) => match.id === lineup.matchId)
    : undefined;

  const place = useMemo(() => {
    if (!selected || !group) return null;
    const complete = groupIsComplete(championship.matches, group.id);
    const rows = groupStandings(
      group.teamIds,
      championship.matches.filter((match) => match.stage === "group" && match.groupId === group.id),
      complete,
    );
    return rows.find((row) => row.teamId === selected.id) ?? null;
  }, [championship.matches, group, selected]);

  const clubMatches = championship.matches.filter((match) => {
    const { homeId, awayId } = resolveMatchSides(championship, match);
    return homeId === selectedId || awayId === selectedId;
  });

  const bench = lineup
    ? squad.filter(
        (player) => !lineup.starters.some((starter) => starter.name === player.name),
      )
    : squad;

  return (
    <div className="page">
      <header className="page-intro">
        <p className="eyebrow">Sixteen senior clubs</p>
        <h1>The field</h1>
        <p>
          Squads are taken from numbered line-outs in Clare Echo reports of the 2026 group
          stage. Select a club to see its last championship fifteen and the wider panel used in
          those ties.
        </p>
      </header>

      <div className="club-grid">
        {championship.teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={team.id === selectedId ? "club-tile is-active" : "club-tile"}
            onClick={() => setSelectedId(team.id)}
          >
            <ClubBadge team={team} size="md" />
            <span>
              <strong>{team.name}</strong>
              <em>{team.irishName}</em>
            </span>
          </button>
        ))}
      </div>

      {selected && record && (
        <section className="club-detail">
          <header>
            <p className="eyebrow">{group?.name}</p>
            <h2>{selected.name}</h2>
            <p className="irish">{selected.irishName}</p>
            {selected.nickname && <p className="nickname">{selected.nickname}</p>}
            {selected.note && <p className="note">{selected.note}</p>}
          </header>
          <dl className="stat-row stat-row--compact">
            <div>
              <dt>Played</dt>
              <dd>{record.played}</dd>
            </div>
            <div>
              <dt>W-D-L</dt>
              <dd>
                {record.won}-{record.drawn}-{record.lost}
              </dd>
            </div>
            <div>
              <dt>Group pts</dt>
              <dd>{place?.points ?? 0}</dd>
            </div>
            <div>
              <dt>Place</dt>
              <dd>{place ? `${place.position} of 4` : "–"}</dd>
            </div>
          </dl>

          {lineup && (
            <div className="squad-block">
              <div className="section-head">
                <h3>Last championship XV</h3>
                <span>
                  {sourceMatch?.round ? `Round ${sourceMatch.round}` : "Group stage"}
                  {sourceMatch?.date ? ` · ${formatDate(sourceMatch.date)}` : ""}
                </span>
              </div>
              <StartingXv lineup={lineup} />
              {bench.length > 0 && (
                <>
                  <h4>Championship panel</h4>
                  <div className="panel-chips">
                    {bench.map((player) => (
                      <PlayerChip key={`${player.number}-${player.name}`} player={player} />
                    ))}
                  </div>
                </>
              )}
              <p className="source">
                Line-out from{" "}
                <a href={lineup.source} target="_blank" rel="noreferrer">
                  Clare Echo match report
                </a>
                .
              </p>
            </div>
          )}

          <div className="card-grid">
            {clubMatches.map((match) => (
              <MatchCard
                key={match.id}
                championship={championship}
                match={match}
                onSelect={onSelectMatch}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
