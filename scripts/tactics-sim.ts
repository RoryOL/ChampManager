/**
 * Probe how puck-out length, middle-third stacking, and attacking vs
 * defensive setups behave in the match engine. Run with:
 *   npx vite-node scripts/tactics-sim.ts
 */
import { seedChampionship } from "../src/data/championship";
import { simulateMatch } from "../src/lib/matchEngine";
import { compactName } from "../src/lib/display";
import {
  DEFAULT_TACTICS,
  defaultSheet,
  sheetPlayers,
  sideProfile,
} from "../src/lib/players";
import { scoreTotal } from "../src/lib/scoring";
import type { RatedPlayer, Tactics, TeamSheet } from "../src/types";

const CLIMATE = { sky: "sunny" as const, windStrength: 8, windAngle: 90 };
const SEEDS = 80;
const MATCH_ID = "sim-lab";

const LONG_PUCK: Tactics = { ...DEFAULT_TACTICS, puckout: 90, build: 55 };
const SHORT_PUCK: Tactics = { ...DEFAULT_TACTICS, puckout: 12, build: 40 };
const ATTACKING: Tactics = {
  ...DEFAULT_TACTICS,
  mentality: "attacking",
  shape: "traditional",
  pressure: 72,
  aggression: 58,
  build: 48,
  puckout: 55,
};
const DEFENSIVE: Tactics = {
  ...DEFAULT_TACTICS,
  mentality: "contain",
  shape: "sweeper",
  pressure: 22,
  aggression: 32,
  build: 38,
  puckout: 55,
};
const BALANCED: Tactics = { ...DEFAULT_TACTICS };

function aerialScore(player: RatedPlayer): number {
  return player.ratings.highFielding + player.ratings.aerialReach + player.ratings.strength;
}

function stackSheet(teamId: string, zone: "middle" | "contest" | "backs"): TeamSheet {
  const sheet = defaultSheet(teamId);
  const xv = sheetPlayers(teamId, sheet);
  if (xv.length < 15) return sheet;
  const gk = xv[0]!;
  const rest = xv.slice(1);
  const ranked = [...rest].sort((a, b) => aerialScore(b) - aerialScore(a));
  const pick = (n: number) => ranked.splice(0, n);
  let outfield: RatedPlayer[];
  if (zone === "contest") {
    // Best aerials into HB + MF (the puck-out contest).
    const contest = pick(5);
    outfield = [...ranked.slice(0, 3), ...contest, ...ranked.slice(3)];
  } else if (zone === "middle") {
    // Best aerials into MF + HF (two mids, three half-forwards).
    const middle = pick(5);
    outfield = [...ranked.slice(0, 6), ...middle, ...ranked.slice(6)];
  } else {
    const backs = pick(6);
    outfield = [...backs, ...ranked];
  }
  return {
    starters: [gk.name, ...outfield.map((player) => player.name)],
    subs: sheet.subs,
  };
}

type Totals = {
  n: number;
  homeTotal: number;
  awayTotal: number;
  homeGoals: number;
  awayGoals: number;
  homePoints: number;
  awayPoints: number;
  homePuckWon: number;
  awayPuckWon: number;
  homeHfWon: number;
  homeHfAtt: number;
  awayHfWon: number;
  awayHfAtt: number;
  homeShots: number;
  awayShots: number;
  homeFielded: number;
  homeBroken: number;
  homeShortTurned: number;
  wins: number;
  draws: number;
  losses: number;
};

function emptyTotals(): Totals {
  return {
    n: 0,
    homeTotal: 0,
    awayTotal: 0,
    homeGoals: 0,
    awayGoals: 0,
    homePoints: 0,
    awayPoints: 0,
    homePuckWon: 0,
    awayPuckWon: 0,
    homeHfWon: 0,
    homeHfAtt: 0,
    awayHfWon: 0,
    awayHfAtt: 0,
    homeShots: 0,
    awayShots: 0,
    homeFielded: 0,
    homeBroken: 0,
    homeShortTurned: 0,
    wins: 0,
    draws: 0,
    losses: 0,
  };
}

