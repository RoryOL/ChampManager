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
    return `${prefix}: ${stageLabel(source.stage, source.round)}`;
  }
  return "TBD";
}

export function matchTitle(championship: Championship, match: Match): string {
  return `${sideLabel(championship, match.home)} v ${sideLabel(championship, match.away)}`;
}
