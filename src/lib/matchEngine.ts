import type {
  MatchClimate,
  MatchEvent,
  MatchEventKind,
  MatchPrep,
  MatchStage,
  PlayerCondition,
  RatedPlayer,
  Score,
  ShotAttempt,
  SimulatedMatch,
  SquadBalance,
  StatCredit,
  Tactics,
  TeamSheet,
} from "../types";
import { clampDial } from "./attributes";
import { buildCoachReport, liveCoachTip } from "./coach";
import { applyFormChance, formValue, fumbleChance } from "./form";
import { mergeCredits, passChain, deliverTo, statsFromEvents } from "./matchStats";
import {
  closingSheetFromSlots,
  injuryText,
  MATCH_INJURY_CAP,
  MATCH_INJURY_PER_TEAM,
  rollMatchInjuries,
  subEventFor,
  type RolledInjury,
} from "./injuries";
import { clubTactics, defaultSheet, expandSheetToPanel, pickPuckoutTarget, sheetPlayers, sideProfile, sideTeamwork, aerialContestRating, type SideProfile } from "./players";
import { MATCH_SUB_LIMIT } from "./subs";
import {
  attackingTop,
  conversionContext,
  goalChanceFromDistance,
  makeShot,
  nearestToSpot,
  openPlayConversion,
  setPieceConversion,
  shotDistanceM,
  sidelineLanding,
  sidelineSpot,
  type SidelineZone,
} from "./shooting";
import { scoreTotal } from "./scoring";
import { liftSquadRatings } from "./difficulty";
import { conditionFor, fitnessOf, fitnessTiredness, liftSquadForPrep, matchStat } from "./training";
import { climateOf, passCompleteChance, puckoutWindAdjust, rollClimate, withWindFor } from "./weather";

const POINT_KINDS: ReadonlySet<MatchEventKind> = new Set(["point", "free", "sixtyFive", "sideline"]);

