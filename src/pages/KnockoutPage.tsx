import type { Championship, Match } from "../types";
import { formatDate, formatScore, matchPlayed, stageLabel } from "../lib/scoring";
import { sideLabel } from "../lib/display";
import { resolveMatchSides } from "../lib/resolve";
import { TeamLine } from "../components/TeamLine";

type Props = {
  championship: Championship;
  onSelectMatch: (match: Match) => void;
};

export function KnockoutPage({ championship, onSelectMatch }: Props) {
  const qf = championship.matches.filter((match) => match.stage === "quarter-final");
  const sf = championship.matches.filter((match) => match.stage === "semi-final");
  const final = championship.matches.find((match) => match.stage === "final");
  const rel = championship.matches.filter(
    (match) => match.stage === "relegation-semi" || match.stage === "relegation-final",
  );

  return (
    <div className="page">
      <header className="page-intro">
        <p className="eyebrow">Last eight to county final</p>
        <h1>Knockout</h1>
        <p>
          Group winners were seeded against runners-up in the 23 August draw. Winners flow into the
          semi-finals and final. The four bottom clubs contest relegation.
        </p>
      </header>

      <div className="bracket">
        <div className="bracket-col">
          <h2>Quarter-finals</h2>
          {qf.map((match) => (
            <BracketMatch
              key={match.id}
              championship={championship}
              match={match}
              onSelect={onSelectMatch}
            />
          ))}
        </div>
        <div className="bracket-col">
          <h2>Semi-finals</h2>
          {sf.map((match) => (
            <BracketMatch
              key={match.id}
              championship={championship}
              match={match}
              onSelect={onSelectMatch}
            />
          ))}
        </div>
        <div className="bracket-col">
          <h2>County final</h2>
          {final && (
            <BracketMatch
              championship={championship}
              match={final}
              onSelect={onSelectMatch}
              featured
            />
          )}
        </div>
      </div>

      <section className="relegation">
        <h2>Relegation</h2>
        <p className="section-copy">
          Losers of the two play-offs meet in the relegation final. The beaten side drops to the
          Premier Intermediate Championship.
        </p>
        <div className="card-grid card-grid--two">
          {rel.map((match) => (
            <BracketMatch
              key={match.id}
              championship={championship}
              match={match}
              onSelect={onSelectMatch}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function BracketMatch({
  championship,
  match,
  onSelect,
  featured = false,
}: {
  championship: Championship;
  match: Match;
  onSelect: (match: Match) => void;
  featured?: boolean;
}) {
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const played = matchPlayed(match);

  return (
    <button
      type="button"
      className={`bracket-match ${featured ? "is-featured" : ""}`}
      onClick={() => onSelect(match)}
    >
      <div className="match-card__meta">
        <span>{stageLabel(match.stage)}</span>
        <span>{formatDate(match.date)}</span>
      </div>
      <div className="match-card__row">
        <TeamLine
          championship={championship}
          teamId={homeId}
          label={sideLabel(championship, match.home)}
        />
        <span className="match-card__score">
          {match.homeScore ? formatScore(match.homeScore) : "–"}
        </span>
      </div>
      <div className="match-card__row">
        <TeamLine
          championship={championship}
          teamId={awayId}
          label={sideLabel(championship, match.away)}
        />
        <span className="match-card__score">
          {match.awayScore ? formatScore(match.awayScore) : "–"}
        </span>
      </div>
      {match.venue && <p className="match-card__venue">{match.venue}</p>}
      <span className="match-card__action">{played ? "Edit result" : "Enter result"}</span>
    </button>
  );
}
