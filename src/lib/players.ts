import type { PlayerRatings, RatedPlayer, Tactics, TeamSheet } from "../types";
import { latestLineup, squadFor } from "./squads";

const POSITIONS = [
  "GK",
  "FB",
  "FB",
  "FB",
  "HB",
  "HB",
  "HB",
  "MF",
  "MF",
  "HF",
  "HF",
  "HF",
  "FF",
  "FF",
  "FF",
];

const STAR_FLOOR: Record<string, number> = {
  "Tony Kelly": 19,
  "Shane O'Donnell": 18,
  "Peter Duggan": 17,
  "John Conlon": 17,
  "Mark Rodgers": 17,
  "Aidan McCarthy": 16,
  "Danny Russell": 16,
  "David Fitzgerald": 16,
  "Shane McGrath": 16,
  "Rian Considine": 16,
  "Diarmuid Ryan": 16,
  "Jamie Shanahan": 16,
  "Conor McGrath": 15,
  "Podge Collins": 15,
  "Aaron Cunningham": 15,
  "Conor Cleary": 15,
  "Micheál O'Loughlin": 15,
  "Ian Galvin": 15,
  "David Reidy": 15,
  "Seadna Morey": 15,
  "Aron Shanagher": 14,
  "Adam Hogan": 14,
  "Eibhear Quilligan": 14,
  "Marco Cleary": 14,
  "Luca Cleary": 14,
  "Cathal Malone": 14,
  "Paul Rodgers": 14,
  "Tom O'Rourke": 14,
  "Sean O'Loughlin": 14,
  "Daire Keane": 13,
  "Pearse Lillis": 13,
  "Niall Deasy": 13,
};

export const DEFAULT_TACTICS: Tactics = {
  mentality: "balanced",
  style: "possession",
  pressing: "medium",
};

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function stat(seed: number, min: number, max: number): number {
  const span = max - min + 1;
  return min + (seed % span);
}

export function positionForIndex(index: number): string {
  return POSITIONS[index] ?? "SUB";
}

export function ratePlayer(teamId: string, name: string, index: number): PlayerRatings {
  const seed = hash(`${teamId}:${name.toLowerCase()}`);
  const position = positionForIndex(index);
  const floor = STAR_FLOOR[name] ?? 0;
  const base = Math.max(floor - 2, stat(seed, 10, 15));
  const handling = clamp(position === "GK" ? base + 3 : base - 3 + stat(seed >> 3, 0, 2));
  const tackling = clamp(position === "GK" ? base - 2 : /B$/.test(position) ? base + 2 : base);
  const pace = clamp(base + stat(seed >> 6, -1, 2));
  const stamina = clamp(position === "MF" ? base + 2 : base + stat(seed >> 8, -1, 1));
  const striking = clamp(position === "GK" ? base - 1 : /F$/.test(position) ? base + 2 : base);
  const scoring = clamp(/F$/.test(position) ? Math.max(base + 1, floor) : base - 2);
  const passing = clamp(base + stat(seed >> 10, -1, 2));
  const overall = clamp(
    Math.round(
      (handling + tackling + pace + stamina + striking + scoring + passing) / 7,
    ),
  );
  return {
    handling,
    tackling,
    pace,
    stamina,
    striking,
    scoring,
    passing,
    overall: Math.max(overall, floor || overall),
  };
}

function clamp(value: number): number {
  return Math.max(1, Math.min(20, value));
}

export function ratedSquad(teamId: string): RatedPlayer[] {
  const lineup = latestLineup(teamId);
  const order = [
    ...(lineup?.starters.map((player) => player.name) ?? []),
    ...(lineup?.subs.map((player) => player.name) ?? []),
  ];
  const squad = squadFor(teamId);
  return squad.map((player) => {
    const index = Math.max(0, order.indexOf(player.name));
    return {
      ...player,
      position: positionForIndex(index),
      ratings: ratePlayer(teamId, player.name, index),
    };
  });
}

export function defaultSheet(teamId: string): TeamSheet {
  const lineup = latestLineup(teamId);
  return {
    starters: (lineup?.starters ?? []).map((player) => player.name).slice(0, 15),
    subs: (lineup?.subs ?? []).map((player) => player.name).slice(0, 5),
  };
}

export function sheetPlayers(teamId: string, sheet: TeamSheet): RatedPlayer[] {
  const squad = ratedSquad(teamId);
  const byName = new Map(squad.map((player) => [player.name, player]));
  return sheet.starters
    .map((name) => byName.get(name))
    .filter((player): player is RatedPlayer => Boolean(player));
}

export function sideStrength(teamId: string, sheet: TeamSheet, tactics: Tactics): {
  attack: number;
  defence: number;
} {
  const xv = sheetPlayers(teamId, sheet);
  const attackPool = xv.filter((player) => /F$|MF/.test(player.position));
  const defencePool = xv.filter((player) => /B$|GK/.test(player.position));
  const attack =
    average(attackPool.map((player) => (player.ratings.scoring + player.ratings.striking) / 2)) || 12;
  const defence =
    average(defencePool.map((player) => (player.ratings.tackling + player.ratings.handling) / 2)) || 12;

  let attackMod = 0;
  let defenceMod = 0;
  if (tactics.mentality === "attacking") {
    attackMod += 1.4;
    defenceMod -= 0.8;
  }
  if (tactics.mentality === "contain") {
    attackMod -= 0.9;
    defenceMod += 1.3;
  }
  if (tactics.style === "direct") attackMod += 0.5;
  if (tactics.pressing === "high") {
    attackMod += 0.4;
    defenceMod -= 0.3;
  }
  if (tactics.pressing === "low") defenceMod += 0.4;

  return { attack: attack + attackMod, defence: defence + defenceMod };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
