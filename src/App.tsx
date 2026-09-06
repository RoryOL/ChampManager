import { useState } from "react";
import type { Match, PageId } from "./types";
import { useGame } from "./hooks/useGame";
import { BottomNav } from "./components/BottomNav";
import { teamById } from "./lib/resolve";
import { compactName } from "./lib/display";
import { ClubBadge } from "./components/ClubBadge";
import { ClubSelectScreen } from "./screens/ClubSelectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SquadScreen } from "./screens/SquadScreen";
import { TacticsScreen } from "./screens/TacticsScreen";
import { FixturesScreen } from "./screens/FixturesScreen";
import { MatchDetailScreen } from "./screens/MatchDetailScreen";
import { TableScreen } from "./screens/TableScreen";
import { MatchScreen } from "./screens/MatchScreen";

export default function App() {
  const game = useGame();
  const [page, setPage] = useState<PageId>("home");
  const [fixtureId, setFixtureId] = useState<string | null>(null);
  const club = game.save ? teamById(game.championship, game.save.clubId) : undefined;
  const openTeam = (teamId: string) => {
    game.setViewTeamId(teamId);
    game.setPicked(null);
    setFixtureId(null);
    setPage("squad");
  };
  const openMatch = (match: Match) => {
    setFixtureId(match.id);
    setPage("fixtures");
  };
  const selectedMatch = game.championship.matches.find((match) => match.id === fixtureId);
  const managerLabel = game.activeSeat
    ? `${game.activeSeat.name} · ${club ? compactName(club) : "Together"}`
    : club
      ? compactName(club)
      : "Capture the Canon";

  return (
    <div className="device">
      <div className="status-bar" aria-hidden="true">
        <span>Capture the Canon</span>
        <span>{game.campaign ? game.campaign.code : "SHC 26"}</span>
      </div>

      {!game.save && !game.campaign && (
        <ClubSelectScreen
          onTakeCharge={game.takeCharge}
          onHost={game.hostCampaign}
          onJoin={game.joinCampaign}
          onPreviewTaken={game.previewJoinTaken}
        />
      )}

      {game.campaign && game.campaign.phase === "lobby" && (
        <LobbyScreen
          campaign={game.campaign}
          playerId={game.player.id}
          localSeats={game.localSeats}
          onStart={game.startLobby}
          onLeave={game.leaveCampaign}
          onWaitHours={game.changeWaitHours}
          onAddManager={game.addHotseat}
          onCopyCode={() => void game.copyCode()}
          onCopySnapshot={() => void game.copySnapshot()}
        />
      )}

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
          waitingOn={game.waitingHalf.filter((seat) => seat.clubId !== game.save?.clubId)}
          onPassDevice={game.passDevice}
          passSeats={game.localSeats.filter((seat) => seat.playerId !== game.activeSeat?.playerId)}
        />
      )}

      {game.save && !game.live && (
        <>
          <header className="app-bar">
            <ClubBadge team={club} size="sm" variant="crest" />
            <div>
              <p>{game.campaign ? `Together · ${game.campaign.code}` : "Clare SHC 2026"}</p>
              <h1>{managerLabel}</h1>
            </div>
          </header>
          {page === "home" && (
            <HomeScreen
              championship={game.championship}
              save={game.save}
              nextMatch={game.nextUserMatch}
              batchLabel={game.batch?.label ?? null}
              campaign={game.campaign}
              playerId={game.activeSeat?.playerId ?? game.player.id}
              localSeats={game.localSeats}
              onGoToMatch={game.goToMatch}
              onSkip={game.skipMatch}
              onResign={game.resign}
              onTrain={game.trainWeek}
              onReady={game.confirmWeek}
              onUnready={game.undoReady}
              onForce={game.forceWeek}
              onPass={game.passDevice}
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
          {page === "fixtures" && selectedMatch && game.save ? (
            <MatchDetailScreen
              championship={game.championship}
              save={game.save}
              match={selectedMatch}
              report={game.save.reports[selectedMatch.id] ?? null}
              onBack={() => setFixtureId(null)}
              onOpenTeam={openTeam}
            />
          ) : null}
          {page === "fixtures" && !selectedMatch && (
            <FixturesScreen championship={game.championship} save={game.save} onOpenMatch={openMatch} />
          )}
          {page === "table" && (
            <TableScreen championship={game.championship} save={game.save} onOpenTeam={openTeam} />
          )}
          <BottomNav
            page={page}
            onChange={(next) => {
              if (next !== "fixtures") setFixtureId(null);
              setPage(next);
            }}
          />
        </>
      )}
    </div>
  );
}
