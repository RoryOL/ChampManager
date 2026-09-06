import type { Team } from "../types";
import { ClubCrest } from "./ClubCrest";

type Props = {
  team?: Team;
  size?: "sm" | "md" | "lg";
  /** Crests on team overview; colour splits during matches and compact lists. */
  variant?: "colours" | "crest";
};

const DIM = { sm: 18, md: 28, lg: 44 };

export function ClubBadge({ team, size = "sm", variant = "colours" }: Props) {
  if (variant === "crest") {
    return <ClubCrest team={team} size={size} />;
  }
  const dim = DIM[size];
  return (
    <span
      className={`club-badge club-badge--${size}`}
      style={{
        width: dim,
        height: dim,
        background: `linear-gradient(135deg, ${team?.colours.primary ?? "#1a3d7c"} 50%, ${team?.colours.secondary ?? "#e8c547"} 50%)`,
      }}
      aria-hidden="true"
    />
  );
}
