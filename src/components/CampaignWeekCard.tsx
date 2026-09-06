import type { Campaign, Seat } from "../types";
import { compactName } from "../lib/display";
import { teamById } from "../lib/resolve";
import { seedChampionship } from "../data/championship";
import { formatDeadline, waitingOnSecondHalf, waitingOnWeek } from "../lib/multiplayer/campaign";

type Props = {
  campaign: Campaign;
  clubId: string;
  playerId: string;
  localSeats: Seat[];
  now?: number;
  onReady: () => void;
  onUnready: () => void;
  onForce: () => void;
  onPass: (playerId: string) => void;
};

export function CampaignWeekCard({
  campaign,
  clubId,
  playerId,
  localSeats,
  now = Date.now(),
  onReady,
  onUnready,
  onForce,
  onPass,
}: Props) {
  const others = localSeats.filter((seat) => seat.playerId !== playerId);
  const waitingWeek = waitingOnWeek(campaign);
  const live = Object.values(campaign.week.lives).find(
    (item) => item.first.homeId === clubId || item.first.awayId === clubId,
  );
  const waitingHalf = live ? waitingOnSecondHalf(campaign, live.matchId) : [];
  const isHost = campaign.hostPlayerId === playerId;
  const isReady = Boolean(campaign.week.ready[clubId]);
  const needReady = waitingWeek.some((seat) => seat.clubId === clubId);

  return (
    <section className="card">
      <p className="kicker">Together · {campaign.code}</p>
      <h3>Championship week</h3>
      <p className="hint">{formatDeadline(campaign.week.deadlineAt, now)}</p>
      {waitingWeek.length > 0 ? (
        <p>
          Waiting on {waitingWeek.map((seat) => `${seat.name} (${teamLabel(seat.clubId)})`).join(", ")}.
        </p>
      ) : live && waitingHalf.length > 0 ? (
        <p>
          First half is in. Waiting on{" "}
          {waitingHalf.map((seat) => `${seat.name} (${teamLabel(seat.clubId)})`).join(", ")} to set second-half
          tactics.
        </p>
      ) : (
        <p>Every manager is in for this week.</p>
      )}
      {campaign.phase === "season" && !campaign.week.locked ? (
        <div className="row-actions">
          {needReady ? (
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
      {isHost && (waitingWeek.length > 0 || waitingHalf.length > 0) ? (
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
