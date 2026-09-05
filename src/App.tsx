import { useState } from "react";
import type { PageId } from "./types";
import { useGame } from "./hooks/useGame";
import { BottomNav } from "./components/BottomNav";
import { teamById } from "./lib/resolve";
import { compactName } from "./lib/display";
import { ClubSelectScreen } from "./screens/ClubSelectScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SquadScreen } from "./screens/SquadScreen";
import { TacticsScreen } from "./screens/TacticsScreen";
import { FixturesScreen } from "./screens/FixturesScreen";
import { TableScreen } from "./screens/TableScreen";
import { MatchScreen } from "./screens/MatchScreen";

export default function App() {
  const game = useGame();
  const [page, setPage] = useState<PageId>("home");
  const club = game.save ? teamById(game.championship, game.save.clubId) : undefined;

  return (
    <div className="device">
      <div className="status-bar" aria-hidden="true">
        <span>ChampManager</span>
        <span>SHC 26</span>
      </div>

      {!game.save && <ClubSelectScreen onTakeCharge={game.takeCharge} />}

      {game.save && game.live && (
        <MatchScreen
          championship={game.championship}
          save={game.save}
          live={game.live}
          onAdvance={game.advanceLive}
          onSkip={game.skipMatch}
          onClose={game.closeLive}
          onContinueSecond={game.continueSecondHalf}
          onSkipRest={game.skipRest}
        />
      )}

      {game.save && !game.live && (
        <>
          <header className="app-bar">
            <div>
              <p>Clare SHC 2026</p>
              <h1>{club ? compactName(club) : "ChampManager"}</h1>
            </div>
          </header>
          {page === "home" && (
            <HomeScreen
              championship={game.championship}
              save={game.save}
              nextMatch={game.nextUserMatch}
              batchLabel={game.batch?.label ?? null}
              onGoToMatch={game.goToMatch}
              onSkip={game.skipMatch}
              onResign={game.resign}
              onTrain={game.trainWeek}
            />
          )}
          {page === "squad" && (
            <SquadScreen
              save={game.save}
              teams={game.championship.teams}
              viewTeamId={game.viewTeamId ?? game.save.clubId}
              onViewTeam={(teamId) => {
                game.setViewTeamId(teamId);
                game.setPicked(null);
              }}
              picked={game.picked}
              onTapPlayer={game.tapPlayer}
            />
          )}
          {page === "tactics" && <TacticsScreen save={game.save} onChange={game.setTactics} />}
          {page === "fixtures" && (
            <FixturesScreen championship={game.championship} save={game.save} />
          )}
          {page === "table" && <TableScreen championship={game.championship} save={game.save} />}
          <BottomNav page={page} onChange={setPage} />
        </>
      )}
    </div>
  );
}