function addMatch(
  totals: Totals,
  homeId: string,
  result: ReturnType<typeof simulateMatch>,
): void {
  totals.n += 1;
  totals.homeTotal += scoreTotal(result.homeScore);
  totals.awayTotal += scoreTotal(result.awayScore);
  totals.homeGoals += result.homeScore.goals;
  totals.awayGoals += result.awayScore.goals;
  totals.homePoints += result.homeScore.points;
  totals.awayPoints += result.awayScore.points;
  totals.homePuckWon += result.homeStats.puckoutsWon;
  totals.awayPuckWon += result.awayStats.puckoutsWon;
  totals.homeHfWon += result.homeStats.highFieldingWon;
  totals.homeHfAtt += result.homeStats.highFieldingAttempted;
  totals.awayHfWon += result.awayStats.highFieldingWon;
  totals.awayHfAtt += result.awayStats.highFieldingAttempted;
  totals.homeShots += result.homeStats.shots;
  totals.awayShots += result.awayStats.shots;
  const ht = scoreTotal(result.homeScore);
  const at = scoreTotal(result.awayScore);
  if (ht > at) totals.wins += 1;
  else if (ht < at) totals.losses += 1;
  else totals.draws += 1;
  for (const event of result.events) {
    if (event.kind !== "puckout" || event.teamId !== homeId) continue;
    if (/fields the puck-out/i.test(event.text)) totals.homeFielded += 1;
    else if (/broken/i.test(event.text)) totals.homeBroken += 1;
    else if (/turned over/i.test(event.text)) totals.homeShortTurned += 1;
  }
}

function avg(total: number, n: number, digits = 1): string {
  return n ? (total / n).toFixed(digits) : "–";
}

function pct(part: number, whole: number): string {
  return whole ? `${((100 * part) / whole).toFixed(0)}%` : "–";
}

function scoreCell(t: Totals): string {
  return `${avg(t.homeGoals, t.n, 1)}-${avg(t.homePoints, t.n, 1)} (${avg(t.homeTotal, t.n, 1)})`;
}

function oppScoreCell(t: Totals): string {
  return `${avg(t.awayGoals, t.n, 1)}-${avg(t.awayPoints, t.n, 1)} (${avg(t.awayTotal, t.n, 1)})`;
}

function runBatch(
  homeId: string,
  awayId: string,
  homeTactics: Tactics,
  awayTactics: Tactics,
  homeSheet?: TeamSheet,
  awaySheet?: TeamSheet,
): Totals {
  const totals = emptyTotals();
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const result = simulateMatch({
      matchId: MATCH_ID,
      homeId,
      awayId,
      homeTactics,
      awayTactics,
      homeSheet,
      awaySheet,
      climate: CLIMATE,
      seed,
    });
    addMatch(totals, homeId, result);
  }
  return totals;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : `${value}${" ".repeat(width - value.length)}`;
}

function teamLabel(id: string): string {
  const team = seedChampionship.teams.find((row) => row.id === id);
  return team ? compactName(team) : id;
}

function printTable(title: string, headers: string[], rows: string[][]): void {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => (row[i] ?? "").length)),
  );
  console.log(`\n## ${title}`);
  console.log(headers.map((header, i) => pad(header, widths[i]!)).join("  "));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i]!)).join("  "));
  }
}

function lineupAerial(teamId: string, sheet: TeamSheet): { contest: number; middle: number } {
  const xv = sheetPlayers(teamId, sheet);
  const mean = (idxs: number[]) => {
    const vals = idxs.map((i) => (xv[i] ? aerialScore(xv[i]!) / 3 : 0));
    return vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
  };
  return { contest: mean([4, 5, 6, 7, 8]), middle: mean([7, 8, 9, 10, 11]) };
}

const clubs = seedChampionship.teams.map((team) => team.id);

console.log(`# Engine tactics lab  (${SEEDS} matches per cell, calm crosswind)`);

const scout = clubs
  .map((id) => {
    const sheet = defaultSheet(id);
    const profile = sideProfile(id, sheet, DEFAULT_TACTICS, {}, undefined, CLIMATE);
    const lines = lineupAerial(id, sheet);
    return { id, name: teamLabel(id), profile, lines };
  })
  .sort((a, b) => b.profile.aerial - a.profile.aerial);

printTable(
  "Club aerial / attack / defence on default tactics",
  ["Club", "Aerial", "Puck reach", "Attack", "Defence", "HB+MF aerial", "MF+HF aerial"],
  scout.map((row) => [
    row.name,
    row.profile.aerial.toFixed(1),
    row.profile.puckout.toFixed(1),
    row.profile.attack.toFixed(1),
    row.profile.defence.toFixed(1),
    row.lines.contest.toFixed(1),
    row.lines.middle.toFixed(1),
  ]),
);

