import type { Team } from "../types";

type Props = {
  team?: Team;
  size?: "sm" | "md";
};

export function ClubBadge({ team, size = "sm" }: Props) {
  const dim = size === "md" ? 28 : 18;
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
