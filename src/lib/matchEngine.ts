import type {
  MatchClimate,
  MatchEvent,
  MatchEventKind,
  PlayerCondition,
  Score,
  ShotAttempt,
  SimulatedMatch,
  StatCredit,
  Tactics,
  TeamSheet,
} from "../types";
import { clampDial } from "./attributes";
import { buildCoachReport, liveCoachTip } from "./coach";
import { mergeCredits, passChain, deliverTo, statsFromEvents } from "./matchStats";
import { clubTactics, defaultSheet, sheetPlayers, sideProfile, type SideProfile } from "./players";
import {
  conversionContext,
  goalChanceFromDistance,
  makeShot,
  openPlayConversion,
  setPieceConversion,
  shotDistanceM,
} from "./shooting";
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

export function sidelineChance(sidelines: number, strikingDistance: number): number {
  return Math.min(0.72, Math.max(0.1, 0.06 + sidelines * 0.028 + strikingDistance * 0.008));
}

export function tackleChance(hooking: number, aggression: number, pressure = 48): number {
  const physical = clampDial(aggression) / 100;
  const press = clampDial(pressure) / 100;
  return Math.min(0.28, Math.max(0.08, 0.1 + hooking * 0.004 + physical * 0.07 + press * 0.06));
}

export function mistimedFoulChance(aggression: number): number {
  return Math.min(0.32, Math.max(0.03, 0.035 + (clampDial(aggression) / 100) * 0.22));
}

export function yellowOnFoulChance(aggression: number): number {
  return Math.min(0.4, Math.max(0.02, 0.04 + (clampDial(aggression) / 100) * 0.3));
}

