import type { Campaign, Seat } from "../types";
import { compactName } from "../lib/display";
import { teamById } from "../lib/resolve";
import { seedChampionship } from "../data/championship";
import { formatDeadline, liveForClub, preMatchTacticsLocked, waitingOnClub, waitingOnEarlierRound, waitingOnSecondHalf, clubInSeason, nextMatchForClub } from "../lib/multiplayer/campaign";

type Props = {
  campaign: Campaign;
  clubId: string;
  playerId: string;
  localSeats: Seat[];
  now?: number;
  roomStatus?: "offline" | "connecting" | "live";
  onReady: () => void;
  onUnready: () => void;
  onForce: () => void;
  onPass: (playerId: string) => void;
  onRefreshRoom?: () => void;
  onRetryRoom?: () => void;
};

export function CampaignWeekCard({
  campaign,
  clubId,
  playerId,
  localSeats,
  now = Date.now(),
  roomStatus = "offline",
  onReady,
  onUnready,
  onForce,
  onPass,
  onRefreshRoom,
  onRetryRoom,
}: Props) {
  const others = localSeats.filter((seat) => seat.playerId !== playerId);
  const waitingWeek = waitingOnClub(campaign, clubId);
  const waitingRound = waitingOnEarlierRound(campaign, clubId);
  const live = liveForClub(campaign, clubId);
  const waitingHalf = live && !live.combined
    ? waitingOnSecondHalf(campaign, live.matchId).filter((seat) => seat.clubId !== clubId)
    : [];
  const isHost = campaign.hostPlayerId === playerId;
  const isReady = Boolean(campaign.week.ready[clubId]);
  const inSeason = clubInSeason(campaign, clubId);
  const nextMatch = nextMatchForClub(campaign, clubId);
  const canConfirm = inSeason && !live && Boolean(nextMatch) && !isReady && waitingRound.length === 0;
  const tacticsLocked = preMatchTacticsLocked(campaign, clubId);

  return (
    <section className="card">
      <p className="kicker">Together · {campaign.code}</p>
      <h3>Championship week</h3>
      <p className="hint">
        {roomStatus === "live"
          ? "Live with other phones. "
          : roomStatus === "connecting"
            ? "Reaching the other phones… "
            : ""}
        {formatDeadline(campaign.week.deadlineAt, now)}
      </p>
      {waitingRound.length > 0 ? (
        <p>
          Waiting on {waitingRound.map((seat) => `${seat.name} (${teamLabel(seat.clubId)})`).join(", ")} to finish this
          round before you can start the next one.
        </p>
      ) : waitingWeek.length > 0 ? (
        <p>
          Waiting on {waitingWeek.map((seat) => `${seat.name} (${teamLabel(seat.clubId)})`).join(", ")}
          {tacticsLocked ? ". Your first-half tactics are locked until half-time." : "."}
        </p>
      ) : live && waitingHalf.length > 0 ? (
        <p>
          First half is in. Waiting on{" "}
          {waitingHalf.map((seat) => `${seat.name} (${teamLabel(seat.clubId)})`).join(", ")} to start the second
          half.
        </p>
      ) : tacticsLocked ? (
        <p>First-half tactics are locked from the tactics view. The match starts when the other manager confirms.</p>
      ) : (
        <p>
          {inSeason
            ? "Play your own ties when you are ready. You only wait when you face another manager."
            : "Train your six preseason weeks in your own time. Other managers do not have to wait on you."}
        </p>
      )}
      {inSeason && !live ? (
        <div className="row-actions">
          {canConfirm ? (
            <button type="button" className="btn" onClick={onReady}>
              Confirm championship day
            </button>
          ) : isReady ? (
            <button type="button" className="btn btn--ghost" onClick={onUnready}>
              Undo ready
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="row-actions">
        {onRefreshRoom ? (
          <button type="button" className="btn btn--ghost" onClick={() => void onRefreshRoom()}>
            Check for updates
          </button>
        ) : null}
        {roomStatus !== "live" && onRetryRoom ? (
          <button type="button" className="btn btn--ghost" onClick={onRetryRoom}>
            Retry live room
          </button>
        ) : null}
      </div>
      {isHost && waitingRound.length === 0 && (waitingWeek.length > 0 || waitingHalf.length > 0) ? (
        <div className="row-actions">
          <button type="button" className="btn btn--ghost" onClick={onForce}>
            Play on without them
          </button>
        </div>
      ) : null}
      {others.length > 0 ? (
        <div className="row-actions">
          {others.map((seat) => (
            <button key={seat.playerId} type="button" className="btn btn--ghost" onClick={() => onPass(seat.playerId)}>
              Pass to {seat.name}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function teamLabel(clubId: string): string {
  const team = teamById(seedChampionship, clubId);
  return team ? compactName(team) : clubId;
}
