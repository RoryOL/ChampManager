import type { Championship, Match, Team, TeamRef } from "../types";
import { stageLabel } from "./scoring";
import { resolveTeamId } from "./resolve";

export function teamName(championship: Championship, teamId: string | null): string {
  if (!teamId) return "TBD";
  return championship.teams.find((team) => team.id === teamId)?.name ?? "TBD";
}

export function compactName(team: Team): string {
  if (team.id === "st-josephs") return "St Joseph's";
  if (team.id === "newmarket") return "Newmarket";
  if (team.id === "ocallaghans-mills") return "The Mills";
  if (team.id === "inagh-kilnamona") return "Inagh-Kilnamona";
  return team.name;
}

function hexLuma(hex: string): number {
  const raw = hex.replace("#", "");
  if (raw.length < 6) return 0;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function isDarkHex(hex: string): boolean {
  return hexLuma(hex) < 0.58;
}

export function teamAccent(team?: Team): {
  primary: string;
  secondary: string;
  ink: string;
  stripe: string;
  wash: string;
} {
  const primary = team?.colours.primary ?? "#5c7a99";
  const secondary = team?.colours.secondary ?? "#e8c547";
  const luma = hexLuma(primary);
  const dark = luma < 0.58;
  return {
    primary,
    secondary,
    ink: dark ? secondary : primary,
    stripe: luma < 0.18 ? secondary : primary,
    // Near-black jerseys (Ballyea) need the gold wash or scores vanish on the navy pitch.
    wash: luma < 0.12 ? `${secondary}36` : dark ? `${primary}b8` : `${primary}2e`,
  };
}

export function sideLabel(championship: Championship, ref: TeamRef): string {
  const resolved = resolveTeamId(championship, ref);
  if (resolved) return teamName(championship, resolved);

  if (ref.type === "group-position") {
    const place = ["winners", "runners-up", "3rd", "4th"][ref.position - 1];
    return `Group ${ref.groupId} ${place}`;
  }
  if (ref.type === "winner" || ref.type === "loser") {
    const source = championship.matches.find((match) => match.id === ref.matchId);
    const prefix = ref.type === "winner" ? "Winner" : "Loser";
    if (!source) return `${prefix} TBD`;
    const homeId = resolveTeamId(championship, source.home);
    const awayId = resolveTeamId(championship, source.away);
    if (homeId && awayId) {
      return `${prefix}: ${teamName(championship, homeId)} / ${teamName(championship, awayId)}`;
    }
    return `${prefix}: ${stageLabel(source.stage, source.round)}`;
  }
  return "TBD";
}

export function matchTitle(championship: Championship, match: Match): string {
  return `${sideLabel(championship, match.home)} v ${sideLabel(championship, match.away)}`;
}

export function windSidesFor(home?: Team, away?: Team): { first: string; second: string } {
  return {
    first: home ? compactName(home) : "one side",
    second: away ? compactName(away) : "the other side",
  };
}
