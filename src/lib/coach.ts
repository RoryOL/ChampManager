import type { MatchClimate, MatchEvent, PlayerMatchStats, Tactics, TeamMatchStats } from "../types";
import { aggressionLabel, buildLabel, pressureLabel, puckoutLabel } from "./attributes";
import { shootingLabel } from "./shooting";
import { climateSummary } from "./weather";

type CoachInput = {
  clubId?: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeTactics: Tactics;
  awayTactics: Tactics;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
  homeScore: { goals: number; points: number };
  awayScore: { goals: number; points: number };
  players: PlayerMatchStats[];
  events: MatchEvent[];
  climate?: MatchClimate;
  homeTeamwork?: number;
  awayTeamwork?: number;
};

function total(score: { goals: number; points: number }): number {
  return score.goals * 3 + score.points;
}

function rate(made: number, attempted: number): number {
  return attempted > 0 ? made / attempted : 0;
}

export function liveCoachTip(
  events: MatchEvent[],
  tactics: Tactics,
  clubId: string,
  minute: number,
): string | null {
  if (![14, 23, 41, 52].includes(minute)) return null;
  if (events.some((event) => event.kind === "coach" && event.minute === minute)) return null;
  const ours = events.filter((event) => event.teamId === clubId);
  const broken = ours.filter((event) => event.kind === "puckout" && /broken|turned over/i.test(event.text)).length;
  const won = ours.filter((event) => event.kind === "puckout" && /fields the puck-out/i.test(event.text)).length;
  const wides = ours.filter((event) => event.kind === "wide").length;
  const scores = ours.filter((event) => event.kind === "point" || event.kind === "goal" || event.kind === "free").length;
  const yellows = events.filter(
    (event) => (event.kind === "booking" || event.kind === "red") && event.teamId === clubId,
  ).length;
  const already = new Set(events.filter((event) => event.kind === "coach").map((event) => event.text));

  const tips: string[] = [];
  if (tactics.puckout >= 62 && broken >= won + 2) {
    tips.push("Those long puck-outs are being broken up. Go short or mix the restart.");
  }
  if (tactics.build >= 68 && broken >= 3) {
    tips.push("The long ball is not sticking. They are winning the aerials.");
  }
  if (wides >= scores + 3 && wides >= 3) {
    tips.push("The shooting is off. Work it closer before pulling the trigger.");
  }
  if (yellows >= 2) {
    tips.push("The referee has them in the book. Tone down the tackling.");
  }
  if (tactics.aggression < 28 && minute >= 40) {
    tips.push("We are too light in the tackle. They are running through hooks.");
  }
  if (tactics.pressure >= 78 && minute >= 41) {
    tips.push("The press is winning ball, but the legs are going. Drop the pressure a notch.");
  }
  const next = tips.find((tip) => !already.has(tip));
  return next ?? null;
}

