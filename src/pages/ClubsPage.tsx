import { useMemo, useState } from "react";
import type { Championship, Match } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { MatchCard } from "../components/MatchCard";
import { teamGroup, teamRecord, resolveMatchSides } from "../lib/resolve";
import { groupIsComplete, groupStandings } from "../lib/standings";

type Props = {
  championship: Championship;
  onSelectMatch: (match: Match) => void;
};

export function ClubsPage({ championship, onSelectMatch }: Props) {
  const [selectedId, setSelectedId] = useState(championship.defendingChampionId);
  const selected = championship.teams.find((team) => team.id === selectedId);
  const group = selected ? teamGroup(championship, selected.id) : undefined;
  const record = selected ? teamRecord(championship, selected.id) : undefined;

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

  return (
    <div className="page">
      <header className="page-intro">
        <p className="eyebrow">Sixteen senior clubs</p>
        <h1>The field</h1>
        <p>
          The 2026 championship draw placed the Clare senior hurling clubs into four groups of
          four. Select a club to see its group standing and championship path.
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