export function redOnFoulChance(aggression: number): number {
  return Math.min(0.16, Math.max(0.02, 0.03 + (clampDial(aggression) / 100) * 0.1));
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
  "booking",
  "red",
  "half",
  "coach",
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

function pickForward(profile: SideProfile, names: string[], random: () => number): string {
  const named = profile.shortFreeTaker?.name ?? profile.longFreeTaker?.name;
  if (named && random() < 0.22) return named;
  const pool = names.slice(Math.max(0, names.length - 8));
  return pool[Math.floor(random() * Math.max(pool.length, 1))] ?? named ?? "a substitute";
}

function pickName(names: string[], random: () => number): string {
  return names[Math.floor(random() * Math.max(names.length, 1))] ?? "a substitute";
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
  climate?: MatchClimate;
}): SimulatedMatch {
  const period = options.period ?? "full";
  const seedKey = period === "second" ? `${options.seed}:${options.matchId}:second` : `${options.seed}:${options.matchId}`;
  const random = createRng(seedFrom(seedKey));
  const statRng = createRng(seedFrom(`${seedKey}:stats`));
  const climate = climateOf(options.climate ?? rollClimate(options.seed, options.matchId));
  const shots: ShotAttempt[] = [];
  const homeSheet = options.homeSheet ?? defaultSheet(options.homeId);
  const awaySheet = options.awaySheet ?? defaultSheet(options.awayId);
  const homeTactics = options.homeTactics ?? clubTactics(options.homeId);
  const awayTactics = options.awayTactics ?? clubTactics(options.awayId);
  const home = sideProfile(options.homeId, homeSheet, homeTactics, options.homeCondition, options.gameSeed, climate);
  const away = sideProfile(options.awayId, awaySheet, awayTactics, options.awayCondition, options.gameSeed, climate);
  const homeDirect = clampDial(homeTactics.build) / 100;
  const awayDirect = clampDial(awayTactics.build) / 100;
  const homeLongPuck = clampDial(homeTactics.puckout) / 100;
  const awayLongPuck = clampDial(awayTactics.puckout) / 100;

  let homeScore: Score = options.startHome ?? { goals: 0, points: 0 };
  let awayScore: Score = options.startAway ?? { goals: 0, points: 0 };
  let momentum = options.startMomentum ?? 50;
  const events: MatchEvent[] = [];
  const homeNames = homeSheet.starters;
  const awayNames = awaySheet.starters;
  const homeXv = sheetPlayers(options.homeId, homeSheet, options.gameSeed);
  const awayXv = sheetPlayers(options.awayId, awaySheet, options.gameSeed);
  const playerOf = (teamId: string, name: string) =>
    (teamId === options.homeId ? homeXv : awayXv).find((player) => player.name === name);
  const periodMinutes = period === "first" ? 32 : period === "second" ? 30 : 62;

  const push = (event: Omit<MatchEvent, "momentum">) => {
    momentum = nextMomentum(momentum, event, options.homeId);
    events.push({ ...event, momentum });
  };

  const tacticsFor = (teamId: string) => (teamId === options.homeId ? homeTactics : awayTactics);

  const minuteCredits = (sheet: TeamSheet, teamId: string): StatCredit[] =>
    sheet.starters.map((name) => ({ name, teamId, minutes: periodMinutes }));

  const credit = (teamId: string, kind: "point" | "goal") => {
    if (teamId === options.homeId) homeScore = addScore(homeScore, kind);
    else awayScore = addScore(awayScore, kind);
  };

  const attackChance = (attack: number, defence: number, toward: number) =>
    Math.min(0.86, Math.max(0.58, 0.7 + (attack - defence) * 0.02 + toward * 0.05));

  const attemptSetPiece = (
    teamId: string,
    kind: "free" | "sixtyFive" | "sideline" | "longFree" | "shortFree",
    profile: SideProfile,
    minute: number,
    newSequence = true,
  ) => {
    const resolved =
      kind === "sideline" ? "sideline" : kind === "sixtyFive" || kind === "longFree" ? "longFree" : "shortFree";
    const taker =
      resolved === "sideline"
        ? profile.sidelineTaker
        : resolved === "longFree"
          ? profile.longFreeTaker
          : profile.shortFreeTaker;
    const playerName = taker?.name ?? pickName(teamId === options.homeId ? homeNames : awayNames, random);
    const eventKind: MatchEventKind = resolved === "sideline" ? "sideline" : kind === "sixtyFive" ? "sixtyFive" : "free";
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
          : eventKind === "sixtyFive"
            ? sixtyFiveChance(
                taker?.ratings.frees ?? 11,
                taker?.ratings.strikingDistance ?? 11,
                taker?.ratings.composure ?? 11,
              )
            : sidelineChance(taker?.ratings.sidelines ?? 11, taker?.ratings.strikingDistance ?? 11);

    const distanceM =
      eventKind === "sixtyFive" ? 65 : resolved === "longFree" ? 52 : resolved === "sideline" ? 46 : 28;
    const wind = conversionContext(climate, teamId, options.homeId, period);
    const chance = setPieceConversion(rawChance, distanceM, wind.withWind, wind.crossWind);

    const gain: StatCredit = { name: playerName, teamId, possessions: 1, sequences: newSequence ? 1 : 0 };
    const scored = random() < chance;
    if (scored) {
      credit(teamId, "point");
      const text =
        eventKind === "free"
          ? resolved === "longFree"
            ? `${playerName} points from a long free.`
            : `${playerName} points from a short free.`
          : eventKind === "sixtyFive"
            ? `65 — ${playerName} splits the posts.`
            : `Sideline cut from ${playerName}.`;
      push({
        minute,
        teamId,
        playerName,
        kind: eventKind,
        text,
        credits: [{ ...gain, shots: 1, scores: 1 }],
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
            : eventKind === "sixtyFive"
              ? `${playerName}'s 65 drops short.`
              : `${playerName}'s sideline drifts wide.`,
        credits: [{ ...gain, shots: 1 }],
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
  ) => {
    const pendingCredits: StatCredit[] = [];
    let carrier = names[Math.max(0, names.length - 6)] ?? names[0] ?? "a substitute";
    const defendingId = teamId === options.homeId ? options.awayId : options.homeId;
    const withWind = withWindFor(climate, teamId, options.homeId, period);
    if (random() < 0.16 + longPuck * 0.28) {
      const win =
        random() <
        Math.min(
          0.78,
          Math.max(
            0.22,
            0.5 +
              (profile.puckout + profile.aerial - opp.aerial * 1.05 - 12) * 0.03 +
              puckoutWindAdjust(climate, withWind),
          ),
        );
      const fielder = pickName(names.slice(4, 9), random);
      const oppFielder = pickName(oppNames.slice(4, 9), random);
      if (!win) {
        push({
          minute,
          teamId,
          playerName: fielder,
          kind: "puckout",
          text: `Puck-out broken — ${fielder} loses the aerial contest.`,
          credits: mergeCredits([
            { name: fielder, teamId, highFieldingAttempted: 1 },
            {
              name: oppFielder,
              teamId: defendingId,
              highFieldingAttempted: 1,
              highFieldingWon: 1,
              puckoutsWon: 1,
              possessions: 1,
              sequences: 1,
            },
          ]),
        });
        return;
      }
      carrier = fielder;
      const winCredits: StatCredit[] = [
        {
          name: fielder,
          teamId,
          highFieldingAttempted: 1,
          highFieldingWon: 1,
          puckoutsWon: 1,
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
          text: `${fielder} fields the puck-out around midfield.`,
          credits: mergeCredits(winCredits),
        });
      } else {
        pendingCredits.push(...winCredits);
      }
    } else if (random() < 0.12 + (1 - longPuck) * 0.28) {
      const safe = Math.min(0.82, Math.max(0.35, 0.42 + (profile.halfBackHands - 12) * 0.04));
      const halfBack = pickName(names.slice(4, 7), random);
      if (random() > safe) {
        const thief = pickName(oppNames.slice(0, 9), statRng);
        push({
          minute,
          teamId,
          playerName: halfBack,
          kind: "puckout",
          text: `Short puck-out turned over on ${halfBack}.`,
          credits: mergeCredits([
            { name: halfBack, teamId, passesAttempted: 1 },
            {
              name: thief,
              teamId: defendingId,
              tacklesAttempted: 1,
              tacklesWon: 1,
              possessions: 1,
              sequences: 1,
            },
          ]),
        });
        return;
      }
      carrier = halfBack;
      pendingCredits.push({ name: halfBack, teamId, possessions: 1, sequences: 1, puckoutsWon: 1 });
    } else {
      const starter = names.slice(6, 15)[Math.floor(statRng() * Math.max(names.slice(6, 15).length, 1))] ?? names[7] ?? carrier;
      carrier = starter;
      pendingCredits.push({ name: starter, teamId, possessions: 1, sequences: 1 });
    }

    if (random() < tackleChance(opp.hooking, oppTactics.aggression ?? 46, oppTactics.pressure ?? 48)) {
      const defender = pickName(oppNames.slice(0, 7), random);
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
      return;
    }

    if (random() < mistimedFoulChance(oppTactics.aggression ?? 46)) {
      const defender = pickName(oppNames.slice(0, 7), random);
      const agg = oppTactics.aggression ?? 46;
      if (random() < yellowOnFoulChance(agg)) {
        const red = random() < redOnFoulChance(agg);
        push({
          minute,
          teamId: defendingId,
          playerName: defender,
          kind: red ? "red" : "booking",
          text: red
            ? `RED CARD — ${defender} is sent off.`
            : `Yellow card — ${defender} overcooks the challenge.`,
          credits: [{ name: defender, teamId: defendingId, tacklesAttempted: 1 }],
        });
      } else {
        pendingCredits.push({ name: defender, teamId: defendingId, tacklesAttempted: 1 });
      }
      const longFree = statRng() < 0.38;
      attemptSetPiece(teamId, longFree ? "longFree" : "shortFree", profile, minute, false);
      const last = events.at(-1);
      if (last) last.credits = mergeCredits([...(last.credits ?? []), ...pendingCredits.splice(0, pendingCredits.length)]);
      return;
    }

    const deadBallShare = 0.2 + profile.deadBall * 0.012 + direct * 0.06;
    if (random() < deadBallShare) {
      const roll = random();
      if (roll < 0.18) attemptSetPiece(teamId, "sixtyFive", profile, minute, false);
      else if (roll < 0.28) attemptSetPiece(teamId, "sideline", profile, minute, false);
      else attemptSetPiece(teamId, roll >= 0.65 ? "longFree" : "shortFree", profile, minute, false);
      const last = events.at(-1);
      if (last) {
        last.credits = mergeCredits([
          ...(last.credits ?? []),
          ...pendingCredits.splice(0, pendingCredits.length),
        ]);
      }
      return;
    }

    const playerName = pickForward(profile, names, random);
    const tactics = tacticsFor(teamId);
    const shooting = clampDial(tactics.shooting ?? 50);
    const hops = 1 + Math.floor((1 - direct) * 2) + (shooting > 62 ? 1 : 0);
    const moved = passChain(
      names.slice(6, 15),
      teamId,
      statRng,
      hops,
      carrier,
      passCompleteChance(climate, direct),
    );
    if (!moved.retained) {
      push({
        minute,
        teamId,
        playerName: moved.carrier,
        kind: "turnover",
        text:
          climate.sky === "wet"
            ? `Slippery striking — pass goes astray from ${moved.carrier}.`
            : `Pass goes astray from ${moved.carrier}.`,
        credits: mergeCredits([...pendingCredits.splice(0, pendingCredits.length), ...moved.credits]),
      });
      return;
    }
    const shooter = playerOf(teamId, playerName);
    const striking = shooter?.ratings.strikingDistance ?? 12;
    const composure = shooter?.ratings.composure ?? 12;
    const distanceM0 = shotDistanceM(shooting, striking, random);
    let distanceM = distanceM0;
    if (direct > 0.62 && random() < 0.18 + (profile.aerial - 12) * 0.012) {
      distanceM = 10 + random() * 14;
    }
    if (shooting >= 78 && distanceM > 42 && random() < 0.28) {
      pendingCredits.push(...moved.credits);
      return;
    }
    const intoShooter = deliverTo(teamId, moved.carrier, playerName);
    const sweeperCut = oppTactics.shape === "sweeper" ? 0.62 : 1;
    const wind = conversionContext(climate, teamId, options.homeId, period);
    const convert = openPlayConversion({
      strikingDistance: striking,
      composure,
      shooting,
      distanceM,
      withWind: wind.withWind,
      crossWind: wind.crossWind,
      wet: wind.wet,
    });
    const goalChance =
      goalChanceFromDistance(distanceM, sweeperCut) * (direct > 0.6 ? 1.2 : 1) +
      (direct > 0.62 && distanceM < 22 ? 0.05 : 0);
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
      if (random() < 0.16 + opp.defence * 0.006) {
        const keeper = opp.keeper?.name ?? "the goalkeeper";
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
        if (random() < 0.35 + direct * 0.1) {
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
        text: `GOAL! ${playerName} finds the net.`,
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
      if (direct > 0.55 && random() < 0.12 + direct * 0.12) {
        attemptSetPiece(teamId, "sixtyFive", profile, minute);
      }
      return;
    }

    credit(teamId, "point");
    const fromPlay =
      distanceM >= 50
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
    const homeOnBall = random() < 0.5 + (momentum - 50) / 220;
    const defendingId = homeOnBall ? options.awayId : options.homeId;
    const defTactics = homeOnBall ? awayTactics : homeTactics;
    const defProfile = homeOnBall ? away : home;
    const defNames = homeOnBall ? awayNames : homeNames;
    const attNames = homeOnBall ? homeNames : awayNames;
    const defender = pickName(defNames.slice(0, 9), random);
    const carrier = pickName(attNames.slice(4, 15), random);
    const win =
      random() <
      Math.min(
        0.78,
        0.48 +
          tackleChance(defProfile.hooking, defTactics.aggression ?? 46, defTactics.pressure ?? 48) * 1.15,
      );
    if (win) {
      push({
        minute,
        teamId: defendingId,
        playerName: defender,
        kind: "hook",
        text: `${defender} wins the tackle on ${carrier}.`,
        credits: mergeCredits([
          {
            name: defender,
            teamId: defendingId,
            tacklesAttempted: 1,
            tacklesWon: 1,
          },
        ]),
      });
      return;
    }
    push({
      minute,
      teamId: defendingId,
      playerName: defender,
      kind: "hook",
      text: `${defender} hooks ${carrier} but the ball stays in play.`,
      credits: [{ name: defender, teamId: defendingId, tacklesAttempted: 1 }],
    });
  };

  const startMinute = period === "second" ? 32 : 1;
  const endMinute = period === "first" ? 31 : 62;

  for (let minute = startMinute; minute <= endMinute; minute += 1) {
    if (period !== "second" && minute === 31) {
      push({
        minute,
        teamId: options.homeId,
        playerName: "",
        kind: "half",
        text: "Half-time whistle.",
        credits: period === "first" ? [...minuteCredits(homeSheet, options.homeId), ...minuteCredits(awaySheet, options.awayId)] : undefined,
      });
      if (period === "first") break;
      continue;
    }
    playGroundContest(minute);
    if (random() < 0.55) playGroundContest(minute);
    const tilt = (momentum - 50) / 50;
    const homeLooks =
      (random() < attackChance(home.attack, away.defence, tilt) ? 1 : 0) + (random() < 0.08 ? 1 : 0);
    for (let look = 0; look < homeLooks; look += 1) {
      tryScore(
        options.homeId,
        homeNames,
        home,
        away,
        awayTactics,
        awayNames,
        minute,
        homeDirect,
        homeLongPuck,
      );
    }
    const awayLooks =
      (random() < attackChance(away.attack, home.defence, -tilt) ? 1 : 0) + (random() < 0.08 ? 1 : 0);
    for (let look = 0; look < awayLooks; look += 1) {
      tryScore(
        options.awayId,
        awayNames,
        away,
        home,
        homeTactics,
        homeNames,
        minute,
        awayDirect,
        awayLongPuck,
      );
    }
    if (options.clubId) {
      const tip = liveCoachTip(events, tacticsFor(options.clubId), options.clubId, minute);
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
      credits: [...minuteCredits(homeSheet, options.homeId), ...minuteCredits(awaySheet, options.awayId)],
    });
  }

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
  });

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
    homeStats: tallied.homeStats,
    awayStats: tallied.awayStats,
    players: tallied.players,
    coachReport,
    gameSeed: options.gameSeed,
    climate,
    shots,
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