export function buildCoachReport(input: CoachInput): string[] {
  const usIsHome = input.clubId === input.homeId;
  const usIsAway = input.clubId === input.awayId;
  const focused = usIsHome || usIsAway;
  const us = usIsHome ? input.homeStats : usIsAway ? input.awayStats : input.homeStats;
  const them = usIsHome ? input.awayStats : usIsAway ? input.homeStats : input.awayStats;
  const ourTactics = usIsHome ? input.homeTactics : usIsAway ? input.awayTactics : input.homeTactics;
  const theirTactics = usIsHome ? input.awayTactics : usIsAway ? input.homeTactics : input.awayTactics;
  const ourScore = usIsHome ? input.homeScore : usIsAway ? input.awayScore : input.homeScore;
  const theirScore = usIsHome ? input.awayScore : usIsAway ? input.homeScore : input.awayScore;
  const we = focused ? "We" : input.homeName;
  const they = focused ? "They" : input.awayName;
  const notes: string[] = [];

  const ourTotal = total(ourScore);
  const theirTotal = total(theirScore);
  if (ourTotal > theirTotal) {
    notes.push(`${we} took the day ${ourScore.goals}-${ourScore.points} to ${theirScore.goals}-${theirScore.points}. Keep the same shape unless the next opponent plays a sweeper.`);
  } else if (ourTotal < theirTotal) {
    notes.push(`${we} came out on the wrong side of ${theirScore.goals}-${theirScore.points} to ${ourScore.goals}-${ourScore.points}. The next session has to sharpen the middle third.`);
  } else {
    notes.push(`A share of the spoils, ${ourScore.goals}-${ourScore.points} apiece. A point on the board, but the next day needs a clearer scoring plan.`);
  }

  if (ourTactics.build >= 64 && them.highFieldingWon > us.highFieldingWon + 1) {
    notes.push(
      `${we} went ${buildLabel(ourTactics.build).toLowerCase()}, but ${they.toLowerCase()} won the aerials ${them.highFieldingWon}-${us.highFieldingWon}. Mix the delivery or go shorter next day.`,
    );
  } else if (ourTactics.build <= 36 && us.passesCompleted < them.passesCompleted * 0.75) {
    notes.push(`The running game stalled — passes completed ${us.passesCompleted} to ${them.passesCompleted}. Look for a more direct option when the pocket is closed.`);
  }

  if (ourTactics.puckout >= 62 && them.puckoutsWon > us.puckoutsWon) {
    notes.push(
      `Long puck-outs were the plan (${puckoutLabel(ourTactics.puckout).toLowerCase()}), yet ${they.toLowerCase()} won the restarts ${them.puckoutsWon}-${us.puckoutsWon}. Shorten a few to the half-backs.`,
    );
  } else if (ourTactics.puckout <= 38 && us.puckoutsWon + 2 < them.puckoutsWon) {
    notes.push(`Short restarts were turned over. A few longer contests would at least ask a question.`);
  }

  if (ourTactics.aggression >= 72) {
    const yellows = input.events.filter(
      (event) =>
        (event.kind === "booking" || event.kind === "red") &&
        event.teamId === (focused ? input.clubId : input.homeId),
    ).length;
    if (yellows >= 2) {
      notes.push(`Aggression was ${aggressionLabel(ourTactics.aggression).toLowerCase()} and it showed — ${yellows} yellow cards. Tone it down or the referee will empty the bench.`);
    } else if (us.tacklesWon > them.tacklesWon) {
      notes.push(`The heavy tackling worked: hooks won ${us.tacklesWon}-${them.tacklesWon}. Keep it, but stay on the right side of the whistle.`);
    }
  } else if (ourTactics.aggression <= 28 && them.tacklesWon < us.tacklesAttempted && us.tacklesWon + 3 < them.tacklesWon) {
    notes.push(`Too light in the tackle. ${they} broke the first hook too often. Step the aggression up a notch.`);
  }

  if (ourTactics.pressure >= 72) {
    notes.push(
      `Pressure was ${pressureLabel(ourTactics.pressure).toLowerCase()} — tackles ${us.tacklesWon} won, but match fitness took a hit. Use it in spells, not for the full hour.`,
    );
  } else if (ourTactics.pressure <= 28 && us.tacklesWon + 3 < them.tacklesWon) {
    notes.push(`We sat off them. ${they} had too much time on the ball. Turn the pressure up.`);
  }

  if (input.climate) {
    notes.push(`Conditions: ${climateSummary(input.climate)}.`);
  }

  if (us.shots >= 6 && rate(us.scores, us.shots) < 0.48) {
    notes.push(
      `Shooting was wasteful — ${us.scores} scores from ${us.shots} shots (${shootingLabel(ourTactics.shooting ?? 50).toLowerCase()}). Work it closer before pulling the trigger.`,
    );
  } else if (us.shots >= 8 && rate(us.scores, us.shots) >= 0.7 && (ourTactics.shooting ?? 50) <= 35) {
    notes.push(`The shoot-on-sight brief paid off: ${us.scores} from ${us.shots}. Keep asking questions from distance while it is dropping.`);
  } else if (us.shots + 3 < them.shots) {
    notes.push(`${they} had the look (${them.shots} shots to ${us.shots}). We need more ball in the scoring zone.`);
  }

  if (theirTactics.shape === "sweeper" && theirScore.goals <= 1 && focused) {
    notes.push("They dropped a sweeper and it cut the goal chance. Shoot from distance and work the overlaps rather than forcing the square ball.");
  }

  const passenger = input.players
    .filter((player) => player.teamId === us.teamId && player.started && player.rating <= 5)
    .sort((a, b) => a.rating - b.rating)[0];
  if (passenger) {
    notes.push(`${passenger.name} had a quiet hour (${passenger.rating} match rating). A change in the fifteen is worth a look.`);
  }

  const standout = input.players
    .filter((player) => player.teamId === us.teamId && player.rating >= 8)
    .sort((a, b) => b.rating - a.rating)[0];
  if (standout) {
    notes.push(`${standout.name} carried it (${standout.rating}). Keep him on the ball.`);
  }

  const ourTeamwork = focused ? (usIsHome ? input.homeTeamwork : input.awayTeamwork) : input.homeTeamwork;
  if (typeof ourTeamwork === "number") {
    if (ourTeamwork >= 16 && us.passesCompleted >= them.passesCompleted) {
      notes.push(
        `Teamwork is showing (${Math.round(ourTeamwork)}). The same lads in the same positions are finding each other — keep the spine together.`,
      );
    } else if (ourTeamwork <= 11 && us.passesCompleted + 4 < them.passesCompleted) {
      notes.push(
        `Teamwork is still raw (${Math.round(ourTeamwork)}). A challenge match and another championship day in the same shape will knit the passing.`,
      );
    } else if (ourTeamwork >= 13) {
      notes.push(`Teamwork sits at ${Math.round(ourTeamwork)}. Stay loyal to the fifteen that has been playing together.`);
    }
  }

  return notes.slice(0, 7);
}
