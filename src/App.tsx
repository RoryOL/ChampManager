import { useState } from "react";
import type { Match, PageId } from "./types";
import { useChampionship } from "./hooks/useChampionship";
import { ScoreModal } from "./components/ScoreModal";
import { OverviewPage } from "./pages/OverviewPage";
import { GroupsPage } from "./pages/GroupsPage";
import { FixturesPage } from "./pages/FixturesPage";
import { KnockoutPage } from "./pages/KnockoutPage";
import { ClubsPage } from "./pages/ClubsPage";

const nav: { id: PageId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "groups", label: "Groups" },
  { id: "fixtures", label: "Fixtures" },
  { id: "knockout", label: "Knockout" },
  { id: "clubs", label: "Clubs" },
];

export default function App() {
  const { championship, recordScore, reset } = useChampionship();
  const [page, setPage] = useState<PageId>("overview");
  const [selected, setSelected] = useState<Match | null>(null);
  const selectedMatch = selected
    ? championship.matches.find((match) => match.id === selected.id) ?? null
    : null;

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead__brand">
          <span className="sliotar" aria-hidden="true" />
          <div>
            <p>ChampManager</p>
            <strong>Clare SHC {championship.year}</strong>
          </div>
        </div>
        <nav className="masthead__nav" aria-label="Championship sections">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "nav-link is-active" : "nav-link"}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            if (window.confirm("Reset all results back to the 2026 Clare SHC reference data?")) {
              reset();
            }
          }}
        >
          Reset 2026
        </button>
      </header>

      <main>
        {page === "overview" && (
          <OverviewPage championship={championship} onSelectMatch={setSelected} />
        )}
        {page === "groups" && <GroupsPage championship={championship} />}
        {page === "fixtures" && (
          <FixturesPage championship={championship} onSelectMatch={setSelected} />
        )}
        {page === "knockout" && (
          <KnockoutPage championship={championship} onSelectMatch={setSelected} />
        )}
        {page === "clubs" && <ClubsPage championship={championship} onSelectMatch={setSelected} />}
      </main>

      <footer className="site-foot">
        <p>
          {championship.sponsor} · {championship.trophy} · {championship.county} GAA club hurling
        </p>
      </footer>

      {selectedMatch && (
        <ScoreModal
          championship={championship}
          match={selectedMatch}
          onClose={() => setSelected(null)}
          onSave={(homeScore, awayScore) => {
            recordScore(selectedMatch.id, homeScore, awayScore);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
