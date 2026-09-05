import { useMemo, useState } from "react";
import type { Championship, Match } from "../types";
import { MatchCard } from "../components/MatchCard";
import { stageLabel } from "../lib/scoring";

type Props = {
  championship: Championship;
  onSelectMatch: (match: Match) => void;
};

const filters = [
  { id: "all", label: "All" },
  { id: "1", label: "Group 1" },
  { id: "2", label: "Group 2" },
  { id: "3", label: "Group 3" },
  { id: "4", label: "Group 4" },
  { id: "knockout", label: "Knockout" },
  { id: "relegation", label: "Relegation" },
] as const;

export function FixturesPage({ championship, onSelectMatch }: Props) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");

  const visible = useMemo(() => {
    return championship.matches.filter((match) => {
      if (filter === "all") return true;
      if (filter === "knockout") {
        return ["quarter-final", "semi-final", "final"].includes(match.stage);
      }
      if (filter === "relegation") {
        return match.stage === "relegation-semi" || match.stage === "relegation-final";
      }
      return match.groupId === filter;
    });
  }, [championship.matches, filter]);

  const sections = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const match of visible) {
      const key =
        match.stage === "group"
          ? `Round ${match.round}`
          : stageLabel(match.stage);
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <div className="page">
      <header className="page-intro">
        <p className="eyebrow">Results &amp; throw-ins</p>
        <h1>Fixtures</h1>
        <p>
          Group games follow the 2026 Clare SHC programme. Record a knockout or relegation
          scoreline and the bracket updates automatically.
        </p>
      </header>
      <div className="filters" role="tablist" aria-label="Fixture filters">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? "chip is-active" : "chip"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {sections.map(([title, matches]) => (
        <section key={title} className="fixture-section">
          <h2>{title}</h2>
          <div className="card-grid">
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                championship={championship}
                match={match}
                onSelect={onSelectMatch}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
