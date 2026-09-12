import type { Team } from "../types";
import { ClubBadge } from "./ClubBadge";
import { compactName, teamAccent } from "../lib/display";
import { formatSideRating, sideRatingDelta } from "../lib/briefing";

type Props = {
  us?: Team;
  them?: Team;
  ourAttack: number;
  ourDefence: number;
  theirAttack: number;
  theirDefence: number;
};

const RATING_SCALE = 20;

function barWidth(value: number): string {
  return `${Math.max(6, Math.min(100, (value / RATING_SCALE) * 100))}%`;
}

function Delta({ ours, theirs }: { ours: number; theirs: number }) {
  const delta = sideRatingDelta(ours, theirs);
  if (delta === 0) return <em className="match-ratings__delta">level</em>;
  const up = delta > 0;
  return (
    <em className={`match-ratings__delta ${up ? "is-up" : "is-down"}`}>
      {up ? "+" : ""}
      {delta.toFixed(1)}
    </em>
  );
}

function RatingDuel({
  label,
  ours,
  theirs,
  usColor,
  themColor,
}: {
  label: string;
  ours: number;
  theirs: number;
  usColor: string;
  themColor: string;
}) {
  const ourMark = formatSideRating(ours);
  const theirMark = formatSideRating(theirs);
  const ourWins = sideRatingDelta(ours, theirs) > 0;
  const theirWins = sideRatingDelta(ours, theirs) < 0;
  return (
    <div className="match-ratings__row">
      <div className="match-ratings__label">
        <span>{label}</span>
        <Delta ours={ours} theirs={theirs} />
      </div>
      <div className="match-ratings__duel">
        <div className="match-ratings__side">
          <b className={ourWins ? "is-up" : theirWins ? "is-down" : ""}>{ourMark}</b>
          <div className="match-ratings__bar match-ratings__bar--us">
            <i style={{ width: barWidth(ours), background: usColor }} />
          </div>
        </div>
        <div className="match-ratings__side match-ratings__side--them">
          <div className="match-ratings__bar match-ratings__bar--them">
            <i style={{ width: barWidth(theirs), background: themColor }} />
          </div>
          <b className={theirWins ? "is-up" : ourWins ? "is-down" : ""}>{theirMark}</b>
        </div>
      </div>
    </div>
  );
}

export function MatchRatingsCompare({ us, them, ourAttack, ourDefence, theirAttack, theirDefence }: Props) {
  const usName = us ? compactName(us) : "Us";
  const themName = them ? compactName(them) : "Them";
  const usAccent = teamAccent(us);
  const themAccent = teamAccent(them);
  return (
    <div className="match-ratings">
      <p className="kicker">Scout</p>
      <div className="match-ratings__heads">
        <span className="match-ratings__club">
          <ClubBadge team={us} size="sm" variant="crest" />
          {usName}
        </span>
        <span className="match-ratings__club match-ratings__club--them">
          {themName}
          <ClubBadge team={them} size="sm" variant="crest" />
        </span>
      </div>
      <RatingDuel
        label="Attack"
        ours={ourAttack}
        theirs={theirAttack}
        usColor={usAccent.stripe}
        themColor={themAccent.stripe}
      />
      <RatingDuel
        label="Defence"
        ours={ourDefence}
        theirs={theirDefence}
        usColor={usAccent.stripe}
        themColor={themAccent.stripe}
      />
    </div>
  );
}
