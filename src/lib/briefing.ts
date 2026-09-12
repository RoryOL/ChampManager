import type {
  Championship,
  GameSave,
  Match,
  NewsItem,
  PlayerCondition,
  SquadBalance,
  Tactics,
  TeamSheet,
} from "../types";
import { compactName } from "./display";
import { newsItem } from "./news";
import { clubTactics, defaultSheet, sheetPlayers, sideProfile } from "./players";
import { resolveMatchSides, teamById } from "./resolve";
import { createRng, pickOne, seedFrom } from "./rng";
import { nextBatch } from "./schedule";
import { formatDate, matchPlayed, stageLabel } from "./scoring";
import { aggressionLabel, buildLabel, pressureLabel } from "./attributes";
import { shootingLabel } from "./shooting";
import { conditionFor, matchStat } from "./training";

export type PreMatchBriefingOptions = {
  clubId: string;
  match: Match;
  championship: Championship;
  tactics: Tactics;
  sheet: TeamSheet;
  condition: Record<string, PlayerCondition>;
  seed?: number;
  balance?: SquadBalance;
  opponentSheet?: TeamSheet;
  opponentTactics?: Tactics;
  opponentCondition?: Record<string, PlayerCondition>;
};

export type PreMatchRatings = {
  ourName: string;
  theirName: string;
  ourAttack: number;
  ourDefence: number;
  theirAttack: number;
  theirDefence: number;
};

