import { seedChampionship } from "../data/championship";
import { ClubBadge } from "../components/ClubBadge";
import { compactName } from "../lib/display";
import { teamGroup } from "../lib/resolve";
import { ratedSquad } from "../lib/players";

type Props = {
  onTakeCharge: (clubId: string) => void;
};

export function ClubSelectScreen({ onTakeCharge }: Props) {
  return (
    <div className="screen screen--select">
      <header className="select-hero">
        <p>Capture the Canon</p>
        <h1>Take charge</h1>
        <span>TUS Clare Senior Hurling Championship 2026</span>
      </header>
      <ul className="club-pick">
        {seedChampionship.teams.map((team) => {
          const group = teamGroup(seedChampionship, team.id);
          const stars = [...ratedSquad(team.id)].sort(
            (a, b) => b.ratings.overall - a.ratings.overall,
          );
          const best = stars[0];
          return (
            <li key={team.id}>
              <button type="button" onClick={() => onTakeCharge(team.id)}>
                <ClubBadge team={team} size="lg" variant="crest" />
                <span>
                  <strong>{compactName(team)}</strong>
                  <em>
                    {team.colours.label} · {group?.name}
                    {best ? ` · ${best.name} ${best.ratings.overall}` : ""}
                  </em>
                </span>
                <b>Take charge</b>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