const focus = "eire-og";
const strongAerial = scout[0]!.id === focus ? scout[1]!.id : scout[0]!.id;
const weakAerial = scout[scout.length - 1]!.id === focus ? scout[scout.length - 2]!.id : scout[scout.length - 1]!.id;
const midAerial = scout[Math.floor(scout.length / 2)]!.id;

console.log(
  `\nFocus club: ${teamLabel(focus)}. Strong aerial opp: ${teamLabel(strongAerial)}. Weak aerial opp: ${teamLabel(weakAerial)}. Mid: ${teamLabel(midAerial)}.`,
);

const defaultXv = defaultSheet(focus);
const stackedMiddle = stackSheet(focus, "middle");
const stackedContest = stackSheet(focus, "contest");
const stackedBacks = stackSheet(focus, "backs");

printTable(
  `${teamLabel(focus)} lineup aerials after stacking`,
  ["Lineup", "HB+MF (puck-out contest)", "MF+HF (user question)"],
  (
    [
      ["Championship XV", defaultXv],
      ["Best aerials in MF+HF", stackedMiddle],
      ["Best aerials in HB+MF", stackedContest],
      ["Best aerials in the backs", stackedBacks],
    ] as const
  ).map(([label, sheet]) => {
    const lines = lineupAerial(focus, sheet);
    return [label, lines.contest.toFixed(1), lines.middle.toFixed(1)];
  }),
);

const opps: { id: string; tactics: Tactics; label: string }[] = [
  { id: strongAerial, tactics: DEFAULT_TACTICS, label: `${teamLabel(strongAerial)} (strong aerial, default)` },
  { id: weakAerial, tactics: DEFAULT_TACTICS, label: `${teamLabel(weakAerial)} (weak aerial, default)` },
  {
    id: strongAerial,
    tactics: { ...DEFAULT_TACTICS, mentality: "contain", shape: "sweeper", pressure: 70 },
    label: `${teamLabel(strongAerial)} sweeper + contain`,
  },
  {
    id: weakAerial,
    tactics: { ...DEFAULT_TACTICS, mentality: "attacking", shape: "traditional", pressure: 30 },
    label: `${teamLabel(weakAerial)} open 6-2-6`,
  },
];

const puckRows: string[][] = [];
for (const lineup of [
  { label: "Championship XV", sheet: defaultXv },
  { label: "Stack MF+HF", sheet: stackedMiddle },
  { label: "Stack HB+MF", sheet: stackedContest },
] as const) {
  for (const puck of [
    { label: "long 90", tactics: LONG_PUCK },
    { label: "short 12", tactics: SHORT_PUCK },
  ] as const) {
    for (const opp of opps) {
      const t = runBatch(focus, opp.id, puck.tactics, opp.tactics, lineup.sheet);
      const contests = t.homeFielded + t.homeBroken;
      puckRows.push([
        lineup.label,
        puck.label,
        opp.label,
        scoreCell(t),
        oppScoreCell(t),
        avg(t.homeTotal - t.awayTotal, t.n, 1),
        `${avg(t.homePuckWon, t.n, 1)}-${avg(t.awayPuckWon, t.n, 1)}`,
        pct(t.homeFielded, contests),
        pct(t.homeBroken, contests),
        avg(t.homeShortTurned, t.n, 1),
        pct(t.wins, t.n),
      ]);
    }
  }
}

printTable(
  `${teamLabel(focus)} puck-outs: long vs short, by lineup and opposition`,
  [
    "Lineup",
    "Puck",
    "Opposition",
    "Home score",
    "Opp score",
    "PD",
    "Puck won",
    "Long won",
    "Long broken",
    "Short TO/g",
    "Win%",
  ],
  puckRows,
);

const approachOpps = [
  { id: strongAerial, tactics: DEFAULT_TACTICS, label: teamLabel(strongAerial) },
  { id: weakAerial, tactics: DEFAULT_TACTICS, label: teamLabel(weakAerial) },
  { id: midAerial, tactics: DEFAULT_TACTICS, label: teamLabel(midAerial) },
];

const approachRows: string[][] = [];
for (const approach of [
  { label: "Attacking 6-2-6", tactics: ATTACKING },
  { label: "Balanced", tactics: BALANCED },
  { label: "Contain sweeper", tactics: DEFENSIVE },
] as const) {
  for (const opp of approachOpps) {
    const t = runBatch(focus, opp.id, approach.tactics, opp.tactics, defaultXv);
    const profile = sideProfile(focus, defaultXv, approach.tactics, {}, undefined, CLIMATE);
    approachRows.push([
      approach.label,
      opp.label,
      profile.attack.toFixed(1),
      profile.defence.toFixed(1),
      scoreCell(t),
      oppScoreCell(t),
      avg(t.homeTotal - t.awayTotal, t.n, 1),
      `${avg(t.homeGoals, t.n, 2)} / ${avg(t.awayGoals, t.n, 2)}`,
      `${avg(t.homeShots, t.n, 1)}-${avg(t.awayShots, t.n, 1)}`,
      `${t.wins}-${t.draws}-${t.losses}`,
      pct(t.wins, t.n),
    ]);
  }
}

