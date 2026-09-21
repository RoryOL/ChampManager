import { useMemo, type CSSProperties } from "react";
import type { Championship, Team } from "../types";
import { ClubBadge } from "../components/ClubBadge";
import { compactName } from "../lib/display";
import { championshipDecidingMatch } from "../lib/season";
import { formatScoreWithTotal } from "../lib/scoring";
import { resolveMatchSides } from "../lib/resolve";

type Props = {
  championship: Championship;
  winner: Team;
  clubWon: boolean;
  together: boolean;
  step: "ceremony" | "offer";
  clubName: string;
  onContinue: () => void;
  onStartNewSeason: () => void;
  onStay: () => void;
};

const STREAMER_COUNT = 48;

function Streamers({ colours }: { colours: string[] }) {
  const bits = useMemo(
    () =>
      Array.from({ length: STREAMER_COUNT }, (_, index) => ({
        left: `${(index * 19 + 3) % 100}%`,
        delay: `${((index * 0.17) % 2.8).toFixed(2)}s`,
        duration: `${3.2 + (index % 6) * 0.38}s`,
        colour: colours[index % colours.length]!,
        width: 5 + (index % 5) * 2,
        sway: index % 2 === 0 ? 18 : -16,
        kind: index % 6 === 0 ? "curl" : "strip",
      })),
    [colours],
  );

  return (
    <div className="streamers" aria-hidden="true">
      {bits.map((bit, index) => (
        <span
          key={index}
          className={`streamer streamer--${bit.kind}`}
          style={{
            left: bit.left,
            width: bit.width,
            background: bit.colour,
            animationDelay: bit.delay,
            animationDuration: bit.duration,
            ["--sway" as string]: `${bit.sway}px`,
          }}
        />
      ))}
    </div>
  );
}

function CanonTrophy() {
  return (
    <svg className="canon-trophy" viewBox="0 0 160 170" aria-hidden="true">
      <defs>
        <linearGradient id="trophy-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#fff3b0" />
          <stop offset="35%" stopColor="#f0c94a" />
          <stop offset="70%" stopColor="#c98912" />
          <stop offset="100%" stopColor="#8f5c08" />
        </linearGradient>
        <linearGradient id="trophy-shine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="158" rx="42" ry="8" fill="rgba(0,0,0,0.35)" />
      <rect x="48" y="132" width="64" height="12" rx="3" fill="url(#trophy-gold)" />
      <rect x="58" y="118" width="44" height="16" rx="2" fill="url(#trophy-gold)" />
      <path d="M44 38 H116 L108 96 C104 118 56 118 52 96 Z" fill="url(#trophy-gold)" />
      <path d="M44 38 H116 L112 58 H48 Z" fill="#ffe58a" opacity="0.55" />
      <path
        d="M28 46 C18 46 16 72 34 80 C28 64 32 52 44 50 Z"
        fill="none"
        stroke="url(#trophy-gold)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M132 46 C142 46 144 72 126 80 C132 64 128 52 116 50 Z"
        fill="none"
        stroke="url(#trophy-gold)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect x="62" y="24" width="36" height="16" rx="3" fill="url(#trophy-gold)" />
      <rect x="70" y="16" width="20" height="10" rx="2" fill="#ffe58a" />
      <rect className="canon-trophy__shine" x="52" y="40" width="18" height="70" rx="8" fill="url(#trophy-shine)" />
    </svg>
  );
}

export function SeasonEndScreen({
  championship,
  winner,
  clubWon,
  together,
  step,
  clubName,
  onContinue,
  onStartNewSeason,
  onStay,
}: Props) {
  const colours = useMemo(
    () => [winner.colours.primary, winner.colours.secondary, "#e3b01f", "#f4f4f0", "#c98912"],
    [winner.colours.primary, winner.colours.secondary],
  );
  const deciding = championshipDecidingMatch(championship);
  const sides = deciding ? resolveMatchSides(championship, deciding) : null;
  const home = sides?.homeId ? championship.teams.find((team) => team.id === sides.homeId) : undefined;
  const away = sides?.awayId ? championship.teams.find((team) => team.id === sides.awayId) : undefined;

  if (step === "offer") {
    return (
      <div className="season-end season-end--offer">
        <section className="season-end__card" role="dialog" aria-labelledby="new-season-title">
          <p className="kicker">Clare SHC {championship.year}</p>
          <h2 id="new-season-title">The summer is over</h2>
          <p>
            {together
              ? "The Canon Hamilton is decided. Leave this championship, or stay a while with the table and the news."
              : `Start the ${championship.year + 1} championship in charge of ${clubName}? The same panel comes back. Young lads who played and finished in form come on over the winter, quickly at 19 and hardly at all by 25. From 30 the attributes slip, and a summer on the bench costs more than a summer in the jersey.`}
          </p>
          <div className="row-actions">
            <button type="button" className="btn" onClick={onStartNewSeason}>
              {together ? "Leave championship" : "Start a new season"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onStay}>
              Stay a while
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className="season-end season-end--ceremony"
        style={
          {
            "--club-primary": winner.colours.primary,
            "--club-secondary": winner.colours.secondary,
          } as CSSProperties
        }
    >
      <Streamers colours={colours} />
      <div className="season-end__glow" aria-hidden="true" />
      <div className="season-end__stage">
        <p className="kicker">{clubWon ? "You captured the Canon" : "County champions"}</p>
        <CanonTrophy />
        <ClubBadge team={winner} size="xl" variant="crest" />
        <h1>{compactName(winner)}</h1>
        <p className="season-end__irish">{winner.irishName}</p>
        <strong className="season-end__cup">{championship.trophy}</strong>
        {deciding && deciding.homeScore && deciding.awayScore && home && away ? (
          <p className="season-end__score">
            {compactName(home)} {formatScoreWithTotal(deciding.homeScore)}
            {" · "}
            {compactName(away)} {formatScoreWithTotal(deciding.awayScore)}
            {deciding.replayOf ? " · replay" : ""}
          </p>
        ) : null}
        <button type="button" className="btn season-end__continue" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