export function formatSideRating(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function sideRatingDelta(ours: number, theirs: number): number {
  return Math.round((ours - theirs) * 10) / 10;
}

export function matchBriefingInput(save: GameSave, championship: Championship, match: Match): PreMatchBriefingOptions {
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const opponentId = homeId === save.clubId ? awayId : homeId;
  const rival = opponentId ? save.rivals[opponentId] : undefined;
  return {
    clubId: save.clubId,
    match,
    championship,
    tactics: save.tactics,
    sheet: save.sheet,
    condition: save.condition,
    seed: save.seed,
    balance: save.balance,
    opponentSheet: rival?.sheet,
    opponentTactics: rival?.tactics,
    opponentCondition: rival?.condition,
  };
}

function preMatchSides(options: PreMatchBriefingOptions) {
  const ratings = { seed: options.seed, balance: options.balance };
  const { homeId, awayId } = resolveMatchSides(options.championship, options.match);
  const opponentId = homeId === options.clubId ? awayId : homeId;
  const us = teamById(options.championship, options.clubId);
  const them = opponentId ? teamById(options.championship, opponentId) : undefined;
  const theirTactics = options.opponentTactics ?? (opponentId ? clubTactics(opponentId, options.balance) : options.tactics);
  const theirSheet = options.opponentSheet ?? (opponentId ? defaultSheet(opponentId, ratings) : options.sheet);
  const theirCondition = options.opponentCondition ?? {};
  const theirProfile = opponentId
    ? sideProfile(opponentId, theirSheet, theirTactics, theirCondition, ratings)
    : sideProfile(options.clubId, options.sheet, options.tactics, {}, ratings);
  const ourProfile = sideProfile(options.clubId, options.sheet, options.tactics, options.condition, ratings);
  return { ratings, opponentId, us, them, theirTactics, theirSheet, theirProfile, ourProfile };
}

export function buildPreMatchRatings(options: PreMatchBriefingOptions): PreMatchRatings | null {
  const { opponentId, us, them, ourProfile, theirProfile } = preMatchSides(options);
  if (!opponentId) return null;
  return {
    ourName: us ? compactName(us) : "Us",
    theirName: them ? compactName(them) : "the opposition",
    ourAttack: ourProfile.attack,
    ourDefence: ourProfile.defence,
    theirAttack: theirProfile.attack,
    theirDefence: theirProfile.defence,
  };
}

function threatLine(teamId: string, sheet: TeamSheet, ctx?: number | { seed?: number; balance?: SquadBalance }): string {
  const xv = sheetPlayers(teamId, sheet, ctx);
  const scored = [...xv].sort((a, b) => b.ratings.overall - a.ratings.overall);
  const star = scored[0];
  const shooter = [...xv].sort((a, b) => b.ratings.shooting + b.ratings.strikingDistance - (a.ratings.shooting + a.ratings.strikingDistance))[0];
  const marker = [...xv].sort((a, b) => b.ratings.manMarking - a.ratings.manMarking)[0];
  const parts: string[] = [];
  if (star) parts.push(`${star.name} is the one they look to (${star.ratings.overall})`);
  if (shooter && shooter.name !== star?.name) {
    parts.push(`${shooter.name} will take a look from distance`);
  }
  if (marker && (marker.position === "FB" || marker.position === "HB")) {
    parts.push(`${marker.name} sits in as the marker`);
  }
  return parts.join(". ") + ".";
}

export function buildPreMatchBriefing(options: PreMatchBriefingOptions): { title: string; notes: string[] } {
  const { ratings, opponentId, us, them, theirTactics, theirSheet, theirProfile, ourProfile } = preMatchSides(options);
  const ground = options.match.venue ?? "a neutral ground";
  const random = createRng(seedFrom(`${options.seed ?? 1}:${options.match.id}:brief`));
  const notes: string[] = [];
  const themName = them ? compactName(them) : "the opposition";
  notes.push(
    pickOne(random, [
      `${stageLabel(options.match.stage, options.match.round)} against ${themName} on ${formatDate(options.match.date)} at ${ground}.`,
      `${themName} at ${ground}, ${formatDate(options.match.date)}. ${stageLabel(options.match.stage, options.match.round)} — treat it like a championship hour from the throw-in.`,
    ]),
  );

  const shape = theirTactics.shape === "sweeper" ? "a sweeper" : "a traditional 6-2-6";
  notes.push(
    `They set up with ${shape}, ${buildLabel(theirTactics.build).toLowerCase()}, puck-outs ${theirTactics.puckout >= 60 ? "long" : "short"}, aggression ${aggressionLabel(theirTactics.aggression).toLowerCase()}, pressure ${pressureLabel(theirTactics.pressure).toLowerCase()}, shooting ${shootingLabel(theirTactics.shooting).toLowerCase()}.`,
  );

  if (opponentId) {
    notes.push(`Threats: ${threatLine(opponentId, theirSheet, ratings)}`);
  }

  if (theirProfile.attack > ourProfile.defence + 0.8) {
    notes.push(
      pickOne(random, [
        `Nullify: their attack rates above our defence. Sit a body in, keep the marker on their inside forward, and do not give cheap possession in our own half.`,
        `Nullify: they have more firepower. Crowd the dropping ball, keep the sweeper option in your pocket, and do not puck long into their full-forward.`,
      ]),
    );
  } else if (theirTactics.pressure >= 70) {
    notes.push(
      pickOne(random, [
        `Nullify: they will hunt every possession. Go shorter on the puck-out if the first man is covered, and do not carry into the first tackle.`,
        `Nullify: a high press. Strike the restart over the first line when they squeeze, and keep the extra man.`,
      ]),
    );
  } else if (theirTactics.aggression >= 70) {
    notes.push(
      pickOne(random, [
        `Nullify: they will come with a heavy hook. Win the free if they overstep, and keep the running game when the pocket opens.`,
        `Nullify: expect a rattle. Recycle instead of taking the hit, and punish the yellow if they overstep.`,
      ]),
    );
  } else {
    notes.push(
      pickOne(random, [
        `Nullify: stay tight on their scorer and crowd the dropping ball. Do not let their midfield turn and run.`,
        `Nullify: win the first hook around the middle and the rest of their plan slows down.`,
      ]),
    );
  }

  if (ourProfile.attack > theirProfile.defence + 0.8) {
    notes.push(
      pickOne(random, [
        `Weakness: their defence will not live with our inside line. Work the overlaps and ask the question early.`,
        `Weakness: we should have too much in the scoring zone. Get the sliotar in early and let the inside line live off breaking ball.`,
      ]),
    );
  } else if (theirTactics.build >= 68 && theirProfile.aerial < ourProfile.aerial) {
    notes.push(
      pickOne(random, [
        `Weakness: they go long but we should win the aerials. Break the first ball and run at the space behind.`,
        `Weakness: the long puck is theirs and the fielding should be ours. Own the drop and the half-forward line is in.`,
      ]),
    );
  } else if (theirTactics.puckout <= 38) {
    notes.push(
      pickOne(random, [
        `Weakness: short restarts. Press the half-back who takes it, and a turnover there is a score.`,
        `Weakness: they go short from the puck-out. Hunt the receiver and a turnover is a look at the posts.`,
      ]),
    );
  } else if (theirTactics.shape === "sweeper") {
    notes.push(
      pickOne(random, [
        `Weakness: the sweeper cuts the goal chance but leaves an extra man out. Shoot from distance and work the extra man around the 21.`,
        `Weakness: sweeper in, spare man out. Take the point from the pocket rather than forcing the square ball.`,
      ]),
    );
  } else {
    notes.push(
      pickOne(random, [
        `Weakness: if we win the first tackle we can play. Move it quicker than they can set the marker.`,
        `Weakness: they are honest rather than special. Win dirty ball and the scores will come.`,
      ]),
    );
  }

  const xv = sheetPlayers(options.clubId, options.sheet, ratings);
  const teamwork =
    xv.reduce((sum, player) => sum + matchStat(player.ratings.teamwork, conditionFor(player.name, options.condition), "teamwork"), 0) /
    Math.max(1, xv.length);
  const mark = Math.round(teamwork);
  if (teamwork >= 15) {
    notes.push(
      pickOne(random, [
        `Our teamwork is strong (${mark}). Keep the same fifteen in the same positions and the passing will stick.`,
        `Teamwork is a weapon (${mark}). Resist shuffling the spine the night before.`,
      ]),
    );
  } else if (teamwork <= 11) {
    notes.push(
      pickOne(random, [
        `Teamwork is still raw (${mark}). A challenge match or another championship day in the same shape will knit them.`,
        `They are still finding each other (${mark}). Same fifteen, same slots, or the extra man will not appear.`,
      ]),
    );
  } else {
    notes.push(
      pickOne(random, [
        `Teamwork is coming (${mark}). Keep the spine together.`,
        `The understanding is growing (${mark}). Another hour together will do more than a new shape.`,
      ]),
    );
  }

  const title = us ? `${compactName(us)} briefing: ${themName}` : `Match briefing: ${themName}`;
  return { title, notes };
}

export function briefingNews(options: PreMatchBriefingOptions): NewsItem {
  const built = buildPreMatchBriefing(options);
  return newsItem({
    id: `briefing-${options.match.id}-${options.clubId}`,
    kind: "briefing",
    source: "Coach",
    date: options.match.date,
    matchId: options.match.id,
    title: built.title,
    body: built.notes.join(" "),
    tone: "neutral",
  });
}

export function ensureMatchBriefing(save: GameSave, championship: Championship): GameSave {
  if (save.phase !== "season") return save;
  const batch = nextBatch(championship, save.clubId);
  const match = batch?.userMatch;
  if (!match || matchPlayed(match)) return save;
  const id = `briefing-${match.id}-${save.clubId}`;
  if (save.inbox.some((item) => item.id === id)) return save;
  return {
    ...save,
    inbox: [
      briefingNews(matchBriefingInput(save, championship, match)),
      ...save.inbox,
    ].slice(0, 80),
  };
}