export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function seedFrom(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function addScore(score: Score, kind: "point" | "goal"): Score {
  if (kind === "goal") return { goals: score.goals + 1, points: score.points };
  return { goals: score.goals, points: score.points + 1 };
}

export function scoreKindOf(kind: MatchEventKind): "goal" | "point" | null {
  if (kind === "goal") return "goal";
  if (POINT_KINDS.has(kind)) return "point";
  return null;
}

export function freeConversionChance(frees: number, composure: number, underPressure: number): number {
  return Math.min(0.94, Math.max(0.28, 0.2 + frees * 0.032 + composure * 0.008 + underPressure * 0.004));
}

export function sixtyFiveChance(frees: number, strikingDistance: number, composure: number): number {
  return Math.min(0.86, Math.max(0.18, 0.1 + frees * 0.028 + strikingDistance * 0.01 + composure * 0.006));
}

export function sidelinePointChance(
  sidelines: number,
  strikingDistance: number,
  composure = 12,
  distanceM = 46,
): number {
  const quality = sidelines * 0.6 + strikingDistance * 0.28 + composure * 0.12;
  const qualityTerm = (quality - 12) * 0.014;
  const distanceTerm = (45 - distanceM) * 0.0032;
  return Math.min(0.22, Math.max(0.006, 0.07 + qualityTerm + distanceTerm));
}

/** @deprecated Use sidelinePointChance — kept as a thin alias for older tests. */
export function sidelineChance(sidelines: number, strikingDistance: number): number {
  return sidelinePointChance(sidelines, strikingDistance);
}

export function sidelineFindChance(sidelines: number, passing: number, vision: number): number {
  return Math.min(0.58, Math.max(0.1, 0.06 + sidelines * 0.016 + passing * 0.008 + vision * 0.006));
}

export function sidelineCarryM(sidelines: number, strikingDistance: number, random: () => number): number {
  const mean = 22 + strikingDistance * 1.85 + sidelines * 1.15;
  return Math.max(16, Math.min(98, mean + (random() - 0.5) * 18));
}

/** How much a side is sitting in: contain, sweeper and sitting off the press. */
export function defensiveSit(tactics: Tactics): number {
  const mentality = tactics.mentality === "contain" ? 0.52 : tactics.mentality === "attacking" ? 0 : 0.12;
  const sweeper = tactics.shape === "sweeper" ? 0.32 : 0;
  const sitOff = (Math.max(0, 48 - clampDial(tactics.pressure ?? 48)) / 48) * 0.1;
  return Math.min(1, mentality + sweeper + sitOff);
}

/** Cagey, low-scoring games pull results toward a bounce of the ball. */
export function matchChaos(home: Tactics, away: Tactics): number {
  const a = defensiveSit(home);
  const b = defensiveSit(away);
  return Math.min(1, (a + b) * 0.48 + Math.max(a, b) * 0.28);
}

export function attackLookChance(
  attack: number,
  defence: number,
  toward: number,
  chaos = 0,
  ownSit = 0,
): number {
  const quality = 0.7 + (attack - defence) * 0.02 + toward * 0.05;
  const mixed = quality * (1 - chaos * 0.55) + 0.5 * chaos * 0.55;
  const tempo = 1 - chaos * 0.18 - ownSit * 0.18;
  const floor = 0.58 - chaos * 0.22;
  const ceil = 0.86 - chaos * 0.08;
  return Math.min(ceil, Math.max(floor, mixed * tempo));
}

export function luckyLookChance(chaos: number): number {
  return 0.08 + chaos * 0.09;
}

export function menShort(onField: number): number {
  return Math.max(0, 15 - onField);
}

/** Extra / fewer scoring looks when a side is a man or two down. Applied after the 0.58 floor. */
export function numbersLookMul(attackingOnField: number, defendingOnField: number): number {
  const down = menShort(attackingOnField);
  const oppDown = menShort(defendingOnField);
  let mul = 1;
  if (down === 1) mul *= 0.68;
  else if (down >= 2) mul *= 0.4;
  if (oppDown === 1) mul *= 1.26;
  else if (oppDown >= 2) mul *= 1.72;
  return mul;
}

export function numbersFinishMul(
  attackingOnField: number,
  defendingOnField: number,
): { convert: number; goal: number } {
  const down = menShort(attackingOnField);
  const oppDown = menShort(defendingOnField);
  const attConvert = down === 0 ? 1 : down === 1 ? 0.9 : 0.7;
  const defConvert = oppDown === 0 ? 1 : oppDown === 1 ? 1.12 : 1.34;
  const attGoal = down === 0 ? 1 : down === 1 ? 0.84 : 0.58;
  const defGoal = oppDown === 0 ? 1 : oppDown === 1 ? 1.24 : 1.72;
  return { convert: attConvert * defConvert, goal: attGoal * defGoal };
}

export function rollLookCount(chance: number, random: () => number): number {
  const value = Math.max(0, chance);
  let n = 0;
  if (random() < Math.min(1, value)) n += 1;
  if (value > 1 && random() < Math.min(1, value - 1)) n += 1;
  return n;
}

export function sendOffText(
  name: string,
  dismissal: "straight" | "secondYellow",
  onFieldAfter: number,
): string {
  const aftermath = onFieldAfter <= 13 ? "They're down to thirteen men." : "They'll play the rest 6-2-5.";
  const lead =
    dismissal === "secondYellow"
      ? `SECOND YELLOW — ${name} is sent off.`
      : `RED CARD — ${name} is sent off.`;
  return `${lead} ${aftermath}`;
}

export function isStraightRedSendOff(
  event: Pick<MatchEvent, "kind" | "text" | "dismissal">,
): boolean {
  if (event.kind !== "red") return false;
  if (event.dismissal === "secondYellow") return false;
  if (event.dismissal === "straight") return true;
  return !/second yellow/i.test(event.text);
}

export function straightRedNamesFromEvents(events: MatchEvent[], teamId?: string): string[] {
  return [
    ...new Set(
      events
        .filter((event) => isStraightRedSendOff(event) && event.playerName && (!teamId || event.teamId === teamId))
        .map((event) => event.playerName),
    ),
  ];
}

export function chaoticConvert(convert: number, chaos: number, random: () => number): number {
  const mixed = convert * (1 - chaos * 0.32) + 0.5 * chaos * 0.32;
  const jitter = (random() - 0.5) * 2 * chaos * 0.16;
  return Math.min(0.9, Math.max(0.16, mixed + jitter));
}

export function puckoutFindTargetChance(puckoutReach: number, passing: number, vision = passing): number {
  return Math.min(0.9, Math.max(0.16, 0.1 + puckoutReach * 0.018 + passing * 0.014 + vision * 0.012));
}

/** Chance a direct attack plays a long ball into the forwards rather than running it. */
export function longBallDeliveryChance(direct: number): number {
  return Math.min(0.74, Math.max(0, (direct - 0.45) * 1.35));
}

export function longBallFindChance(passing: number, vision: number): number {
  return Math.min(0.84, Math.max(0.12, 0.06 + passing * 0.022 + vision * 0.02));
}

export function longBallWinChance(fielder: number, marker: number, found: boolean): number {
  const spill = found ? 0.05 : -0.06;
  return Math.min(0.82, Math.max(0.16, 0.48 + (fielder - marker) * 0.038 + spill + (found ? 0.05 : 0)));
}

/** Full-back 1–3 mark full-forwards 12–14; half-backs 4–6 mark half-forwards 9–11. */
export function markerSlot(forwardIndex: number): number {
  if (forwardIndex >= 12) return Math.min(3, Math.max(1, forwardIndex - 11));
  if (forwardIndex >= 9) return Math.min(6, Math.max(4, forwardIndex - 5));
  if (forwardIndex >= 7) return forwardIndex === 7 ? 4 : 6;
  return Math.max(1, Math.min(6, forwardIndex));
}

export function paceMismatch(
  speed: number,
  acceleration: number,
  markerSpeed: number,
  markerAcceleration: number,
  manMarking: number,
): number {
  const attack = speed * 0.46 + acceleration * 0.54;
  const cover = markerSpeed * 0.36 + markerAcceleration * 0.36 + manMarking * 0.28;
  return attack - cover;
}

export function runningLookBoost(mismatch: number, fullForward: boolean): {
  closer: number;
  goal: number;
  convert: number;
} {
  const extra = Math.max(0, mismatch - 2.4);
  const ff = fullForward ? 1 : 0.4;
  return {
    closer: Math.min(0.52, extra * 0.075) * ff,
    goal: Math.min(0.13, extra * 0.02) * (fullForward ? 1 : 0.32),
    convert: Math.min(0.11, extra * 0.016) * ff,
  };
}

export function breakHuntRating(
  speed: number,
  acceleration: number,
  offTheBall: number,
  firstTouch: number,
): number {
  return offTheBall * 0.28 + speed * 0.24 + acceleration * 0.24 + firstTouch * 0.24;
}

export function breakWinChance(
  hunter: number,
  rival: number,
  hunterStrength: number,
  rivalStrength: number,
): number {
  const hunt = hunter + (hunterStrength - 12) * 0.22;
  const cover = rival + (rivalStrength - 12) * 0.22;
  return Math.min(0.8, Math.max(0.16, 0.5 + (hunt - cover) * 0.038));
}

/** Barging in a crowd without the strength to move the man can concede a free. */
export function breakFoulChance(hunterStrength: number, rivalStrength: number): number {
  const gap = rivalStrength - hunterStrength;
  return Math.min(0.2, Math.max(0.015, 0.035 + gap * 0.012));
}

export function collectLowBallChance(firstTouch: number): number {
  return Math.min(0.84, Math.max(0.2, 0.26 + firstTouch * 0.03));
}

export function passVisionBonus(vision: number): number {
  return (vision - 12) * 0.012;
}

export function visionScoringLookChance(vision: number): number {
  return Math.min(0.34, Math.max(0, (vision - 11) * 0.017));
}

export function stageFromMatchId(matchId: string): MatchStage | undefined {
  const id = (matchId.split(":")[0] ?? matchId).toLowerCase();
  if (id === "final") return "final";
  if (id.startsWith("sf-")) return "semi-final";
  if (id.startsWith("qf-")) return "quarter-final";
  if (id.startsWith("rel-sf") || id.includes("relegation-semi")) return "relegation-semi";
  if (id.startsWith("rel")) return "relegation-final";
  if (id.startsWith("g")) return "group";
  return undefined;
}

export function knockoutOccasion(stage?: MatchStage): number {
  if (stage === "final") return 1;
  if (stage === "semi-final") return 0.8;
  if (stage === "quarter-final") return 0.62;
  return 0;
}

export function occasionPressure(minute: number, stage?: MatchStage): number {
  return Math.min(1, Math.max(latePhase(minute), knockoutOccasion(stage)));
}

export function underPressureMul(underPressure: number, occasion: number, levelling: boolean): number {
  if (occasion <= 0) return 1;
  const lift = ((underPressure - 12) / 14) * occasion;
  const base = 1 + lift * 0.16;
  return levelling ? base * (1 + Math.max(0, lift) * 0.18) : base;
}

export function targetedPuckoutWinChance(
  fielder: number,
  marker: number,
  support: number,
  foundTarget: boolean,
  wind = 0,
): number {
  const weight = foundTarget ? 0.82 : 0.55;
  const attack = fielder * weight + support * (1 - weight);
  const spill = foundTarget ? 0 : -0.05;
  return Math.min(0.78, Math.max(0.22, 0.5 + (attack - marker * 1.05) * 0.032 + spill + wind));
}

/** 0 before the closing spell, 1 at the full-time whistle. */
export function latePhase(minute: number): number {
  if (minute < 48) return 0;
  return Math.min(1, (minute - 47) / 15);
}

export type ChaseState = {
  chasing: boolean;
  huntGoals: boolean;
  deficit: number;
  energy: number;
};

const IDLE_CHASE: ChaseState = { chasing: false, huntGoals: false, deficit: 0, energy: 0 };

/** Losing sides empty the tank after the 48th minute. Multiple points down means hunt a goal. */
export function chaseState(us: Score, them: Score, minute: number): ChaseState {
  const late = latePhase(minute);
  const deficit = scoreTotal(them) - scoreTotal(us);
  if (late <= 0 || deficit <= 0) return { ...IDLE_CHASE, deficit: Math.max(0, deficit) };
  const energy = Math.min(1, late * (0.48 + Math.min(deficit, 9) * 0.07));
  return {
    chasing: true,
    huntGoals: deficit >= 2,
    deficit,
    energy,
  };
}

export function withChaseTactics(tactics: Tactics, chase: ChaseState): Tactics {
  if (!chase.chasing) return tactics;
  const lift = 0.35 + chase.energy * 0.65;
  return {
    ...tactics,
    mentality: "attacking",
    pressure: Math.min(100, (tactics.pressure ?? 48) + 16 * lift),
    aggression: Math.min(100, (tactics.aggression ?? 46) + 12 * lift),
    shooting: chase.huntGoals
      ? Math.max(6, (tactics.shooting ?? 50) - 30)
      : Math.max(14, (tactics.shooting ?? 50) - 8),
    shape: chase.huntGoals ? "traditional" : tactics.shape,
  };
}

/** Trailing by a point in the last few minutes: a soft free that can level it. */
export function lateSoftFreeChance(minute: number, margin: number): number {
  if (Math.abs(margin) !== 1 || minute < 51) return 0;
  const late = latePhase(minute);
  if (late <= 0) return 0;
  return 0.05 + late * 0.07;
}

/** One-point games in the last few minutes: the trailer throws another look at the posts. */
export function lateEqualizerLookChance(minute: number, margin: number): number {
  if (Math.abs(margin) !== 1 || minute < 56) return 0;
  return 0.12 + latePhase(minute) * 0.1;
}

export function chaseEffortFromAcc(accumulated: number): number {
  return Math.min(1, Math.max(0, accumulated / 10));
}

export type TackleRole = "back" | "mid" | "forward";

export function tackleRoleAt(index: number): TackleRole {
  if (index <= 6) return "back";
  if (index <= 8) return "mid";
  return "forward";
}

/** Sweeper or a send-off leaves five forwards hunting six (or seven) defenders. */
export function fiveForwardShape(namesLength: number, tactics: Tactics): boolean {
  return namesLength < 15 || tactics.shape === "sweeper";
}

export function pressOutnumbered(
  pressingLength: number,
  pressingTactics: Tactics,
  coveringLength: number,
  coveringTactics: Tactics,
): boolean {
  return fiveForwardShape(pressingLength, pressingTactics) || (coveringTactics.shape === "sweeper" && coveringLength >= 15);
}

export function tackleChance(
  hooking: number,
  aggression: number,
  pressure = 48,
  strength = 12,
  role: TackleRole = "back",
  outnumbered = false,
): number {
  const physical = clampDial(aggression) / 100;
  const press = clampDial(pressure) / 100;
  const base = Math.min(
    0.32,
    Math.max(0.08, 0.08 + hooking * 0.0035 + strength * 0.0045 + physical * 0.07 + press * 0.06),
  );
  const roleMul = role === "forward" ? 0.56 : role === "mid" ? 0.94 : 1;
  const numbersMul = outnumbered && role === "forward" ? 0.6 : 1;
  return base * roleMul * numbersMul;
}

function composureCardMul(composure: number, severity: "yellow" | "sendoff"): number {
  const t = Math.max(0, Math.min(1, (composure - 4) / 16));
  if (severity === "yellow") {
    return Math.max(0.28, Math.min(1.75, 1.58 - t * 1.2));
  }
  return Math.max(0.06, Math.min(2.2, 1.9 - t * 1.92));
}

export function mistimedFoulChance(aggression: number, wet = false, fitness = 100): number {
  const base = Math.min(0.32, Math.max(0.03, 0.035 + (clampDial(aggression) / 100) * 0.22));
  const tired = fitnessTiredness(fitness);
  return Math.min(0.52, base * (wet ? 1.18 : 1) * (1 + tired * 0.9));
}

export function yellowOnFoulChance(aggression: number, composure = 12, wet = false): number {
  const base = Math.min(0.52, Math.max(0.06, 0.11 + (clampDial(aggression) / 100) * 0.36));
  return Math.min(0.66, base * composureCardMul(composure, "yellow") * (wet ? 1.12 : 1));
}

export function secondYellowOnFoulChance(aggression: number, composure = 12, wet = false): number {
  const base = Math.min(0.28, Math.max(0.055, 0.09 + (clampDial(aggression) / 100) * 0.14));
  return Math.min(0.34, base * composureCardMul(composure, "sendoff") * (wet ? 1.1 : 1));
}

export function redOnFoulChance(aggression: number, composure = 12, wet = false): number {
  const base = Math.min(0.07, Math.max(0.008, 0.023 + (clampDial(aggression) / 100) * 0.028));
  return Math.min(0.11, base * composureCardMul(composure, "sendoff") * (wet ? 1.08 : 1));
}

/** Chance a restart is taken short to the back line rather than as a long aerial or a generic start. */
export function shortPuckoutTakeChance(longPuck: number, oppShape: Tactics["shape"] = "traditional"): number {
  const vsSweeper = oppShape === "sweeper" ? 0.12 : 0;
  return Math.min(0.74, 0.12 + (1 - longPuck) * 0.28 + vsSweeper);
}

/** After a send-off, play 6-2-5. A second red leaves thirteen (6-2-4). */
export function reshapeTo625(original: string[], out: Iterable<string>): string[] {
  const banned = new Set(out);
  const remaining = original.filter((name) => !banned.has(name));
  if (remaining.length >= 15) return remaining.slice(0, 15);
  const indexed = original.map((name, index) => ({ name, index })).filter((row) => !banned.has(row.name));
  const used = new Set<string>();
  const take = (want: (index: number) => boolean, count: number) => {
    const picked: string[] = [];
    const prefer = indexed.filter((row) => !used.has(row.name) && want(row.index));
    const rest = indexed.filter((row) => !used.has(row.name));
    for (const row of [...prefer, ...rest]) {
      if (picked.length >= count) break;
      if (used.has(row.name)) continue;
      picked.push(row.name);
      used.add(row.name);
    }
    return picked;
  };
  const gk = take((index) => index === 0, 1);
  const backs = take((index) => index >= 1 && index <= 6, 6);
  const mids = take((index) => index >= 7 && index <= 8, 2);
  const forwardCount = Math.max(0, remaining.length - gk.length - backs.length - mids.length);
  const forwards = take((index) => index >= 9, forwardCount);
  return [...gk, ...backs, ...mids, ...forwards];
}

export function sentOffNamesFromEvents(events: MatchEvent[], teamId?: string): string[] {
  return [
    ...new Set(
      events
        .filter((event) => event.kind === "red" && event.playerName && (!teamId || event.teamId === teamId))
        .map((event) => event.playerName),
    ),
  ];
}

export function bookedNamesFromEvents(events: MatchEvent[], teamId?: string): string[] {
  const yellows = new Set<string>();
  const sentOff = new Set(sentOffNamesFromEvents(events, teamId));
  for (const event of events) {
    if (event.kind !== "booking" || !event.playerName) continue;
    if (teamId && event.teamId !== teamId) continue;
    if (sentOff.has(event.playerName)) continue;
    yellows.add(event.playerName);
  }
  return [...yellows];
}

export function isScoreKind(kind: MatchEventKind): boolean {
  return kind === "goal" || POINT_KINDS.has(kind);
}

export function isCardKind(kind: MatchEventKind): boolean {
  return kind === "booking" || kind === "red";
}

const FEATURED_FEED: ReadonlySet<MatchEventKind> = new Set([
  "goal",
  "point",
  "free",
  "sixtyFive",
  "sideline",
  "play",
  "booking",
  "red",
  "half",
  "coach",
  "injury",
  "sub",
]);

export function commentaryFeed(events: MatchEvent[]): MatchEvent[] {
  const featured = events.filter((event) => FEATURED_FEED.has(event.kind));
  const play = events.filter((event) => !FEATURED_FEED.has(event.kind));
  const keep = new Set([...featured.slice(-10), ...play.slice(-6)]);
  return [...events].reverse().filter((event) => keep.has(event));
}

export function nextMomentum(
  current: number,
  event: Pick<MatchEvent, "kind" | "teamId" | "text">,
  homeId: string,
): number {
  const towardHome = event.teamId === homeId ? 1 : -1;
  let delta = 0;
  switch (event.kind) {
    case "goal":
      delta = 18;
      break;
    case "point":
    case "free":
    case "sixtyFive":
    case "sideline":
      delta = 8;
      break;
    case "save":
    case "hook":
      delta = -5;
      break;
    case "booking":
      delta = -7;
      break;
    case "red":
      delta = -14;
      break;
    case "wide":
      delta = -3;
      break;
    case "puckout":
      delta = /broken|turned over/i.test(event.text) ? -6 : 4;
      break;
    case "play":
      delta = 3;
      break;
    case "turnover":
      delta = -4;
      break;
    case "coach":
      delta = 0;
      break;
    default:
      delta = 0;
  }
  const drifted = current + (50 - current) * 0.05 + towardHome * delta;
  return Math.max(4, Math.min(96, Math.round(drifted)));
}

function pickName(names: string[], random: () => number): string {
  return names[Math.floor(random() * Math.max(names.length, 1))] ?? "a substitute";
}

/** Short puck-outs go to the full-back line (1–3) or half-backs (4–6); vs a sweeper, prefer the full-backs. */
export function pickShortPuckoutReceiver(
  names: string[],
  oppShape: Tactics["shape"],
  random: () => number,
): string {
  const fullBacks = names.slice(1, 4).filter(Boolean);
  const halfBacks = names.slice(4, 7).filter(Boolean);
  const pool = [...fullBacks, ...halfBacks];
  if (pool.length === 0) return names[1] ?? names[0] ?? "a substitute";
  const preferFull = random() < (oppShape === "sweeper" ? 0.74 : 0.42);
  if (preferFull && fullBacks.length > 0) return pickName(fullBacks, random);
  if (halfBacks.length > 0) return pickName(halfBacks, random);
  return pickName(pool, random);
}

function indicesWhere(names: string[], want: (index: number) => boolean): number[] {
  return names.map((_, index) => index).filter((index) => want(index) && names[index]);
}

function pickIndexed(
  names: string[],
  indices: number[],
  random: () => number,
  weight?: (index: number) => number,
): { name: string; index: number } {
  const pool = indices.filter((index) => names[index]);
  if (pool.length === 0) {
    const fallback = Math.max(0, names.length - 1);
    return { name: names[fallback] ?? "a substitute", index: fallback };
  }
  if (!weight) {
    const index = pool[Math.floor(random() * pool.length)] ?? pool[0]!;
    return { name: names[index]!, index };
  }
  const weights = pool.map((index) => Math.max(0.08, weight(index)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let roll = random() * total;
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i]!;
    if (roll <= 0) {
      const index = pool[i]!;
      return { name: names[index]!, index };
    }
  }
  const index = pool[pool.length - 1]!;
  return { name: names[index]!, index };
}

function forwardIndices(names: string[]): number[] {
  return indicesWhere(names, (index) => index >= 9);
}

function backAndMidIndices(names: string[]): number[] {
  return indicesWhere(names, (index) => index >= 1 && index <= 8);
}

function pickFouler(names: string[], booked: Set<string>, random: () => number): { name: string; index: number } {
  const bookedOn = names.filter((name) => booked.has(name));
  if (bookedOn.length > 0 && random() < 0.44) {
    const name = bookedOn[Math.floor(random() * bookedOn.length)]!;
    return { name, index: Math.max(0, names.indexOf(name)) };
  }
  return pickIndexed(names, backAndMidIndices(names), random);
}

function outFromBackIndices(names: string[]): number[] {
  return indicesWhere(names, (index) => index >= 1 && index <= 6);
}

export function simulateMatch(options: {
  matchId: string;
  homeId: string;
  awayId: string;
  homeSheet?: TeamSheet;
  awaySheet?: TeamSheet;
  homeTactics?: Tactics;
  awayTactics?: Tactics;
  homeCondition?: Record<string, PlayerCondition>;
  awayCondition?: Record<string, PlayerCondition>;
  clubId?: string;
  homeName?: string;
  awayName?: string;
  period?: "first" | "second" | "full";
  startHome?: Score;
  startAway?: Score;
  startMomentum?: number;
  seed: number;
  /** Career seed for player attributes. Omit in tests so ratings stay name-stable. */
  gameSeed?: number;
  balance?: SquadBalance;
  climate?: MatchClimate;
  sentOff?: string[];
  booked?: string[];
  homeSquad?: RatedPlayer[];
  awaySquad?: RatedPlayer[];
  remainingWeeks?: number;
  remainingSubs?: { home?: number; away?: number };
  injuryBudget?: { total: number; home: number; away: number };
  forcedRemovals?: { minute: number; teamId: string; name: string; kind: "red" | "injury" }[];
  performanceBoost?: { clubIds: string[]; amount: number };
  homePrep?: MatchPrep;
  awayPrep?: MatchPrep;
  stage?: MatchStage;
}): SimulatedMatch {
  const period = options.period ?? "full";
  const matchStage = options.stage ?? stageFromMatchId(options.matchId);
  const seedKey = period === "second" ? `${options.seed}:${options.matchId}:second` : `${options.seed}:${options.matchId}`;
  const random = createRng(seedFrom(seedKey));
  const statRng = createRng(seedFrom(`${seedKey}:stats`));
  const climate = climateOf(options.climate ?? rollClimate(options.seed, options.matchId));
  const shots: ShotAttempt[] = [];
  const ratings = { seed: options.gameSeed, balance: options.balance };
  const homeSheet = expandSheetToPanel(options.homeId, options.homeSheet ?? defaultSheet(options.homeId), ratings);
  const awaySheet = expandSheetToPanel(options.awayId, options.awaySheet ?? defaultSheet(options.awayId), ratings);
  const homeTactics = options.homeTactics ?? clubTactics(options.homeId, options.balance);
  const awayTactics = options.awayTactics ?? clubTactics(options.awayId, options.balance);
  const homeDirect = clampDial(homeTactics.build) / 100;
  const awayDirect = clampDial(awayTactics.build) / 100;
  const homeLongPuck = clampDial(homeTactics.puckout) / 100;
  const awayLongPuck = clampDial(awayTactics.puckout) / 100;

  let homeScore: Score = options.startHome ?? { goals: 0, points: 0 };
  let awayScore: Score = options.startAway ?? { goals: 0, points: 0 };
  let homeChaseAcc = 0;
  let awayChaseAcc = 0;
  let momentum = options.startMomentum ?? 50;
  const events: MatchEvent[] = [];
  const homeOut = new Set((options.sentOff ?? []).filter((name) => homeSheet.starters.includes(name) || homeSheet.subs.includes(name)));
  const awayOut = new Set((options.sentOff ?? []).filter((name) => awaySheet.starters.includes(name) || awaySheet.subs.includes(name)));
  const yellows = new Set(
    (options.booked ?? []).filter((name) => !homeOut.has(name) && !awayOut.has(name)),
  );
  const homeSlots = [...homeSheet.starters];
  const awaySlots = [...awaySheet.starters];
  const homeSubs = [...homeSheet.subs];
  const awaySubs = [...awaySheet.subs];
  let homeSubsLeft = options.remainingSubs?.home ?? MATCH_SUB_LIMIT;
  let awaySubsLeft = options.remainingSubs?.away ?? MATCH_SUB_LIMIT;
  let homeNames = reshapeTo625(homeSlots, homeOut);
  let awayNames = reshapeTo625(awaySlots, awayOut);
  let homeLiveTactics: Tactics = homeNames.length < 15 ? { ...homeTactics, shape: "traditional" } : homeTactics;
  let awayLiveTactics: Tactics = awayNames.length < 15 ? { ...awayTactics, shape: "traditional" } : awayTactics;
  const homeLift =
    options.performanceBoost?.clubIds.includes(options.homeId) ? (options.performanceBoost.amount ?? 0) : 0;
  const awayLift =
    options.performanceBoost?.clubIds.includes(options.awayId) ? (options.performanceBoost.amount ?? 0) : 0;
  const rawHomeRoster = options.homeSquad ?? sheetPlayers(options.homeId, homeSheet, ratings);
  const rawAwayRoster = options.awaySquad ?? sheetPlayers(options.awayId, awaySheet, ratings);
  const homeRoster = liftSquadForPrep(liftSquadRatings(rawHomeRoster, homeLift), options.homePrep);
  const awayRoster = liftSquadForPrep(liftSquadRatings(rawAwayRoster, awayLift), options.awayPrep);
  let home = sideProfile(
    options.homeId,
    { starters: homeNames, subs: homeSubs },
    homeLiveTactics,
    options.homeCondition,
    ratings,
    climate,
    homeRoster,
  );
  let away = sideProfile(
    options.awayId,
    { starters: awayNames, subs: awaySubs },
    awayLiveTactics,
    options.awayCondition,
    ratings,
    climate,
    awayRoster,
  );
  const homeTeamwork = sideTeamwork(
    options.homeId,
    { starters: homeNames, subs: homeSubs },
    options.homeCondition,
    ratings,
    homeRoster,
  );
  const awayTeamwork = sideTeamwork(
    options.awayId,
    { starters: awayNames, subs: awaySubs },
    options.awayCondition,
    ratings,
    awayRoster,
  );
  const playerOf = (teamId: string, name: string) =>
    (teamId === options.homeId ? homeRoster : awayRoster).find((player) => player.name === name)
    ?? sheetPlayers(teamId, { starters: teamId === options.homeId ? homeNames : awayNames, subs: [] }, ratings).find(
      (player) => player.name === name,
    );
  const conditionOf = (teamId: string, name: string) =>
    conditionFor(
      name,
      teamId === options.homeId ? (options.homeCondition ?? {}) : (options.awayCondition ?? {}),
    );
  const formOf = (teamId: string, name: string) => formValue(conditionOf(teamId, name));
  const periodMinutes = period === "first" ? 32 : period === "second" ? 30 : 62;
  const startMinute = period === "second" ? 32 : 1;
  const endMinute = period === "first" ? 31 : 62;
  const stints = new Map<string, number>();
  const minuteBank: StatCredit[] = [];
  const matchInjuries: RolledInjury[] = [];
  const wet = climate.sky === "wet";
  const keyFor = (teamId: string, name: string) => `${teamId}:${name}`;
  const beginStint = (teamId: string, name: string, minute: number) => {
    stints.set(keyFor(teamId, name), minute);
  };
  const endStint = (teamId: string, name: string, minute: number) => {
    const key = keyFor(teamId, name);
    const from = stints.get(key);
    if (from === undefined) return;
    stints.delete(key);
    const span = Math.max(1, minute - from + 1);
    const total = endMinute - startMinute + 1;
    minuteBank.push({ name, teamId, minutes: Math.max(1, Math.round((span / total) * periodMinutes)) });
  };
  const fieldNames = (teamId: string) => (teamId === options.homeId ? homeNames : awayNames);
  const refreshSide = (teamId: string) => {
    if (teamId === options.homeId) {
      homeNames = reshapeTo625(homeSlots, homeOut);
      homeLiveTactics = homeNames.length < 15 ? { ...homeTactics, shape: "traditional" } : homeTactics;
      home = sideProfile(
        options.homeId,
        { starters: homeNames, subs: homeSubs },
        homeLiveTactics,
        options.homeCondition,
        ratings,
        climate,
        homeRoster,
      );
    } else {
      awayNames = reshapeTo625(awaySlots, awayOut);
      awayLiveTactics = awayNames.length < 15 ? { ...awayTactics, shape: "traditional" } : awayTactics;
      away = sideProfile(
        options.awayId,
        { starters: awayNames, subs: awaySubs },
        awayLiveTactics,
        options.awayCondition,
        ratings,
        climate,
        awayRoster,
      );
    }
  };
  const nextSub = (teamId: string) => {
    const subs = teamId === options.homeId ? homeSubs : awaySubs;
    const names = fieldNames(teamId);
    const out = teamId === options.homeId ? homeOut : awayOut;
    return subs.find((name) => !out.has(name) && !names.includes(name));
  };
  const dismiss = (teamId: string, name: string, minute: number) => {
    const out = teamId === options.homeId ? homeOut : awayOut;
    if (out.has(name) || !fieldNames(teamId).includes(name)) return;
    endStint(teamId, name, minute);
    out.add(name);
    refreshSide(teamId);
  };
  const replaceInjured = (teamId: string, name: string, minute: number, rolled: RolledInjury) => {
    if (!fieldNames(teamId).includes(name)) return;
    endStint(teamId, name, minute);
    matchInjuries.push(rolled);
    push({
      minute,
      teamId,
      playerName: name,
      kind: "injury",
      text: rolled.event.text,
    });
    const slots = teamId === options.homeId ? homeSlots : awaySlots;
    const subs = teamId === options.homeId ? homeSubs : awaySubs;
    const slot = slots.indexOf(name);
    const incoming = nextSub(teamId);
    const remaining = teamId === options.homeId ? homeSubsLeft : awaySubsLeft;
    if (incoming && slot >= 0 && remaining > 0) {
      slots[slot] = incoming;
      const subIndex = subs.indexOf(incoming);
      if (subIndex >= 0) subs[subIndex] = name;
      else subs.push(name);
      beginStint(teamId, incoming, minute);
      push(subEventFor(rolled, incoming));
      if (teamId === options.homeId) homeSubsLeft -= 1;
      else awaySubsLeft -= 1;
    } else {
      (teamId === options.homeId ? homeOut : awayOut).add(name);
    }
    refreshSide(teamId);
  };

  for (const name of homeNames) beginStint(options.homeId, name, startMinute);
  for (const name of awayNames) beginStint(options.awayId, name, startMinute);

  const injuryBudget = options.injuryBudget ?? {
    total: MATCH_INJURY_CAP,
    home: MATCH_INJURY_PER_TEAM,
    away: MATCH_INJURY_PER_TEAM,
  };
  const homeRolled = options.homeSquad
    ? rollMatchInjuries({
        clubId: options.homeId,
        squad: rawHomeRoster,
        condition: options.homeCondition ?? {},
        seed: options.seed,
        matchId: options.matchId,
        period,
        remainingWeeks: options.remainingWeeks ?? 12,
        teamId: options.homeId,
        maxCount: Math.min(injuryBudget.home, injuryBudget.total),
        played: homeSheet.starters.map((name) => ({ name, minutes: periodMinutes, started: true })),
      })
    : [];
  const awayRolled = options.awaySquad
    ? rollMatchInjuries({
        clubId: options.awayId,
        squad: rawAwayRoster,
        condition: options.awayCondition ?? {},
        seed: options.seed,
        matchId: options.matchId,
        period,
        remainingWeeks: options.remainingWeeks ?? 12,
        teamId: options.awayId,
        maxCount: Math.min(injuryBudget.away, injuryBudget.total),
        played: awaySheet.starters.map((name) => ({ name, minutes: periodMinutes, started: true })),
      })
    : [];
  const orderRng = createRng(seedFrom(`${seedKey}:injury-pick`));
  const randomPool = orderRng() < 0.5 ? [...homeRolled, ...awayRolled] : [...awayRolled, ...homeRolled];
  const pickedInjuries: RolledInjury[] = [];
  let homeInjuryCount = 0;
  let awayInjuryCount = 0;
  for (const item of randomPool) {
    const isHome = item.event.teamId === options.homeId;
    if (pickedInjuries.length >= injuryBudget.total) break;
    if (isHome && homeInjuryCount >= injuryBudget.home) continue;
    if (!isHome && awayInjuryCount >= injuryBudget.away) continue;
    pickedInjuries.push(item);
    if (isHome) homeInjuryCount += 1;
    else awayInjuryCount += 1;
  }
  const scheduledInjuries = [
    ...pickedInjuries,
    ...(options.forcedRemovals ?? [])
      .filter((item) => item.kind === "injury")
      .map((item) => {
        const ailment = "hamstring";
        const weeks = 2;
        const injury = { weeksLeft: weeks, durationWeeks: weeks, ailment, source: "match" as const };
        return {
          name: item.name,
          minute: item.minute,
          injury,
          event: {
            minute: item.minute,
            teamId: item.teamId,
            playerName: item.name,
            kind: "injury" as const,
            text: injuryText(item.name, ailment, weeks, options.remainingWeeks ?? 12),
            momentum: 50,
          },
        } satisfies RolledInjury;
      }),
  ];

  const push = (event: Omit<MatchEvent, "momentum">) => {
    momentum = nextMomentum(momentum, event, options.homeId);
    events.push({ ...event, momentum });
  };

  const tacticsFor = (teamId: string) => (teamId === options.homeId ? homeLiveTactics : awayLiveTactics);
  const chaseOf = (teamId: string, minute: number) =>
    chaseState(
      teamId === options.homeId ? homeScore : awayScore,
      teamId === options.homeId ? awayScore : homeScore,
      minute,
    );
  let homeEffTactics: Tactics = homeLiveTactics;
  let awayEffTactics: Tactics = awayLiveTactics;
  const pressWeightOf = (sideId: string, sideNames: string[], index: number) => {
    const player = playerOf(sideId, sideNames[index] ?? "");
    const lineBoost = index <= 11 ? 1.35 : 0.85;
    return ((player?.ratings.workrate ?? 12) * 0.55 + (player?.ratings.hooking ?? 11) * 0.45) * lineBoost;
  };
  const huntRatingOf = (sideId: string, name: string) => {
    const player = playerOf(sideId, name);
    if (!player) return 10;
    return breakHuntRating(
      player.ratings.speed,
      player.ratings.acceleration,
      player.ratings.offTheBall,
      player.ratings.firstTouch,
    );
  };
  const contestBreak = (
    attackingId: string,
    attNames: string[],
    defId: string,
    defNames: string[],
    skip: string,
  ): { won: boolean; name: string; index: number; rival: string; foul: boolean } => {
    const hunterPool = indicesWhere(attNames, (index) => index >= 7 && attNames[index] !== skip);
    const hunter = pickIndexed(
      attNames,
      hunterPool.length > 0 ? hunterPool : attNames.map((_, index) => index).filter((index) => attNames[index] !== skip),
      random,
      (index) => huntRatingOf(attackingId, attNames[index] ?? ""),
    );
    const rival = pickIndexed(defNames, backAndMidIndices(defNames), random, (index) => {
      const player = playerOf(defId, defNames[index] ?? "");
      return huntRatingOf(defId, defNames[index] ?? "") + (player?.ratings.manMarking ?? 11) * 0.12;
    });
    const hunterP = playerOf(attackingId, hunter.name);
    const rivalP = playerOf(defId, rival.name);
    const win =
      random() <
      breakWinChance(
        huntRatingOf(attackingId, hunter.name),
        huntRatingOf(defId, rival.name),
        hunterP?.ratings.strength ?? 11,
        rivalP?.ratings.strength ?? 11,
      );
    if (win && random() < breakFoulChance(hunterP?.ratings.strength ?? 11, rivalP?.ratings.strength ?? 11)) {
      return { won: false, name: hunter.name, index: hunter.index, rival: rival.name, foul: true };
    }
    return {
      won: win,
      name: win ? hunter.name : rival.name,
      index: win ? hunter.index : rival.index,
      rival: rival.name,
      foul: false,
    };
  };

  const flushMinutes = (minute: number): StatCredit[] => {
    for (const name of [...homeNames]) endStint(options.homeId, name, minute);
    for (const name of [...awayNames]) endStint(options.awayId, name, minute);
    const credits = [...minuteBank];
    minuteBank.length = 0;
    return credits;
  };

  const credit = (teamId: string, kind: "point" | "goal") => {
    if (teamId === options.homeId) homeScore = addScore(homeScore, kind);
    else awayScore = addScore(awayScore, kind);
  };

  const attemptSetPiece = (
    teamId: string,
    kind: "free" | "sixtyFive" | "longFree" | "shortFree",
    profile: SideProfile,
    minute: number,
    newSequence = true,
  ) => {
    const resolved = kind === "sixtyFive" || kind === "longFree" ? "longFree" : "shortFree";
    const taker = resolved === "longFree" ? profile.longFreeTaker : profile.shortFreeTaker;
    const playerName = taker?.name ?? pickName(teamId === options.homeId ? homeNames : awayNames, random);
    const eventKind: MatchEventKind = kind === "sixtyFive" ? "sixtyFive" : "free";
    const rawChance =
      eventKind === "free" && resolved === "longFree"
        ? sixtyFiveChance(
            taker?.ratings.frees ?? 11,
            taker?.ratings.strikingDistance ?? 11,
            taker?.ratings.composure ?? 11,
          )
        : eventKind === "free"
          ? freeConversionChance(
              taker?.ratings.frees ?? 11,
              taker?.ratings.composure ?? 11,
              taker?.ratings.underPressure ?? 11,
            )
          : sixtyFiveChance(
              taker?.ratings.frees ?? 11,
              taker?.ratings.strikingDistance ?? 11,
              taker?.ratings.composure ?? 11,
            );

    const distanceM = eventKind === "sixtyFive" ? 65 : resolved === "longFree" ? 52 : 28;
    const wind = conversionContext(climate, teamId, options.homeId, period);
    const occ = occasionPressure(minute, matchStage);
    const deficit =
      scoreTotal(teamId === options.homeId ? awayScore : homeScore) -
      scoreTotal(teamId === options.homeId ? homeScore : awayScore);
    const chance =
      applyFormChance(setPieceConversion(rawChance, distanceM, wind.withWind, wind.crossWind), formOf(teamId, playerName)) *
      underPressureMul(taker?.ratings.underPressure ?? 12, occ, deficit > 0 && deficit <= 3);

    const gain: StatCredit = { name: playerName, teamId, possessions: 1, sequences: newSequence ? 1 : 0 };
    const scored = random() < chance;
    const setPiece =
      eventKind === "free"
        ? { freesAttempted: 1, freesScored: scored ? 1 : 0 }
        : { sixtyFivesAttempted: 1, sixtyFivesScored: scored ? 1 : 0 };
    if (scored) {
      credit(teamId, "point");
      const text =
        eventKind === "free"
          ? resolved === "longFree"
            ? `${playerName} points from a long free.`
            : `${playerName} points from a short free.`
          : `65 — ${playerName} splits the posts.`;
      push({
        minute,
        teamId,
        playerName,
        kind: eventKind,
        text,
        credits: [{ ...gain, ...setPiece, shots: 1, scores: 1 }],
      });
    } else {
      push({
        minute,
        teamId,
        playerName,
        kind: "wide",
        text:
          eventKind === "free"
            ? `${resolved === "longFree" ? "Long free" : "Free"} out wide from ${playerName}.`
            : `${playerName}'s 65 drops short.`,
        credits: [{ ...gain, ...setPiece, shots: 1 }],
      });
    }
    shots.push(
      makeShot({
        minute,
        teamId,
        homeId: options.homeId,
        playerName,
        kind: scored ? eventKind : "wide",
        scored,
        distanceM,
        period,
        random,
      }),
    );
  };

  const attemptSideline = (teamId: string, zone: SidelineZone, minute: number) => {
    const names = fieldNames(teamId);
    const towardGoal = attackingTop(teamId, options.homeId, period);
    const spot = sidelineSpot(towardGoal, zone, random);
    const takerPick = nearestToSpot(names, towardGoal, spot.x, spot.y);
    const playerName = takerPick.name;
    const player = playerOf(teamId, playerName);
    const sidelines = player?.ratings.sidelines ?? 11;
    const striking = player?.ratings.strikingDistance ?? 11;
    const composure = player?.ratings.composure ?? 11;
    const passing = player?.ratings.passing ?? 11;
    const vision = player?.ratings.vision ?? 11;
    const wind = conversionContext(climate, teamId, options.homeId, period);
    const rawPoint = sidelinePointChance(sidelines, striking, composure, spot.distanceM);
    const pointChance = Math.min(
      0.22,
      Math.max(
        0.004,
        rawPoint * (1 + wind.withWind * 0.07) -
          wind.crossWind * (0.04 + Math.max(0, spot.distanceM - 40) * 0.002),
      ),
    );
    const form = formOf(teamId, playerName);
    const formedPoint = Math.min(0.22, Math.max(0.004, pointChance * (1 + ((form - 50) / 42) * 0.24)));
    const gain: StatCredit = { name: playerName, teamId, possessions: 1, sequences: 1 };

    if (random() < formedPoint) {
      credit(teamId, "point");
      push({
        minute,
        teamId,
        playerName,
        kind: "sideline",
        text: `Sideline cut from ${playerName}.`,
        credits: [{ ...gain, shots: 1, scores: 1 }],
      });
      shots.push(
        makeShot({
          minute,
          teamId,
          homeId: options.homeId,
          playerName,
          kind: "sideline",
          scored: true,
          distanceM: spot.distanceM,
          period,
          random,
          x: spot.x,
        }),
      );
      return;
    }

    const carry = sidelineCarryM(sidelines, striking, random);
    const landing = sidelineLanding(spot, towardGoal, carry);
    const findChance = applyFormChance(sidelineFindChance(sidelines, passing, vision), form);
    if (random() < findChance) {
      const receiver = nearestToSpot(names, towardGoal, landing.x, landing.y, { skip: new Set([playerName]) });
      const found = receiver.name !== playerName ? receiver.name : undefined;
      push({
        minute,
        teamId,
        playerName,
        kind: "play",
        text: found
          ? `${playerName} finds ${found} from the line.`
          : `${playerName} works the sideline in.`,
        credits: mergeCredits([
          { ...gain, passesAttempted: 1, passesCompleted: found ? 1 : 0 },
          ...(found ? [{ name: found, teamId, possessions: 1 }] : []),
        ]),
      });
      return;
    }

    const workedInChance = Math.min(
      0.48,
      Math.max(0.08, 0.1 + sidelines * 0.012 + (landing.distanceM < 48 ? 0.16 : 0) + (carry - 50) * 0.004),
    );
    if (random() < workedInChance) {
      push({
        minute,
        teamId,
        playerName,
        kind: "play",
        text:
          carry > 62
            ? `${playerName} hits a long sideline into the square.`
            : `${playerName}'s sideline is worked in.`,
        credits: [{ ...gain }],
      });
      return;
    }

    const overhit = carry > 70 && landing.distanceM < 14;
    push({
      minute,
      teamId,
      playerName,
      kind: "wide",
      text: overhit
        ? `${playerName} overhits the sideline.`
        : `${playerName}'s sideline drifts wide.`,
      credits: [{ ...gain, shots: 1 }],
    });
    shots.push(
      makeShot({
        minute,
        teamId,
        homeId: options.homeId,
        playerName,
        kind: "wide",
        scored: false,
        distanceM: spot.distanceM,
        period,
        random,
        x: spot.x,
      }),
    );
  };

  const tryScore = (
    teamId: string,
    names: string[],
    profile: SideProfile,
    opp: SideProfile,
    oppTactics: Tactics,
    oppNames: string[],
    minute: number,
    direct: number,
    longPuck: number,
    origin: "open" | "press" = "open",
    startCarrier?: string,
  ) => {
    const pendingCredits: StatCredit[] = [];
    let carrier = names[Math.max(0, names.length - 6)] ?? names[0] ?? "a substitute";
    const defendingId = teamId === options.homeId ? options.awayId : options.homeId;
    const withWind = withWindFor(climate, teamId, options.homeId, period);
    const coveringTactics = tacticsFor(teamId);
    if (origin === "press") {
      carrier =
        startCarrier && names.includes(startCarrier)
          ? startCarrier
          : pickIndexed(names, forwardIndices(names), random, (index) => pressWeightOf(teamId, names, index)).name;
    } else if (random() < 0.16 + longPuck * 0.28) {
      const receivers = names.slice(7, 12);
      const oppReceivers = oppNames.slice(4, 9);
      const liveXv = names
        .map((name) => playerOf(teamId, name))
        .filter((player): player is RatedPlayer => Boolean(player));
      const condition =
        teamId === options.homeId ? (options.homeCondition ?? {}) : (options.awayCondition ?? {});
      const target = pickPuckoutTarget(liveXv, tacticsFor(teamId).puckoutTarget, condition);
      const keeper = profile.keeper;
      const keeperForm = keeper ? conditionOf(teamId, keeper.name) : undefined;
      const findChance = applyFormChance(
        puckoutFindTargetChance(
          keeper && keeperForm
            ? matchStat(keeper.ratings.puckoutReach, keeperForm, "puckoutReach")
            : 12,
          keeper && keeperForm ? matchStat(keeper.ratings.passing, keeperForm, "passing") : 11,
          keeper && keeperForm ? matchStat(keeper.ratings.vision, keeperForm, "vision") : 11,
        ) + puckoutWindAdjust(climate, withWind) * 0.35,
        keeper ? formOf(teamId, keeper.name) : 50,
      );
      const foundTarget = Boolean(target && receivers.includes(target.name) && random() < findChance);
      const others = receivers.filter((name) => name !== target?.name);
      const fielder =
        foundTarget && target
          ? target.name
          : pickName(others.length > 0 ? others : receivers.length > 0 ? receivers : names.slice(4, 9), random);
      const oppFielder = pickName(oppReceivers.length > 0 ? oppReceivers : oppNames.slice(0, 9), random);
      const aerialOf = (sideId: string, name: string) => {
        const player = playerOf(sideId, name);
        if (!player) return 12;
        const form = conditionOf(sideId, name);
        return aerialContestRating(
          matchStat(player.ratings.highFielding, form, "highFielding"),
          matchStat(player.ratings.aerialReach, form, "aerialReach"),
          matchStat(player.ratings.strength, form, "strength"),
        );
      };
      const fielderAerial = aerialOf(teamId, fielder);
      const supportAerial =
        receivers
          .filter((name) => name !== fielder)
          .map((name) => aerialOf(teamId, name))
          .reduce((sum, value, _, list) => sum + value / Math.max(list.length, 1), 0) || fielderAerial;
      const markerAerial = aerialOf(defendingId, oppFielder);
      const win =
        random() <
        targetedPuckoutWinChance(
          fielderAerial,
          markerAerial,
          supportAerial,
          foundTarget,
          puckoutWindAdjust(climate, withWind),
        );
      const keeperCredit = keeper
        ? {
            name: keeper.name,
            teamId,
            passesAttempted: 1,
            passesCompleted: foundTarget ? 1 : 0,
            possessions: 1,
          }
        : undefined;
      if (!win) {
        push({
          minute,
          teamId,
          playerName: fielder,
          kind: "puckout",
          text: foundTarget
            ? `Puck-out broken — ${fielder} loses the aerial contest.`
            : `Puck-out broken — meant for ${target?.name ?? "the target"}, ${fielder} loses the break.`,
          credits: mergeCredits([
            ...(keeperCredit ? [keeperCredit] : []),
            { name: fielder, teamId, highFieldingAttempted: 1, puckoutsAttempted: 1 },
            {
              name: oppFielder,
              teamId: defendingId,
              highFieldingAttempted: 1,
              highFieldingWon: 1,
              possessions: 1,
              sequences: 1,
            },
          ]),
        });
        return;
      }
      carrier = fielder;
      const winCredits: StatCredit[] = [
        ...(keeperCredit ? [keeperCredit] : []),
        {
          name: fielder,
          teamId,
          highFieldingAttempted: 1,
          highFieldingWon: 1,
          puckoutsWon: 1,
          puckoutsAttempted: 1,
          possessions: 1,
          sequences: 1,
        },
        { name: oppFielder, teamId: defendingId, highFieldingAttempted: 1 },
      ];
      if (random() < 0.45) {
        push({
          minute,
          teamId,
          playerName: fielder,
          kind: "puckout",
          text: foundTarget
            ? `${fielder} fields the puck-out aimed at him.`
            : `Puck-out off target — ${fielder} fields the puck-out around midfield.`,
          credits: mergeCredits(winCredits),
        });
      } else {
        pendingCredits.push(...winCredits);
      }
    } else if (random() < shortPuckoutTakeChance(longPuck, oppTactics.shape)) {
      const receiver = pickShortPuckoutReceiver(names, oppTactics.shape, random);
      const onFullBack = names.slice(1, 4).includes(receiver);
      const pressDial = clampDial(oppTactics.pressure ?? 48) / 100;
      const hunt =
        forwardIndices(oppNames).length > 0 && random() < Math.min(0.92, 0.4 + pressDial * 0.52);
      const thiefPick = hunt
        ? pickIndexed(oppNames, forwardIndices(oppNames), random, (index) =>
            pressWeightOf(defendingId, oppNames, index),
          )
        : undefined;
      const thiefPlayer = thiefPick ? playerOf(defendingId, thiefPick.name) : undefined;
      const outnumbered = pressOutnumbered(oppNames.length, oppTactics, names.length, coveringTactics);
      const hands = Math.min(1.12, Math.max(0.55, 0.88 - (profile.halfBackHands - 12) * 0.04));
      const winChance = thiefPick
        ? tackleChance(
            thiefPlayer?.ratings.hooking ?? Math.max(8, opp.hooking * 0.72),
            oppTactics.aggression ?? 46,
            oppTactics.pressure ?? 48,
            thiefPlayer?.ratings.strength ?? 11,
            "forward",
            outnumbered,
          ) *
            1.85 *
            hands +
          pressDial * 0.05
        : 0;
      if (hunt && thiefPick && random() < Math.min(0.46, winChance)) {
        push({
          minute,
          teamId,
          playerName: receiver,
          kind: "puckout",
          text: `Short puck-out turned over — ${thiefPick.name} hunts down ${receiver}.`,
          credits: mergeCredits([
            { name: receiver, teamId, passesAttempted: 1, possessions: 1, puckoutsAttempted: 1 },
            {
              name: thiefPick.name,
              teamId: defendingId,
              tacklesAttempted: 1,
              tacklesWon: 1,
              possessions: 1,
              sequences: 1,
            },
          ]),
        });
        tryScore(
          defendingId,
          oppNames,
          opp,
          profile,
          coveringTactics,
          names,
          minute,
          clampDial(oppTactics.build) / 100,
          clampDial(oppTactics.puckout) / 100,
          "press",
          thiefPick.name,
        );
        return;
      }
      if (hunt && thiefPick) {
        push({
          minute,
          teamId: defendingId,
          playerName: thiefPick.name,
          kind: "hook",
          text: `${receiver} has the space to work it back to the keeper under pressure from ${thiefPick.name}.`,
          credits: [{ name: thiefPick.name, teamId: defendingId, tacklesAttempted: 1 }],
        });
      }
      carrier = receiver;
      pendingCredits.push({
        name: receiver,
        teamId,
        possessions: 1,
        sequences: 1,
        puckoutsWon: 1,
        puckoutsAttempted: 1,
      });
      if (random() < 0.42) {
        push({
          minute,
          teamId,
          playerName: receiver,
          kind: "puckout",
          text: onFullBack
            ? oppTactics.shape === "sweeper"
              ? `Short to the full-back line — ${receiver} starts the attack around their sweeper.`
              : `Short to the full-back line — ${receiver} starts the attack.`
            : `${receiver} takes the short puck-out.`,
          credits: mergeCredits(pendingCredits.splice(0, pendingCredits.length)),
        });
      }
    } else {
      const starter = names.slice(6, 15)[Math.floor(statRng() * Math.max(names.slice(6, 15).length, 1))] ?? names[7] ?? carrier;
      carrier = starter;
      pendingCredits.push({ name: starter, teamId, possessions: 1, sequences: 1 });
    }

    if (origin !== "press") {
      if (random() < tackleChance(opp.hooking, oppTactics.aggression ?? 46, oppTactics.pressure ?? 48, opp.strength)) {
        const tackler = pickIndexed(oppNames, backAndMidIndices(oppNames), random);
        const defender = tackler.name;
        push({
          minute,
          teamId,
          playerName: defender,
          kind: "hook",
          text: `Hooked and blocked — ${defender} kills the attack.`,
          credits: mergeCredits([
            ...pendingCredits.splice(0, pendingCredits.length),
            {
              name: defender,
              teamId: defendingId,
              tacklesAttempted: 1,
              tacklesWon: 1,
              possessions: 1,
              sequences: 1,
            },
          ]),
        });
        const out = random();
        if (out < 0.24) attemptSetPiece(teamId, "sixtyFive", profile, minute);
        else if (out < 0.34) attemptSideline(teamId, "attacking", minute);
        return;
      }

      const defendingFitness =
        oppNames.length === 0
          ? 100
          : oppNames.reduce((sum, name) => sum + fitnessOf(conditionOf(defendingId, name)), 0) /
            oppNames.length;
      if (random() < mistimedFoulChance(oppTactics.aggression ?? 46, wet, defendingFitness)) {
        const tackler = pickFouler(oppNames, yellows, random);
        const defender = tackler.name;
        const agg = oppTactics.aggression ?? 46;
        const composure = playerOf(defendingId, defender)?.ratings.composure ?? 12;
        const bookedAlready = yellows.has(defender);
        if (bookedAlready && random() < secondYellowOnFoulChance(agg, composure, wet)) {
          push({
            minute,
            teamId: defendingId,
            playerName: defender,
            kind: "red",
            dismissal: "secondYellow",
            text: sendOffText(defender, "secondYellow", fieldNames(defendingId).length - 1),
            credits: [{ name: defender, teamId: defendingId, tacklesAttempted: 1, freesConceded: 1 }],
          });
          yellows.delete(defender);
          dismiss(defendingId, defender, minute);
        } else if (!bookedAlready && random() < redOnFoulChance(agg, composure, wet)) {
          push({
            minute,
            teamId: defendingId,
            playerName: defender,
            kind: "red",
            dismissal: "straight",
            text: sendOffText(defender, "straight", fieldNames(defendingId).length - 1),
            credits: [{ name: defender, teamId: defendingId, tacklesAttempted: 1, freesConceded: 1 }],
          });
          dismiss(defendingId, defender, minute);
        } else if (!bookedAlready && random() < yellowOnFoulChance(agg, composure, wet)) {
          yellows.add(defender);
          push({
            minute,
            teamId: defendingId,
            playerName: defender,
            kind: "booking",
            text: `Yellow card — ${defender} overcooks the challenge.`,
            credits: [{ name: defender, teamId: defendingId, tacklesAttempted: 1, freesConceded: 1 }],
          });
        } else {
          pendingCredits.push({ name: defender, teamId: defendingId, tacklesAttempted: 1, freesConceded: 1 });
        }
        const longFree = statRng() < 0.38;
        attemptSetPiece(teamId, longFree ? "longFree" : "shortFree", profile, minute, false);
        const last = events.at(-1);
        if (last) last.credits = mergeCredits([...(last.credits ?? []), ...pendingCredits.splice(0, pendingCredits.length)]);
        return;
      }
    }

    const chase = chaseOf(teamId, minute);
    const tactics = withChaseTactics(tacticsFor(teamId), chase);
    const shooting = clampDial(tactics.shooting ?? 50);
    const teamwork = teamId === options.homeId ? homeTeamwork : awayTeamwork;
    const baseComplete = passCompleteChance(climate, direct, teamwork);
    const contestAerial = (sideId: string, name: string) => {
      const player = playerOf(sideId, name);
      if (!player) return 12;
      const form = conditionOf(sideId, name);
      return aerialContestRating(
        matchStat(player.ratings.highFielding, form, "highFielding"),
        matchStat(player.ratings.aerialReach, form, "aerialReach"),
        matchStat(player.ratings.strength, form, "strength"),
      );
    };

    let playerName = carrier;
    let gatheredLong = false;
    let gatheredFullForward = false;
    let gatheredFromBreak = false;
    let lastPasser: string | undefined;
    let moved: { credits: StatCredit[]; carrier: string; retained: boolean; copy?: string; passer?: string } = {
      credits: [],
      carrier,
      retained: true,
    };

    if (origin === "press") {
      playerName =
        random() < 0.58 && names.includes(carrier)
          ? carrier
          : pickIndexed(
              names,
              forwardIndices(names).length > 0 ? forwardIndices(names) : names.map((_, index) => index),
              random,
            ).name;
      const hops = 1;
      const chainPool = names.length > 9 ? names.slice(9) : names.slice(6, 15);
      moved = passChain(
        chainPool,
        teamId,
        statRng,
        hops,
        carrier,
        (name) =>
          applyFormChance(
            baseComplete + passVisionBonus(playerOf(teamId, name)?.ratings.vision ?? 12),
            formOf(teamId, name),
            0.28,
          ),
        (name) => fumbleChance(playerOf(teamId, name)?.ratings.firstTouch ?? 12, formOf(teamId, name)),
      );
      lastPasser = moved.passer;
    } else if (random() < longBallDeliveryChance(direct)) {
      const kickerPool = indicesWhere(names, (index) => index >= 6 && index <= 11);
      const kickerPick = pickIndexed(names, kickerPool.length > 0 ? kickerPool : names.map((_, i) => i), random, (index) => {
        const player = playerOf(teamId, names[index] ?? "");
        return (player?.ratings.passing ?? 11) * 0.5 + (player?.ratings.vision ?? 11) * 0.5;
      });
      const kicker = playerOf(teamId, kickerPick.name);
      lastPasser = kickerPick.name;
      const found = random() <
        applyFormChance(
          longBallFindChance(kicker?.ratings.passing ?? 11, kicker?.ratings.vision ?? 11),
          formOf(teamId, kickerPick.name),
        );
      const lowBall = random() < 0.32;
      const targetPick = pickIndexed(names, forwardIndices(names), random, (index) => {
        const player = playerOf(teamId, names[index] ?? "");
        if (lowBall) {
          return breakHuntRating(
            player?.ratings.speed ?? 11,
            player?.ratings.acceleration ?? 11,
            player?.ratings.offTheBall ?? 11,
            player?.ratings.firstTouch ?? 11,
          );
        }
        const aerial = aerialContestRating(
          player?.ratings.highFielding ?? 11,
          player?.ratings.aerialReach ?? 11,
          player?.ratings.strength ?? 11,
        );
        const ff = index >= 12 ? 0.92 + direct * 0.7 : 0.7;
        return Math.max(0.14, aerial) * ff;
      });
      const fielderPick = found ? targetPick : pickIndexed(names, forwardIndices(names), random);
      const markerName =
        oppNames[markerSlot(fielderPick.index)] ?? pickName(oppNames.slice(1, 7), random);
      const collected = lowBall
        ? random() <
          applyFormChance(
            collectLowBallChance(playerOf(teamId, fielderPick.name)?.ratings.firstTouch ?? 11),
            formOf(teamId, fielderPick.name),
          )
        : random() < longBallWinChance(contestAerial(teamId, fielderPick.name), contestAerial(defendingId, markerName), found);
      pendingCredits.push({
        name: kickerPick.name,
        teamId,
        passesAttempted: 1,
        passesCompleted: found || collected ? 1 : 0,
        possessions: 1,
        sequences: 1,
      });
      const takeGather = (name: string, index: number, fromBreak: boolean) => {
        gatheredLong = true;
        gatheredFullForward = index >= 12;
        gatheredFromBreak = fromBreak;
        playerName = name;
        moved = {
          credits: [
            {
              name,
              teamId,
              highFieldingAttempted: fromBreak || !lowBall ? 1 : 0,
              highFieldingWon: fromBreak || !lowBall ? 1 : 0,
              possessions: 1,
            },
          ],
          carrier: name,
          retained: true,
        };
      };
      if (collected) {
        takeGather(fielderPick.name, fielderPick.index, false);
        if (random() < 0.55) {
          push({
            minute,
            teamId,
            playerName: fielderPick.name,
            kind: "play",
            text: lowBall
              ? `${fielderPick.name} collects the low ball.`
              : gatheredFullForward
                ? found
                  ? `${fielderPick.name} gathers the long ball in the square.`
                  : `Breaking ball in the square — ${fielderPick.name} gathers.`
                : found
                  ? `${kickerPick.name} finds ${fielderPick.name} with the long ball.`
                  : `Breaking ball — ${fielderPick.name} gathers the long delivery.`,
            credits: mergeCredits([...pendingCredits.splice(0, pendingCredits.length), ...moved.credits]),
          });
          moved = { credits: [], carrier: fielderPick.name, retained: true };
        }
      } else {
        const spilled = contestBreak(teamId, names, defendingId, oppNames, fielderPick.name);
        if (spilled.foul) {
          push({
            minute,
            teamId,
            playerName: spilled.name,
            kind: "turnover",
            text: `${spilled.name} barges ${spilled.rival} off the breaking ball and concedes a free.`,
            credits: mergeCredits([
              ...pendingCredits.splice(0, pendingCredits.length),
              { name: fielderPick.name, teamId, highFieldingAttempted: 1 },
              { name: spilled.name, teamId, tacklesAttempted: 1, freesConceded: 1 },
            ]),
          });
          attemptSetPiece(defendingId, "shortFree", opp, minute, false);
          return;
        }
        if (!spilled.won) {
          push({
            minute,
            teamId,
            playerName: fielderPick.name,
            kind: "turnover",
            text: lowBall
              ? `${fielderPick.name} spills the low ball — ${spilled.rival} gathers the break.`
              : `Long ball broken — ${spilled.rival} wins the breaking ball.`,
            credits: mergeCredits([
              ...pendingCredits.splice(0, pendingCredits.length),
              { name: fielderPick.name, teamId, highFieldingAttempted: 1 },
              {
                name: spilled.rival,
                teamId: defendingId,
                highFieldingAttempted: 1,
                highFieldingWon: 1,
                possessions: 1,
                sequences: 1,
              },
            ]),
          });
          return;
        }
        takeGather(spilled.name, spilled.index, true);
        push({
          minute,
          teamId,
          playerName: spilled.name,
          kind: "play",
          text: `${spilled.name} hunts the breaking ball after ${fielderPick.name} cannot collect.`,
          credits: mergeCredits([...pendingCredits.splice(0, pendingCredits.length), ...moved.credits]),
        });
        moved = { credits: [], carrier: spilled.name, retained: true };
      }
    } else {
      const occPick = occasionPressure(minute, matchStage);
      const behindPick = chase.deficit > 0;
      const runPool = indicesWhere(names, (index) => index >= 7);
      playerName = pickIndexed(names, runPool.length > 0 ? runPool : names.map((_, i) => i), random, (index) => {
        const player = playerOf(teamId, names[index] ?? "");
        const run =
          (player?.ratings.acceleration ?? 11) * 0.42 +
          (player?.ratings.offTheBall ?? 11) * 0.42 +
          (player?.ratings.speed ?? 11) * 0.16;
        const aerial = aerialContestRating(
          player?.ratings.highFielding ?? 11,
          player?.ratings.aerialReach ?? 11,
          player?.ratings.strength ?? 11,
        );
        const pressure = (player?.ratings.underPressure ?? 12) * (behindPick ? 0.4 : 0.14) * occPick;
        const line = index >= 12 ? 1.08 : 1;
        return Math.max(0.12, run * (1 - direct) + aerial * direct * 0.35 + pressure) * line;
      }).name;
      const hops = 1 + Math.floor((1 - direct) * 2) + (shooting > 62 ? 1 : 0);
      const chainPool = names.slice(1, 15);
      moved = passChain(
        chainPool,
        teamId,
        statRng,
        hops,
        carrier,
        (name) =>
          applyFormChance(
            baseComplete + passVisionBonus(playerOf(teamId, name)?.ratings.vision ?? 12),
            formOf(teamId, name),
            0.28,
          ),
        (name) => fumbleChance(playerOf(teamId, name)?.ratings.firstTouch ?? 12, formOf(teamId, name)),
      );
      lastPasser = moved.passer;
    }
    if (!moved.retained) {
      const fumble = Boolean(moved.copy && /miscontrol/i.test(moved.copy));
      if (fumble) {
        const fumbler = moved.carrier;
        const spilled = contestBreak(teamId, names, defendingId, oppNames, fumbler);
        if (spilled.won && !spilled.foul) {
          gatheredFromBreak = true;
          playerName = spilled.name;
          moved = {
            credits: [{ name: spilled.name, teamId, possessions: 1 }],
            carrier: spilled.name,
            retained: true,
          };
          push({
            minute,
            teamId,
            playerName: spilled.name,
            kind: "play",
            text: `${spilled.name} picks up the break after ${fumbler} miscontrols.`,
            credits: mergeCredits([...pendingCredits.splice(0, pendingCredits.length), ...moved.credits]),
          });
          moved = { credits: [], carrier: spilled.name, retained: true };
        } else {
          push({
            minute,
            teamId,
            playerName: spilled.foul ? spilled.name : moved.carrier,
            kind: "turnover",
            text: spilled.foul
              ? `${spilled.name} shoves ${spilled.rival} off the break and concedes a free.`
              : moved.copy ?? `${moved.carrier} miscontrols the ball.`,
            credits: mergeCredits([
              ...pendingCredits.splice(0, pendingCredits.length),
              ...moved.credits,
              ...(spilled.foul ? [{ name: spilled.name, teamId, tacklesAttempted: 1, freesConceded: 1 }] : []),
            ]),
          });
          if (spilled.foul) {
            attemptSetPiece(defendingId, "shortFree", opp, minute, false);
          } else if (random() < 0.12) attemptSideline(defendingId, "midfield", minute);
          return;
        }
      } else {
        push({
          minute,
          teamId,
          playerName: moved.carrier,
          kind: "turnover",
          text:
            moved.copy ??
            (climate.sky === "wet"
              ? `Slippery striking — pass goes astray from ${moved.carrier}.`
              : `Pass goes astray from ${moved.carrier}.`),
          credits: mergeCredits([...pendingCredits.splice(0, pendingCredits.length), ...moved.credits]),
        });
        if (random() < 0.12) attemptSideline(defendingId, "midfield", minute);
        return;
      }
    }
    const shooter = playerOf(teamId, playerName);
    const shooterIndex = Math.max(0, names.indexOf(playerName));
    const striking = shooter?.ratings.strikingDistance ?? 12;
    const composure = shooter?.ratings.composure ?? 12;
    const finishing = shooter?.ratings.shooting ?? striking;
    const markerName = oppNames[markerSlot(shooterIndex)] ?? "";
    const marker = playerOf(defendingId, markerName);
    const mismatch = paceMismatch(
      shooter?.ratings.speed ?? 11,
      shooter?.ratings.acceleration ?? 11,
      marker?.ratings.speed ?? 11,
      marker?.ratings.acceleration ?? 11,
      marker?.ratings.manMarking ?? 12,
    );
    const paceBoost = origin === "press" ? { closer: 0, goal: 0, convert: 0 } : runningLookBoost(mismatch, shooterIndex >= 12);
    const runShare = origin === "press" ? 0 : 1 - direct;
    const distanceM0 = origin === "press"
      ? Math.max(10, Math.min(36, 15 + random() * 18 - (finishing - 12) * 0.35))
      : gatheredLong
        ? gatheredFullForward
          ? Math.max(7, Math.min(16, 8 + random() * 8))
          : Math.max(12, Math.min(28, 16 + random() * 12))
        : shotDistanceM(shooting, striking, random);
    let distanceM = distanceM0;
    if (chase.huntGoals) {
      distanceM = Math.max(10, Math.min(30, 11 + random() * 16));
    } else if (gatheredLong && gatheredFullForward) {
      distanceM = Math.min(distanceM, 16);
    } else if (origin !== "press" && random() < paceBoost.closer * runShare) {
      distanceM = Math.max(8, Math.min(distanceM, 10 + random() * 12));
    }
    const passerVision = lastPasser ? (playerOf(teamId, lastPasser)?.ratings.vision ?? 12) : 12;
    const visionLook = lastPasser ? visionScoringLookChance(passerVision) : 0;
    if (origin !== "press" && random() < visionLook) {
      distanceM = Math.max(8, Math.min(distanceM, 12 + random() * 14));
    }
    if (shooting >= 78 && distanceM > 42 && random() < 0.28 && !chase.huntGoals && !gatheredLong) {
      pendingCredits.push(...moved.credits);
      return;
    }
    const intoShooter = deliverTo(teamId, moved.carrier, playerName);
    const sweeperOn = oppNames.length >= 15 && oppTactics.shape === "sweeper";
    const sweeperCut = !sweeperOn
      ? 1
      : origin === "press"
        ? 0.55
        : gatheredLong && gatheredFullForward
          ? 0.78
          : 0.32;
    const fiveForwardCut = tactics.shape === "sweeper" && names.length >= 15 ? 0.82 : 1;
    const numbers = numbersFinishMul(names.length, oppNames.length);
    const wind = conversionContext(climate, teamId, options.homeId, period);
    const occ = occasionPressure(minute, matchStage);
    const levelling = chase.deficit >= 1 && chase.deficit <= 3;
    const pressureMul = underPressureMul(shooter?.ratings.underPressure ?? 12, occ, levelling);
    const convert =
      (chaoticConvert(
        applyFormChance(
          openPlayConversion({
            strikingDistance: striking,
            composure,
            shooting,
            finishing,
            distanceM,
            withWind: wind.withWind,
            crossWind: wind.crossWind,
            wet: wind.wet,
          }),
          formOf(teamId, playerName),
        ),
        matchChaos(tacticsFor(options.homeId), tacticsFor(options.awayId)),
        random,
      ) *
        (chase.huntGoals ? 0.36 : chase.chasing ? 1.1 : 1) +
        paceBoost.convert * runShare +
        visionLook * 0.06) *
      pressureMul *
      numbers.convert;
    const goalChance =
      (goalChanceFromDistance(distanceM, sweeperCut) *
        fiveForwardCut *
        numbers.goal *
        (gatheredLong && gatheredFullForward ? 1.45 : direct > 0.6 ? 1.2 : 1) *
        (origin === "press" ? 1.65 : 1) *
        (chase.huntGoals ? 2.15 : chase.chasing ? 1.12 : 1) +
        (gatheredLong && gatheredFullForward ? 0.12 : 0) +
        (direct > 0.62 && distanceM < 22 ? 0.05 : 0) +
        (origin === "press" && distanceM < 24 ? 0.06 : 0) +
        (chase.huntGoals && distanceM < 26 ? 0.08 : 0) +
        paceBoost.goal * runShare +
        visionLook * 0.03) *
      (levelling ? pressureMul : 1 + (pressureMul - 1) * 0.5);
    const flush = (extra: StatCredit[]) =>
      mergeCredits([...pendingCredits.splice(0, pendingCredits.length), ...moved.credits, ...intoShooter, ...extra]);
    const record = (kind: ShotAttempt["kind"], scored: boolean) => {
      shots.push(
        makeShot({
          minute,
          teamId,
          homeId: options.homeId,
          playerName,
          kind,
          scored,
          distanceM,
          period,
          random,
        }),
      );
    };

    if (random() < goalChance) {
      const keeper = opp.keeper?.name ?? "the goalkeeper";
      const saveChance = applyFormChance(0.16 + opp.defence * 0.006, opp.keeper ? formOf(defendingId, opp.keeper.name) : 50);
      if (random() < saveChance) {
        push({
          minute,
          teamId,
          playerName,
          kind: "save",
          text: `Saved — ${keeper} keeps out ${playerName}.`,
          credits: flush([
            { name: playerName, teamId, shots: 1 },
            ...(opp.keeper ? [{ name: keeper, teamId: defendingId, tacklesAttempted: 1, tacklesWon: 1 }] : []),
          ]),
        });
        record("save", false);
        if (random() < 0.58 + direct * 0.1) {
          attemptSetPiece(teamId, "sixtyFive", profile, minute);
        }
        return;
      }
      credit(teamId, "goal");
      push({
        minute,
        teamId,
        playerName,
        kind: "goal",
        text:
          origin === "press"
            ? `GOAL! ${playerName} punishes the turnover.`
            : gatheredFromBreak
              ? `GOAL! ${playerName} finishes from the break.`
              : gatheredLong && gatheredFullForward
                ? `GOAL! ${playerName} gathers the long ball and finishes.`
                : `GOAL! ${playerName} finds the net.`,
        credits: flush([{ name: playerName, teamId, shots: 1, scores: 1 }]),
      });
      record("goal", true);
      return;
    }

    if (random() > convert) {
      push({
        minute,
        teamId,
        playerName,
        kind: "wide",
        text:
          distanceM >= 55
            ? `Wide from distance — ${playerName} pulls the trigger from ${Math.round(distanceM)} metres.`
            : `Wide from ${playerName}.`,
        credits: flush([{ name: playerName, teamId, shots: 1 }]),
      });
      record("wide", false);
      return;
    }

    credit(teamId, "point");
    const fromPlay =
      origin === "press"
        ? `${playerName} points from the turnover.`
        : gatheredFromBreak
          ? `${playerName} points from the breaking ball.`
          : gatheredLong && gatheredFullForward
            ? `${playerName} points after gathering the long ball.`
            : distanceM >= 50
              ? `${playerName} points from distance.`
              : `${playerName} points from play, worked through midfield.`;
    push({
      minute,
      teamId,
      playerName,
      kind: "point",
      text: fromPlay,
      credits: flush([{ name: playerName, teamId, shots: 1, scores: 1 }]),
    });
    record("point", true);
  };

  const playGroundContest = (minute: number) => {
    const homeOnBall = random() < 0.5 + (momentum - 50) / 220 + (homeNames.length - awayNames.length) * 0.09;
    const defendingId = homeOnBall ? options.awayId : options.homeId;
    const attackingId = homeOnBall ? options.homeId : options.awayId;
    const defTactics = homeOnBall ? awayEffTactics : homeEffTactics;
    const attTactics = homeOnBall ? homeEffTactics : awayEffTactics;
    const defProfile = homeOnBall ? away : home;
    const attProfile = homeOnBall ? home : away;
    const defNames = homeOnBall ? awayNames : homeNames;
    const attNames = homeOnBall ? homeNames : awayNames;
    const pressDial = clampDial(defTactics.pressure ?? 48) / 100;
    const attShort = 1 - clampDial(attTactics.puckout ?? 58) / 100;
    const pressShare = 0.16 + pressDial * 0.32 + attShort * 0.18;
    const isPress = random() < pressShare && forwardIndices(defNames).length > 0;
    const tackler = isPress
      ? pickIndexed(defNames, forwardIndices(defNames), random, (index) => pressWeightOf(defendingId, defNames, index))
      : pickIndexed(defNames, backAndMidIndices(defNames), random);
    const carrier = isPress
      ? pickIndexed(attNames, outFromBackIndices(attNames), random)
      : pickIndexed(
          attNames,
          indicesWhere(attNames, (index) => index >= 4),
          random,
        );
    const role = isPress ? "forward" : tackleRoleAt(tackler.index);
    const outnumbered = isPress
      ? pressOutnumbered(defNames.length, defTactics, attNames.length, attTactics)
      : false;
    const tacklerPlayer = playerOf(defendingId, tackler.name);
    const hooking =
      tacklerPlayer?.ratings.hooking ?? (role === "forward" ? Math.max(8, defProfile.hooking * 0.72) : defProfile.hooking);
    const strength = tacklerPlayer?.ratings.strength ?? defProfile.strength;
    const winChance = isPress
      ? Math.min(
          0.42,
          tackleChance(
            hooking,
            defTactics.aggression ?? 46,
            defTactics.pressure ?? 48,
            strength,
            role,
            outnumbered,
          ) * 1.35,
        )
      : Math.min(
          0.78,
          0.48 +
            tackleChance(
              hooking,
              defTactics.aggression ?? 46,
              defTactics.pressure ?? 48,
              strength,
              role,
            ) * 1.15,
        );
    const win = random() < winChance;
    if (win) {
      push({
        minute,
        teamId: defendingId,
        playerName: tackler.name,
        kind: "hook",
        text: isPress
          ? `${tackler.name} turns ${carrier.name} over in their own half.`
          : `${tackler.name} wins the tackle on ${carrier.name}.`,
        credits: mergeCredits([
          {
            name: tackler.name,
            teamId: defendingId,
            tacklesAttempted: 1,
            tacklesWon: 1,
            ...(isPress ? { possessions: 1, sequences: 1 } : {}),
          },
        ]),
      });
      if (isPress && random() < 0.16) {
        tryScore(
          defendingId,
          defNames,
          defProfile,
          attProfile,
          attTactics,
          attNames,
          minute,
          clampDial(defTactics.build) / 100,
          clampDial(defTactics.puckout) / 100,
          "press",
          tackler.name,
        );
      }
      const carrierIndex = carrier.index;
      const out = random();
      if (!isPress && carrierIndex >= 9 && out < 0.2) attemptSetPiece(attackingId, "sixtyFive", attProfile, minute);
      else if (!isPress && out < 0.1) {
        const zone: SidelineZone = carrierIndex >= 9 ? "attacking" : carrierIndex >= 7 ? "midfield" : "defensive";
        attemptSideline(attackingId, zone, minute);
      }
      return;
    }
    push({
      minute,
      teamId: defendingId,
      playerName: tackler.name,
      kind: "hook",
      text: isPress
        ? `${carrier.name} has the space to recycle it past ${tackler.name}.`
        : `${tackler.name} hooks ${carrier.name} but the ball stays in play.`,
      credits: [{ name: tackler.name, teamId: defendingId, tacklesAttempted: 1 }],
    });
  };

  for (let minute = startMinute; minute <= endMinute; minute += 1) {
    if (period !== "second" && minute === 31) {
      push({
        minute,
        teamId: options.homeId,
        playerName: "",
        kind: "half",
        text: "Half-time whistle.",
        credits: period === "first" ? flushMinutes(minute) : undefined,
      });
      if (period === "first") break;
      continue;
    }
    for (const item of options.forcedRemovals ?? []) {
      if (item.minute !== minute || item.kind !== "red") continue;
      if (!fieldNames(item.teamId).includes(item.name)) continue;
      push({
        minute,
        teamId: item.teamId,
        playerName: item.name,
        kind: "red",
        dismissal: "straight",
        text: sendOffText(item.name, "straight", fieldNames(item.teamId).length - 1),
        credits: [{ name: item.name, teamId: item.teamId, tacklesAttempted: 1, freesConceded: 1 }],
      });
      dismiss(item.teamId, item.name, minute);
    }
    for (const rolled of scheduledInjuries) {
      if (rolled.minute !== minute) continue;
      if (!fieldNames(rolled.event.teamId).includes(rolled.name)) continue;
      replaceInjured(rolled.event.teamId, rolled.name, minute, rolled);
    }
    const homeChase = chaseOf(options.homeId, minute);
    const awayChase = chaseOf(options.awayId, minute);
    homeEffTactics = withChaseTactics(homeLiveTactics, homeChase);
    awayEffTactics = withChaseTactics(awayLiveTactics, awayChase);
    if (homeChase.chasing) homeChaseAcc += homeChase.energy;
    if (awayChase.chasing) awayChaseAcc += awayChase.energy;
    playGroundContest(minute);
    if (random() < 0.55) playGroundContest(minute);
    const tilt = (momentum - 50) / 50;
    const chaos = matchChaos(homeEffTactics, awayEffTactics);
    const homeLooks =
      rollLookCount(
        attackLookChance(
          home.attack + homeChase.energy * (homeChase.huntGoals ? 0.85 : 1.05),
          away.defence - awayChase.energy * (awayChase.huntGoals ? 1.15 : 0.38),
          tilt,
          chaos,
          defensiveSit(homeEffTactics),
        ) * numbersLookMul(homeNames.length, awayNames.length),
        random,
      ) +
      (random() < luckyLookChance(chaos) ? 1 : 0) +
      (homeChase.chasing && random() < 0.07 + homeChase.energy * (homeChase.huntGoals ? 0.12 : 0.16) ? 1 : 0) +
      (awayChase.chasing && random() < (awayChase.huntGoals ? 0.12 : 0.025) * awayChase.energy ? 1 : 0);
    for (let look = 0; look < homeLooks; look += 1) {
      tryScore(
        options.homeId,
        homeNames,
        home,
        away,
        awayEffTactics,
        awayNames,
        minute,
        homeDirect,
        homeLongPuck,
      );
    }
    const awayLooks =
      rollLookCount(
        attackLookChance(
          away.attack + awayChase.energy * (awayChase.huntGoals ? 0.85 : 1.05),
          home.defence - homeChase.energy * (homeChase.huntGoals ? 1.15 : 0.38),
          -tilt,
          chaos,
          defensiveSit(awayEffTactics),
        ) * numbersLookMul(awayNames.length, homeNames.length),
        random,
      ) +
      (random() < luckyLookChance(chaos) ? 1 : 0) +
      (awayChase.chasing && random() < 0.07 + awayChase.energy * (awayChase.huntGoals ? 0.12 : 0.16) ? 1 : 0) +
      (homeChase.chasing && random() < (homeChase.huntGoals ? 0.12 : 0.025) * homeChase.energy ? 1 : 0);
    for (let look = 0; look < awayLooks; look += 1) {
      tryScore(
        options.awayId,
        awayNames,
        away,
        home,
        homeEffTactics,
        homeNames,
        minute,
        awayDirect,
        awayLongPuck,
      );
    }
    const margin = scoreTotal(homeScore) - scoreTotal(awayScore);
    if (random() < lateEqualizerLookChance(minute, margin)) {
      const trailingIsHome = margin < 0;
      if (trailingIsHome) {
        tryScore(
          options.homeId,
          homeNames,
          home,
          away,
          awayEffTactics,
          awayNames,
          minute,
          homeDirect,
          homeLongPuck,
        );
      } else {
        tryScore(
          options.awayId,
          awayNames,
          away,
          home,
          homeEffTactics,
          homeNames,
          minute,
          awayDirect,
          awayLongPuck,
        );
      }
    }
    const marginAfter = scoreTotal(homeScore) - scoreTotal(awayScore);
    if (random() < lateSoftFreeChance(minute, marginAfter)) {
      const trailingId = marginAfter > 0 ? options.awayId : options.homeId;
      const leadingId = marginAfter > 0 ? options.homeId : options.awayId;
      const trailing = marginAfter > 0 ? away : home;
      const leadingNames = marginAfter > 0 ? homeNames : awayNames;
      attemptSetPiece(trailingId, random() < 0.64 ? "shortFree" : "longFree", trailing, minute);
      const last = events.at(-1);
      const culprit = pickIndexed(leadingNames, backAndMidIndices(leadingNames), random);
      if (last) {
        last.credits = mergeCredits([
          ...(last.credits ?? []),
          { name: culprit.name, teamId: leadingId, freesConceded: 1 },
        ]);
      }
    }
    if (options.clubId) {
      const ourChase = chaseOf(options.clubId, minute);
      const tip = liveCoachTip(events, tacticsFor(options.clubId), options.clubId, minute, ourChase);
      if (tip) {
        push({
          minute,
          teamId: options.clubId,
          playerName: "",
          kind: "coach",
          text: tip,
        });
      }
    }
  }

  if (period !== "first") {
    push({
      minute: 62,
      teamId: options.homeId,
      playerName: "",
      kind: "full",
      text: "Full-time.",
      credits: flushMinutes(62),
    });
  }

  const homeChaseEffort = chaseEffortFromAcc(homeChaseAcc);
  const awayChaseEffort = chaseEffortFromAcc(awayChaseAcc);
  const tallied = statsFromEvents(events, {
    homeId: options.homeId,
    awayId: options.awayId,
    homeSheet,
    awaySheet,
    homeCondition: options.homeCondition,
    awayCondition: options.awayCondition,
    homeTactics,
    awayTactics,
    gameSeed: options.gameSeed,
    balance: options.balance,
    homeChaseEffort,
    awayChaseEffort,
  });
  const coachReport = buildCoachReport({
    clubId: options.clubId,
    homeId: options.homeId,
    awayId: options.awayId,
    homeName: options.homeName ?? "Home",
    awayName: options.awayName ?? "Away",
    homeTactics,
    awayTactics,
    homeStats: tallied.homeStats,
    awayStats: tallied.awayStats,
    homeScore,
    awayScore,
    players: tallied.players,
    events,
    climate,
    homeTeamwork,
    awayTeamwork,
    condition: options.clubId
      ? options.clubId === options.homeId
        ? options.homeCondition
        : options.clubId === options.awayId
          ? options.awayCondition
          : options.homeCondition
      : options.homeCondition,
  });

  const homeClosingSheet = closingSheetFromSlots(homeSheet, homeSlots, homeSubs, homeOut);
  const awayClosingSheet = closingSheetFromSlots(awaySheet, awaySlots, awaySubs, awayOut);

  return {
    matchId: options.matchId,
    homeId: options.homeId,
    awayId: options.awayId,
    homeScore,
    awayScore,
    events,
    homeTactics,
    awayTactics,
    homeSheet,
    awaySheet,
    homeClosingSheet,
    awayClosingSheet,
    homeStats: tallied.homeStats,
    awayStats: tallied.awayStats,
    players: tallied.players,
    coachReport,
    gameSeed: options.gameSeed,
    balance: options.balance,
    climate,
    shots,
    homeChaseEffort,
    awayChaseEffort,
    matchInjuries: matchInjuries.map((item) => ({
      name: item.name,
      teamId: item.event.teamId,
      minute: item.minute,
      injury: item.injury,
    })),
  };
}

export function scoreFromEvents(
  events: MatchEvent[],
  homeId: string,
  upTo = events.length,
): { home: Score; away: Score } {
  let home: Score = { goals: 0, points: 0 };
  let away: Score = { goals: 0, points: 0 };
  for (const event of events.slice(0, upTo)) {
    const kind = scoreKindOf(event.kind);
    if (!kind) continue;
    if (event.teamId === homeId) home = addScore(home, kind);
    else away = addScore(away, kind);
  }
  return { home, away };
}

export function momentumAt(events: MatchEvent[], upTo = events.length): number {
  const slice = events.slice(0, upTo);
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const value = slice[i]?.momentum;
    if (typeof value === "number") return value;
  }
  return 50;
}