printTable(
  `${teamLabel(focus)} attacking vs defensive vs three oppositions`,
  [
    "Approach",
    "Opposition",
    "Atk",
    "Def",
    "Home score",
    "Opp score",
    "PD",
    "Goals F/A",
    "Shots",
    "W-D-L",
    "Win%",
  ],
  approachRows,
);

const mirrorRows: string[][] = [];
for (const home of [
  { label: "Attacking 6-2-6", tactics: ATTACKING },
  { label: "Contain sweeper", tactics: DEFENSIVE },
] as const) {
  for (const away of [
    { label: "Attacking 6-2-6", tactics: ATTACKING },
    { label: "Contain sweeper", tactics: DEFENSIVE },
  ] as const) {
    const t = runBatch(focus, midAerial, home.tactics, away.tactics, defaultXv);
    mirrorRows.push([
      home.label,
      away.label,
      scoreCell(t),
      oppScoreCell(t),
      avg(t.homeTotal - t.awayTotal, t.n, 1),
      `${avg(t.homeGoals, t.n, 2)}-${avg(t.awayGoals, t.n, 2)}`,
      pct(t.wins, t.n),
    ]);
  }
}

printTable(
  `${teamLabel(focus)} v ${teamLabel(midAerial)}: both sides attacking or sitting in`,
  ["Home", "Away", "Home score", "Opp score", "PD", "Goals F-A", "Win%"],
  mirrorRows,
);

const underdog = "scariff";
const underdogRows: string[][] = [];
for (const approach of [
  { label: "Attacking 6-2-6", tactics: ATTACKING },
  { label: "Balanced", tactics: BALANCED },
  { label: "Contain sweeper", tactics: DEFENSIVE },
] as const) {
  for (const opp of [
    { id: focus, label: teamLabel(focus) },
    { id: strongAerial, label: teamLabel(strongAerial) },
    { id: "clooney-quin", label: teamLabel("clooney-quin") },
  ]) {
    const t = runBatch(underdog, opp.id, approach.tactics, DEFAULT_TACTICS);
    underdogRows.push([
      approach.label,
      opp.label,
      scoreCell(t),
      oppScoreCell(t),
      avg(t.homeTotal - t.awayTotal, t.n, 1),
      `${avg(t.homeGoals, t.n, 2)} / ${avg(t.awayGoals, t.n, 2)}`,
      `${t.wins}-${t.draws}-${t.losses}`,
      pct(t.wins, t.n),
    ]);
  }
}

printTable(
  `${teamLabel(underdog)} (weaker aerials) attacking vs sitting in`,
  ["Approach", "Opposition", "Home score", "Opp score", "PD", "Goals F/A", "W-D-L", "Win%"],
  underdogRows,
);

const hfClub = "clooney-quin";
const hfRows: string[][] = [];
for (const puck of [
  { label: "long 90", tactics: LONG_PUCK },
  { label: "short 12", tactics: SHORT_PUCK },
] as const) {
  for (const opp of opps.slice(0, 3)) {
    const t = runBatch(hfClub, opp.id, puck.tactics, opp.tactics);
    const contests = t.homeFielded + t.homeBroken;
    hfRows.push([
      puck.label,
      opp.label,
      scoreCell(t),
      oppScoreCell(t),
      avg(t.homeTotal - t.awayTotal, t.n, 1),
      `${avg(t.homePuckWon, t.n, 1)}-${avg(t.awayPuckWon, t.n, 1)}`,
      pct(t.homeFielded, contests),
      pct(t.homeBroken, contests),
      pct(t.wins, t.n),
    ]);
  }
}

printTable(
  `${teamLabel(hfClub)} (strong HF, weak HB+MF) long vs short puck-outs`,
  ["Puck", "Opposition", "Home score", "Opp score", "PD", "Puck won", "Long won", "Long broken", "Win%"],
  hfRows,
);

console.log(`\nDone. ${SEEDS} matches per cell, fixed seed 1–${SEEDS}, climate ${JSON.stringify(CLIMATE)}.`);
