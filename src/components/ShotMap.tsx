import type { MatchClimate, ShotAttempt, Team } from "../types";
import { compactName, teamAccent } from "../lib/display";
import { PITCH_LENGTH, PITCH_WIDTH } from "../lib/shooting";
import { crossWind, parallelWind, windStrengthLabel } from "../lib/weather";

type Props = {
  shots: ShotAttempt[];
  home: Team | undefined;
  away: Team | undefined;
  homeId: string;
  awayId: string;
  climate?: MatchClimate;
};

export function ShotMap({ shots, home, away, homeId, awayId, climate }: Props) {
  const homeAccent = teamAccent(home);
  const awayAccent = teamAccent(away);
  const along = climate ? parallelWind(climate) : 0;
  const across = climate ? crossWind(climate) : 0;
  const arrowX = 45 + across * (along >= 0 ? 10 : -10);
  const arrowY = 72 - along * 40;
  return (
    <section className="shot-map" aria-label="Shot map">
      <h3>Shot map</h3>
      <p className="hint hint--tight">
        Filled dots scored. Rings missed. {home ? compactName(home) : "The first-named side"} shoot toward
        the top in the first half.
      </p>
      <svg className="shot-map__pitch" viewBox={`0 0 ${PITCH_WIDTH} ${PITCH_LENGTH}`} role="img">
        <rect className="shot-map__grass" x="0" y="0" width={PITCH_WIDTH} height={PITCH_LENGTH} rx="2" />
        <line className="shot-map__line" x1="0" y1={PITCH_LENGTH / 2} x2={PITCH_WIDTH} y2={PITCH_LENGTH / 2} />
        <rect className="shot-map__box" x="20" y="0" width="50" height="21" />
        <rect className="shot-map__box" x="20" y={PITCH_LENGTH - 21} width="50" height="21" />
        <rect className="shot-map__goal" x="41.75" y="-1.2" width="6.5" height="2.2" />
        <rect className="shot-map__goal" x="41.75" y={PITCH_LENGTH - 1} width="6.5" height="2.2" />
        {climate && climate.windStrength >= 18 ? (
          <g className="shot-map__wind">
            <line x1="45" y1="72" x2={arrowX} y2={arrowY} />
            <circle cx="45" cy="72" r="1.6" />
          </g>
        ) : null}
        {shots.map((shot, index) => (
          <circle
            key={`${shot.minute}-${shot.playerName}-${index}`}
            className={shot.scored ? "shot-map__hit" : "shot-map__miss"}
            cx={shot.x}
            cy={shot.y}
            r={shot.kind === "goal" ? 2.4 : 1.8}
            fill={shot.scored ? (shot.teamId === homeId ? homeAccent.ink : awayAccent.ink) : "none"}
            stroke={shot.teamId === awayId ? awayAccent.ink : homeAccent.ink}
          />
        ))}
      </svg>
      <p className="shot-map__legend">
        <span style={{ color: homeAccent.ink }}>{home ? compactName(home) : "First side"}</span>
        {" · "}
        <span style={{ color: awayAccent.ink }}>{away ? compactName(away) : "Second side"}</span>
        {climate ? ` · ${windStrengthLabel(climate.windStrength)}` : ""}
      </p>
    </section>
  );
}
