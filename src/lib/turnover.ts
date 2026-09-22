import { seedChampionship } from "../data/championship";
import { normalizePlayerName } from "../data/playerProfiles";
import type {
  CareerBook,
  CareerRatings,
  GameSave,
  PlayerCareer,
  PlayerGrade,
  PositionFamiliarity,
  PositionLine,
  RatedPlayer,
  Tactics,
} from "../types";
import {
  ADJACENT_LINES,
  ATTRIBUTE_KEYS,
  POSITION_LINES,
  isRoleAttribute,
  positionWeight,
} from "./attributes";
import { clampStat, computeOverall, ratedSquad } from "./players";
import { createRng, seedFrom } from "./rng";

/** A hurler at this overall or better is one of the really good players. */
export const STAR_OVERALL = 17;

const PLAYED_MINUTES = 12;

const FIRST_NAMES = [
  "Cian",
  "Darragh",
  "Eoin",
  "Oisin",
  "Cillian",
  "Tadhg",
  "Rian",
  "Cathal",
  "Diarmuid",
  "Conor",
  "Sean",
  "Jack",
  "Aaron",
  "Evan",
  "Leon",
  "Niall",
  "Shane",
  "Fionn",
  "Ciaran",
  "Padraig",
  "Eanna",
  "Senan",
  "Oran",
  "Dara",
  "Colm",
  "Brian",
  "Luke",
  "Adam",
  "Ryan",
  "Patrick",
  "Michael",
  "David",
  "Mark",
  "Jamie",
  "Alan",
  "Alex",
  "Lorcan",
  "Calum",
  "Barry",
  "Noel",
  "Jason",
  "Kevin",
  "Rory",
  "Ian",
  "Peter",
  "Aidan",
  "Cormac",
  "Odran",
  "Killian",
];

const SURNAMES = [
  "McMahon",
  "McInerney",
  "McNamara",
  "McCarthy",
  "O'Connor",
  "O'Brien",
  "O'Neill",
  "O'Donnell",
  "O'Connell",
  "O'Halloran",
  "O'Loughlin",
  "O'Grady",
  "O'Callaghan",
  "Collins",
  "Kelly",
  "Ryan",
  "Lohan",
  "Galvin",
  "Malone",
  "Hehir",
  "Honan",
  "Duggan",
  "Reidy",
  "Moroney",
  "Keane",
  "Neville",
  "Clancy",
  "Meaney",
  "Gunning",
  "Walsh",
  "Griffin",
  "Power",
  "Hayes",
  "Doyle",
  "Brennan",
  "Cahill",
  "Minogue",
  "Earls",
  "Crowe",
  "Considine",
  "Killeen",
  "Hassett",
  "Mungovan",
  "Neylon",
  "Cullinan",
  "Smyth",
  "Leyden",
  "Mescal",
  "Arthur",
  "Hegarty",
  "Quinn",
  "Downes",
  "Fitzgerald",
  "Fitzpatrick",
  "Kennedy",
  "Corry",
  "Phelan",
  "Lynch",
  "Fahy",
  "Carey",
  "Flynn",
  "Loughnane",
  "Shanahan",
  "Golden",
  "Morey",
  "Purcell",
  "Mulready",
  "Deasy",
  "Macnamara",
  "Eustace",
  "Chaplin",
  "Coote",
  "Kirby",
  "Hogan",
  "Quilligan",
  "Stritch",
  "Costelloe",
  "Ball",
  "Sheedy",
  "Rynne",
  "Flanagan",
  "Conlon",
  "Tuohy",
];

export type PanelDeparture = {
  name: string;
  age: number;
  overall: number;
};

export type PanelArrival = {
  name: string;
  age: number;
  overall: number;
  position: PositionLine;
  promising: boolean;
};

export type PanelMove = {
  clubId: string;
  retired: PanelDeparture[];
  arrived: PanelArrival[];
};

