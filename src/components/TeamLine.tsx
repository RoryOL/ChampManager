import type { Championship, Team } from "../types";
import { compactName } from "../lib/display";
import { ClubBadge } from "./ClubBadge";

type Props = {
  championship: Championship;
  teamId: string | null;
  label: string;
  align?: "left" | "right";
};

export function TeamLine({ championship, teamId, label, align = "left" }: Props) {
  const team: Team | undefined = championship.teams.find((item) => item.id === teamId);
  const name = team ? compactName(team) : label;

  return (
    <span className={`team-line team-line--${align}`}>
      {align === "left" && <ClubBadge team={team} />}
      <span className="team-line__name">{name}</span>
      {align === "right" && <ClubBadge team={team} />}
    </span>
  );
}
