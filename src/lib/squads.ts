import { extraPanelFor, normalizePlayerName } from "../data/playerProfiles";
import { matchLineups } from "../data/lineups";
import type { Player, SquadPlayer, TeamLineup } from "../types";

function keyFor(player: Player): string {
  return normalizePlayerName(player.name);
}

export function lineupFor(matchId: string, teamId: string): TeamLineup | undefined {
  return matchLineups.find((lineup) => lineup.matchId === matchId && lineup.teamId === teamId);
}

export function lineupsForMatch(matchId: string): TeamLineup[] {
  return matchLineups.filter((lineup) => lineup.matchId === matchId);
}

export function lineupsForTeam(teamId: string): TeamLineup[] {
  return matchLineups.filter((lineup) => lineup.teamId === teamId);
}

export function latestLineup(teamId: string): TeamLineup | undefined {
  const lineups = lineupsForTeam(teamId);
  return lineups.at(-1);
}

export function squadFor(teamId: string): SquadPlayer[] {
  const seen = new Map<string, SquadPlayer>();

  for (const lineup of lineupsForTeam(teamId)) {
    for (const player of lineup.starters) {
      const key = keyFor(player);
      const current = seen.get(key);
      if (current) {
        current.number = player.number;
        current.name = player.name;
        current.starts += 1;
        current.appearances += 1;
      } else {
        seen.set(key, { ...player, starts: 1, appearances: 1 });
      }
    }
    for (const player of lineup.subs) {
      const key = keyFor(player);
      const current = seen.get(key);
      if (current) {
        current.number = player.number;
        current.name = player.name;
        current.appearances += 1;
      } else {
        seen.set(key, { ...player, starts: 0, appearances: 1 });
      }
    }
  }

  const usedNumbers = new Set([...seen.values()].map((player) => player.number));
  let spare = 16;
  const nextNumber = () => {
    while (usedNumbers.has(spare)) spare += 1;
    const number = spare;
    usedNumbers.add(number);
    spare += 1;
    return number;
  };

  for (const extra of extraPanelFor(teamId)) {
    const key = keyFor(extra);
    if (seen.has(key)) continue;
    const number =
      extra.number > 0 && !usedNumbers.has(extra.number) ? extra.number : nextNumber();
    usedNumbers.add(number);
    seen.set(key, { name: extra.name, number, starts: 0, appearances: 0 });
  }

  return [...seen.values()].sort((a, b) => {
    if (b.starts !== a.starts) return b.starts - a.starts;
    if (b.appearances !== a.appearances) return b.appearances - a.appearances;
    return a.number - b.number || a.name.localeCompare(b.name);
  });
}

export const FORMATION_ROWS = [
  { label: "Goalkeeper", start: 0, end: 1 },
  { label: "Full-back line", start: 1, end: 4 },
  { label: "Half-back line", start: 4, end: 7 },
  { label: "Midfield", start: 7, end: 9 },
  { label: "Half-forward line", start: 9, end: 12 },
  { label: "Full-forward line", start: 12, end: 15 },
] as const;