/**
 * Chance a player calls it a day, given the age he was during the season,
 * games he played, games his club played, and the overall he would bring back.
 * Thirty and under do not retire. With no minutes recorded for the club, nobody
 * is judged to have sat the summer out.
 */
export function retirementChance(age: number, games: number, clubGames: number, overall: number): number {
  if (age <= 30 || clubGames <= 0) return 0;
  const ageWeight = Math.min(1, (age - 30) / 11);
  const share = Math.min(1, Math.max(0, games) / clubGames);
  const unused = games <= 0 ? 1 : share >= 0.85 ? 0 : share >= 0.5 ? 0.18 : 0.32;
  const low = overall <= 10 ? 1 : overall >= STAR_OVERALL ? 0 : (16 - Math.min(16, overall)) / 6;
  const fromBench = unused * (0.55 + 0.4 * ageWeight);
  const fromAge = (1 - unused) * (0.03 + 0.34 * ageWeight ** 1.15);
  const fromStats = low * (0.08 + 0.2 * unused + 0.08 * ageWeight);
  const starDiscount = overall >= STAR_OVERALL ? 0.06 * (1 - unused) : 0;
  return Math.max(0, Math.min(0.95, fromBench + fromAge + fromStats - starDiscount));
}

export function clubGamesPlayed(
  reports: Record<string, { players?: { teamId?: string; minutes?: number }[] } | undefined>,
  teamId: string,
): number {
  let games = 0;
  for (const report of Object.values(reports)) {
    const played = report?.players?.some((player) => player.teamId === teamId && (player.minutes ?? 0) >= PLAYED_MINUTES);
    if (played) games += 1;
  }
  return games;
}

function gamesFor(
  reports: Record<string, { players?: { teamId?: string; name?: string; minutes?: number }[] } | undefined>,
  teamId: string,
  name: string,
): number {
  let games = 0;
  for (const report of Object.values(reports)) {
    const row = report?.players?.find((player) => player.teamId === teamId && player.name === name);
    if (row && (row.minutes ?? 0) >= PLAYED_MINUTES) games += 1;
  }
  return games;
}

function gradeFor(overall: number): PlayerGrade {
  if (overall >= 17) return "A";
  if (overall >= 14) return "B";
  if (overall >= 11) return "C";
  return "D";
}

function recruitAge(random: () => number, promising: boolean): number {
  const roll = random();
  if (promising) {
    if (roll < 0.4) return 18;
    if (roll < 0.75) return 19;
    return 20;
  }
  if (roll < 0.28) return 18;
  if (roll < 0.58) return 19;
  if (roll < 0.82) return 20;
  return 21;
}

function ordinaryOverall(random: () => number): number {
  const roll = random();
  if (roll < 0.12) return 8;
  if (roll < 0.42) return 9 + Math.floor(random() * 2);
  if (roll < 0.78) return 11 + Math.floor(random() * 2);
  if (roll < 0.94) return 13 + Math.floor(random() * 2);
  return 15;
}

function intakeCount(gap: number, random: () => number): number {
  if (gap >= 3) return gap - (random() < 0.35 ? 1 : 0);
  if (gap === 2) return random() < 0.75 ? 2 : 1;
  if (gap === 1) return random() < 0.6 ? 1 : 0;
  if (gap === 0) return random() < 0.05 ? 1 : 0;
  return 0;
}

