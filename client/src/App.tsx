import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Match, type StandingRow, type Team } from "./api.js";

export default function App() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [attack, setAttack] = useState(75);
  const [defense, setDefense] = useState(75);

  const refresh = useCallback(async () => {
    try {
      const [t, s, m] = await Promise.all([
        api.getTeams(),
        api.getStandings(),
        api.getMatches(),
      ]);
      setTeams(t);
      setStandings(s);
      setMatches(m);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      await api.addTeam({ name: name.trim(), attack, defense });
      setName("");
      setAttack(75);
      setDefense(75);
    });
  };

  const played = useMemo(() => matches.filter((m) => m.played).length, [matches]);
  const teamName = useCallback(
    (id: string) => teams.find((t) => t.id === id)?.name ?? id,
    [teams],
  );

  const rounds = useMemo(() => {
    const byRound = new Map<number, Match[]>();
    for (const m of matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  return (
    <div className="app">
      <header className="hero">
        <div className="crest">CM</div>
        <div>
          <h1>ChampManager</h1>
          <p className="tagline">Run your league. Simulate the season. Lift the trophy.</p>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="controls">
        <button
          className="btn primary"
          disabled={busy || teams.length < 2}
          onClick={() => run(api.generateSeason)}
        >
          Generate fixtures
        </button>
        <button
          className="btn"
          disabled={busy || matches.length === 0}
          onClick={() => run(api.simulateSeason)}
        >
          Simulate season
        </button>
        <button
          className="btn ghost"
          disabled={busy || matches.length === 0}
          onClick={() => run(api.resetSeason)}
        >
          Reset results
        </button>
        <span className="progress">
          {matches.length > 0 ? `${played}/${matches.length} matches played` : "No fixtures yet"}
        </span>
      </section>

      <div className="grid">
        <section className="card standings-card">
          <h2>League Table</h2>
          <table className="standings">
            <thead>
              <tr>
                <th className="pos">#</th>
                <th className="club">Club</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th className="pts">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.teamId} className={i === 0 ? "leader" : ""}>
                  <td className="pos">{i + 1}</td>
                  <td className="club">{row.name}</td>
                  <td>{row.played}</td>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>{row.goalsFor}</td>
                  <td>{row.goalsAgainst}</td>
                  <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                  <td className="pts">{row.points}</td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">
                    No teams yet. Add a club to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Squad Management</h2>
          <form className="team-form" onSubmit={onAddTeam}>
            <label>
              Club name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Newcastle United"
              />
            </label>
            <div className="sliders">
              <label>
                Attack: <strong>{attack}</strong>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={attack}
                  onChange={(e) => setAttack(Number(e.target.value))}
                />
              </label>
              <label>
                Defense: <strong>{defense}</strong>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={defense}
                  onChange={(e) => setDefense(Number(e.target.value))}
                />
              </label>
            </div>
            <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
              Add club
            </button>
          </form>

          <ul className="team-list">
            {teams.map((t) => (
              <li key={t.id}>
                <span className="team-name">{t.name}</span>
                <span className="ratings">
                  <span title="Attack">ATK {t.attack}</span>
                  <span title="Defense">DEF {t.defense}</span>
                </span>
                <button
                  className="btn tiny danger"
                  disabled={busy}
                  onClick={() => run(() => api.deleteTeam(t.id))}
                >
                  Release
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card fixtures-card">
          <h2>Fixtures &amp; Results</h2>
          {rounds.length === 0 && <p className="empty">Generate fixtures to see the schedule.</p>}
          <div className="rounds">
            {rounds.map(([round, list]) => (
              <div key={round} className="round">
                <h3>Round {round}</h3>
                <ul>
                  {list.map((m) => (
                    <li key={m.id} className={m.played ? "played" : ""}>
                      <span className="home">{teamName(m.homeId)}</span>
                      <span className="score">
                        {m.played ? `${m.homeGoals} - ${m.awayGoals}` : "v"}
                      </span>
                      <span className="away">{teamName(m.awayId)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
