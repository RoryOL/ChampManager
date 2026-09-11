import { useState } from "react";
import type { Match, PageId } from "./types";
import { useGame } from "./hooks/useGame";
import { BottomNav } from "./components/BottomNav";
import { teamById } from "./lib/resolve";
import { compactName } from "./lib/display";
import { difficultyTitle } from "./lib/difficulty";
import { balanceTitle } from "./lib/balance";
import { ClubBadge } from "./components/ClubBadge";
import { HelpButton, HelpSheet } from "./components/HelpSheet";
import { ClubSelectScreen } from "./screens/ClubSelectScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SquadScreen } from "./screens/SquadScreen";
import { TrainingScreen } from "./screens/TrainingScreen";
import { TacticsScreen } from "./screens/TacticsScreen";
import { FixturesScreen } from "./screens/FixturesScreen";
import { MatchDetailScreen } from "./screens/MatchDetailScreen";
import { TableScreen } from "./screens/TableScreen";
import { MatchScreen } from "./screens/MatchScreen";
import { SeasonEndScreen } from "./screens/SeasonEndScreen";

export default function App() {
  const game = useGame();
  const [page, setPage] = useState<PageId>("home");
  const [fixtureId, setFixtureId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const club = game.save ? teamById(game.championship, game.save.clubId) : undefined;
  const winner = game.championId ? teamById(game.championship, game.championId) : undefined;
  const wrapping = Boolean(game.save && !game.live && game.finaleStep && game.finaleStep !== "done" && winner);
  const beginNewSeason = () => {
    setPage("home");
    setFixtureId(null);
    game.startNewSeason();
  };
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
      <div className="status-bar">
        <span>Capture the Canon</span>
        <span className="status-bar__trail">
          <span>{game.campaign ? game.campaign.code : "SHC 26"}</span>
          {game.save ? <HelpButton onOpen={() => setHelpOpen(true)} /> : null}
        </span>
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
          roomStatus={game.roomStatus}
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
          onSetTactics={game.setTactics}
          onStartThrowIn={game.startThrowIn}
          waitingOn={game.waitingHalf.filter((seat) => seat.clubId !== game.save?.clubId)}
          onPassDevice={game.passDevice}
          passSeats={game.localSeats.filter((seat) => seat.playerId !== game.activeSeat?.playerId)}
        />
      )}

      {game.save && !game.live && game.finaleStep && game.finaleStep !== "done" && winner ? (
        <SeasonEndScreen
          championship={game.championship}
          winner={winner}
          clubWon={game.save.clubId === winner.id}
          together={Boolean(game.campaign)}
          step={game.finaleStep}
          clubName={club ? compactName(club) : "your club"}
          onContinue={() => game.setSeasonWrap("offer")}
          onStartNewSeason={beginNewSeason}
          onStay={() => game.setSeasonWrap("done")}
        />
      ) : null}

      {game.save && !game.live && !wrapping && (
        <>
          <header className="app-bar">
            <ClubBadge team={club} size="sm" variant="crest" />
            <div>
              <p>
                {game.campaign ? `Together · ${game.campaign.code}` : "Clare SHC 2026"}
                {game.save ? ` · ${difficultyTitle(game.save.difficulty)}` : ""}
                {game.save && game.save.balance !== "standard" ? ` · ${balanceTitle(game.save.balance)}` : ""}
              </p>
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
              roomStatus={game.roomStatus}
              onGoToMatch={game.goToMatch}
              onSkip={game.skipMatch}
              onResign={game.resign}
              onReady={game.confirmWeek}
              onUnready={game.undoReady}
              onForce={game.forceWeek}
              onPass={game.passDevice}
              onReadNews={game.readNews}
              onOpenMatch={(matchId) => {
                setFixtureId(matchId);
                setPage("fixtures");
              }}
              onOpenPlayer={(name) => {
                game.setViewTeamId(game.save!.clubId);
                game.setPicked(name);
                setFixtureId(null);
                setPage("squad");
              }}
              onOpenTeam={openTeam}
              onOpenTraining={() => setPage("training")}
              onSetWeekShape={game.setWeekShape}
              onRunWeek={game.trainFullWeek}
              onMatchPrep={game.runMatchPrep}
              finaleStep={game.finaleStep}
              championId={game.championId}
              onStartNewSeason={beginNewSeason}
            />
          )}
          {page === "squad" && (
            <SquadScreen
              save={game.save}
              championship={game.championship}
              teams={game.championship.teams}
              viewTeamId={game.viewTeamId ?? game.save.clubId}
              onViewTeam={(teamId) => {
                game.setViewTeamId(teamId);
                game.setPicked(null);
              }}
              picked={game.picked}
              onTapPlayer={game.tapPlayer}
              onOpenTraining={() => setPage("training")}
              onOpenMatch={openMatch}
            />
          )}
          {page === "training" && (
            <TrainingScreen
              save={game.save}
              onBack={() => setPage("squad")}
              onTrain={game.trainWeek}
              onMatchPrep={game.runMatchPrep}
              onSetPlans={game.setPlans}
              onSetIntensity={game.setIntensity}
              onSetWeekShape={game.setWeekShape}
            />
          )}
          {page === "tactics" && (
            <TacticsScreen
              save={game.save}
              championship={game.championship}
              nextMatch={game.nextUserMatch}
              onChange={game.setTactics}
              onSwap={game.swapPlayers}
              onSetSheet={game.setSheet}
              onOpenTeam={openTeam}
              locked={game.tacticsLocked}
            />
          )}
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
              if (next === "squad" && game.save) {
                game.setViewTeamId(game.save.clubId);
                game.setPicked(null);
              }
              setPage(next);
            }}
          />
        </>
      )}
      {game.save ? <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}
