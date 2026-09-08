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
import { nextBatch } from "./schedule";
import { formatDate, matchPlayed, stageLabel } from "./scoring";
import { aggressionLabel, buildLabel, pressureLabel } from "./attributes";
import { shootingLabel } from "./shooting";
import { conditionFor, matchStat } from "./training";

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

export function buildPreMatchBriefing(options: {
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
}): { title: string; notes: string[] } {
  const ratings = { seed: options.seed, balance: options.balance };
  const { homeId, awayId } = resolveMatchSides(options.championship, options.match);
  const usHome = homeId === options.clubId;
  const opponentId = usHome ? awayId : homeId;
  const us = teamById(options.championship, options.clubId);
  const them = opponentId ? teamById(options.championship, opponentId) : undefined;
  const venue = usHome ? "at home" : "away";
  const theirTactics = options.opponentTactics ?? (opponentId ? clubTactics(opponentId, options.balance) : options.tactics);
  const theirSheet = options.opponentSheet ?? (opponentId ? defaultSheet(opponentId) : options.sheet);
  const theirProfile = opponentId
    ? sideProfile(opponentId, theirSheet, theirTactics, {}, ratings)
    : sideProfile(options.clubId, options.sheet, options.tactics, {}, ratings);
  const ourProfile = sideProfile(options.clubId, options.sheet, options.tactics, options.condition, ratings);
  const notes: string[] = [];
  const themName = them ? compactName(them) : "the opposition";
  notes.push(
    `${stageLabel(options.match.stage, options.match.round)} ${venue} against ${themName} on ${formatDate(options.match.date)}${options.match.venue ? ` at ${options.match.venue}` : ""}.`,
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
      `Nullify: their attack rates above our defence. Sit a body in, keep the marker on their inside forward, and do not give cheap possession in our own half.`,
    );
  } else if (theirTactics.pressure >= 70) {
    notes.push(
      `Nullify: they will hunt every possession. Go shorter on the puck-out if the first man is covered, and do not carry into the first tackle.`,
    );
  } else if (theirTactics.aggression >= 70) {
    notes.push(
      `Nullify: they will come with a heavy hook. Win the free if they overstep, and keep the running game when the pocket opens.`,
    );
  } else {
    notes.push(
      `Nullify: stay tight on their scorer and crowd the dropping ball. Do not let their midfield turn and run.`,
    );
  }

  if (ourProfile.attack > theirProfile.defence + 0.8) {
    notes.push(
      `Weakness: their defence will not live with our inside line. Work the overlaps and ask the question early.`,
    );
  } else if (theirTactics.build >= 68 && theirProfile.aerial < ourProfile.aerial) {
    notes.push(
      `Weakness: they go long but we should win the aerials. Break the first ball and run at the space behind.`,
    );
  } else if (theirTactics.puckout <= 38) {
    notes.push(
      `Weakness: short restarts. Press the half-back who takes it, and a turnover there is a score.`,
    );
  } else if (theirTactics.shape === "sweeper") {
    notes.push(
      `Weakness: the sweeper cuts the goal chance but leaves an extra man out. Shoot from distance and work the extra man around the 21.`,
    );
  } else {
    notes.push(
      `Weakness: if we win the first tackle we can play. Move it quicker than they can set the marker.`,
    );
  }

  const xv = sheetPlayers(options.clubId, options.sheet, ratings);
  const teamwork =
    xv.reduce((sum, player) => sum + matchStat(player.ratings.teamwork, conditionFor(player.name, options.condition), "teamwork"), 0) /
    Math.max(1, xv.length);
  if (teamwork >= 15) {
    notes.push(`Our teamwork is strong (${Math.round(teamwork)}). Keep the same fifteen in the same positions and the passing will stick.`);
  } else if (teamwork <= 11) {
    notes.push(`Teamwork is still raw (${Math.round(teamwork)}). A challenge match or another championship day in the same shape will knit them.`);
  } else {
    notes.push(`Teamwork is coming (${Math.round(teamwork)}). Keep the spine together.`);
  }

  const title = us ? `${compactName(us)} briefing: ${themName}` : `Match briefing: ${themName}`;
  return { title, notes };
}

export function briefingNews(options: {
  clubId: string;
  match: Match;
  championship: Championship;
  tactics: Tactics;
  sheet: TeamSheet;
  condition: Record<string, PlayerCondition>;
  seed: number;
  balance?: SquadBalance;
  opponentSheet?: TeamSheet;
  opponentTactics?: Tactics;
}): NewsItem {
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
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const opponentId = homeId === save.clubId ? awayId : homeId;
  const rival = opponentId ? save.rivals[opponentId] : undefined;
  return {
    ...save,
    inbox: [
      briefingNews({
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
      }),
      ...save.inbox,
    ].slice(0, 80),
  };
}