export function ratingsForOverall(
  position: PositionLine,
  overall: number,
  seed: number,
  young: boolean,
): { ratings: CareerRatings; familiarity: PositionFamiliarity } {
  const random = createRng(seed);
  const familiarity = {} as PositionFamiliarity;
  for (const line of POSITION_LINES) {
    if (line === position) familiarity[line] = 16 + Math.floor(random() * 3);
    else if ((ADJACENT_LINES[position] ?? []).includes(line)) familiarity[line] = 11 + Math.floor(random() * 4);
    else familiarity[line] = 5 + Math.floor(random() * 4);
  }
  const ratings = {} as CareerRatings;
  for (const key of ATTRIBUTE_KEYS) {
    const weight = positionWeight(position, key);
    let center = 6 + (overall - 6) * (0.45 + 0.55 * weight);
    if (young && (key === "speed" || key === "acceleration")) center += 1.4;
    if (young && (key === "composure" || key === "underPressure" || key === "vision")) center -= 1.6;
    ratings[key] = clampStat(Math.round(center + random() * 2 - 1));
  }
  const role = ATTRIBUTE_KEYS.filter((key) => isRoleAttribute(position, key));
  const pool = role.length > 0 ? role : ATTRIBUTE_KEYS;
  for (let step = 0; step < 24; step += 1) {
    const current = computeOverall(ratings, familiarity, position);
    if (current === overall) break;
    if (current < overall) {
      const key = [...pool].filter((item) => ratings[item] < 19).sort((a, b) => ratings[a] - ratings[b])[0];
      if (!key) break;
      ratings[key] = clampStat(ratings[key] + 1);
    } else {
      const key = [...pool].filter((item) => ratings[item] > 5).sort((a, b) => ratings[b] - ratings[a])[0];
      if (!key) break;
      ratings[key] = clampStat(ratings[key] - 1);
    }
  }
  return { ratings, familiarity };
}

function takenNames(careers: CareerBook): Set<string> {
  const taken = new Set<string>();
  for (const team of seedChampionship.teams) {
    for (const player of ratedSquad(team.id)) taken.add(normalizePlayerName(player.name));
  }
  for (const book of Object.values(careers)) {
    for (const name of Object.keys(book)) taken.add(normalizePlayerName(name));
  }
  return taken;
}

function inventName(random: () => number, taken: Set<string>): string | null {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)] ?? "Cian";
    const last = SURNAMES[Math.floor(random() * SURNAMES.length)] ?? "Hehir";
    const name = `${first} ${last}`;
    const key = normalizePlayerName(name);
    if (taken.has(key)) continue;
    taken.add(key);
    return name;
  }
  return null;
}

function nextNumber(used: Set<number>): number {
  let number = 16;
  while (used.has(number)) number += 1;
  return number;
}

function makeRecruit(
  position: PositionLine,
  promising: boolean,
  random: () => number,
  taken: Set<string>,
  numbers: Set<number>,
  seed: number,
): { name: string; career: PlayerCareer; arrival: PanelArrival } | null {
  const name = inventName(random, taken);
  if (!name) return null;
  const age = recruitAge(random, promising);
  const overall = promising ? (random() < 0.7 ? 17 : 18) : ordinaryOverall(random);
  const number = nextNumber(numbers);
  numbers.add(number);
  const card = ratingsForOverall(position, overall, seedFrom(`${seed}:${name}:${position}`), true);
  const shown = computeOverall(card.ratings, card.familiarity, position);
  const career: PlayerCareer = {
    age,
    ratings: card.ratings,
    joined: {
      number,
      position,
      grade: gradeFor(shown),
      familiarity: card.familiarity,
    },
  };
  return {
    name,
    career,
    arrival: { name, age, overall: shown, position, promising },
  };
}

function copyRetired(existing: Record<string, PlayerCareer> | undefined, book: Record<string, PlayerCareer>) {
  if (!existing) return;
  for (const [name, career] of Object.entries(existing)) {
    if (career.retired) book[name] = career;
  }
}

/** Keep retired names and recruit cards when the winter book is rewritten. */
export function carryPanel(existing: Record<string, PlayerCareer> | undefined, book: Record<string, PlayerCareer>) {
  copyRetired(existing, book);
  if (!existing) return;
  for (const [name, career] of Object.entries(book)) {
    if (!career.joined && existing[name]?.joined) book[name] = { ...career, joined: existing[name].joined };
  }
}

/**
 * Retire over-30 players from the season just finished, then bring in youths.
 * A departed star is replaced by a promising 18–20 year old on that club.
 * Other recruits fill toward the original panel size without matching the departures one for one.
 */
export function settlePanels(options: {
  careers: CareerBook;
  reports: GameSave["reports"];
  seed: number;
  year: number;
  balance?: GameSave["balance"];
}): { careers: CareerBook; moves: PanelMove[] } {
  const careers: CareerBook = {};
  for (const [clubId, book] of Object.entries(options.careers)) {
    careers[clubId] = { ...book };
  }
  const taken = takenNames(careers);
  const moves: PanelMove[] = [];

  for (const team of seedChampionship.teams) {
    const clubId = team.id;
    const book = { ...(careers[clubId] ?? {}) };
    const squad = ratedSquad(clubId, { seed: options.seed, balance: options.balance, careers });
    const naturalSize = ratedSquad(clubId, options.seed).length;
    const clubGames = clubGamesPlayed(options.reports, clubId);
    const numbers = new Set(squad.map((player) => player.number));
    const random = createRng(seedFrom(`${options.seed}:${options.year}:${clubId}:turnover`));
    const retired: PanelDeparture[] = [];
    const retiring = new Set<string>();

    for (const player of squad) {
      const seasonAge = player.age - 1;
      const games = gamesFor(options.reports, clubId, player.name);
      const chance = retirementChance(seasonAge, games, clubGames, player.ratings.overall);
      if (chance <= 0 || random() >= chance) continue;
      retiring.add(player.name);
      retired.push({ name: player.name, age: player.age, overall: player.ratings.overall });
      const prior = book[player.name];
      if (prior) book[player.name] = { ...prior, retired: true };
    }

    const arrived: PanelArrival[] = [];
    const starRetirees = retired.filter((player) => player.overall >= STAR_OVERALL);
    const openLines = retired.map((player) => {
      const found = squad.find((item) => item.name === player.name);
      return found?.position ?? "MF";
    });

    const add = (position: PositionLine, promising: boolean) => {
      const recruit = makeRecruit(
        position,
        promising,
        random,
        taken,
        numbers,
        options.seed + options.year,
      );
      if (!recruit) return;
      book[recruit.name] = recruit.career;
      arrived.push(recruit.arrival);
    };

    for (const star of starRetirees) {
      const found = squad.find((item) => item.name === star.name);
      add(found?.position ?? "HF", true);
    }

    const staying = squad.length - retiring.size;
    const gap = naturalSize - (staying + arrived.length);
    const extras = intakeCount(gap, random);
    for (let index = 0; index < extras; index += 1) {
      const position = openLines[index] ?? POSITION_LINES[Math.floor(random() * POSITION_LINES.length)] ?? "MF";
      add(position, false);
    }

    careers[clubId] = book;
    if (retired.length > 0 || arrived.length > 0) moves.push({ clubId, retired, arrived });
  }

  return { careers, moves };
}

export function scrubTactics(tactics: Tactics, names: Set<string>): Tactics {
  const keep = (name?: string) => (name && names.has(name) ? name : undefined);
  const manMarks: Record<string, string> = {};
  for (const [marker, target] of Object.entries(tactics.manMarks ?? {})) {
    if (!names.has(marker)) continue;
    manMarks[marker] = target;
  }
  return {
    ...tactics,
    longFreeTaker: keep(tactics.longFreeTaker),
    shortFreeTaker: keep(tactics.shortFreeTaker),
    sidelineTaker: keep(tactics.sidelineTaker),
    puckoutTarget: keep(tactics.puckoutTarget),
    manMarks: Object.keys(manMarks).length > 0 ? manMarks : undefined,
  };
}

export function activeNames(squad: readonly RatedPlayer[]): Set<string> {
  return new Set(squad.map((player) => player.name));
}
