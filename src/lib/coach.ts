import type { MatchClimate, MatchEvent, PlayerCondition, PlayerMatchStats, Tactics, TeamMatchStats } from "../types";
import { aggressionLabel, buildLabel, pressureLabel, puckoutLabel } from "./attributes";
import { formCoachNotes } from "./form";
import { createRng, pickOne, seedFrom } from "./rng";
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
  condition?: Record<string, PlayerCondition>;
};

function total(score: { goals: number; points: number }): number {
  return score.goals * 3 + score.points;
}

function rate(made: number, attempted: number): number {
  return attempted > 0 ? made / attempted : 0;
}

function lostPuckouts(stats: TeamMatchStats): number {
  return Math.max(0, (stats.puckoutsAttempted ?? 0) - stats.puckoutsWon);
}

function coachRng(input: CoachInput): () => number {
  const names = input.players
    .slice(0, 4)
    .map((player) => player.name)
    .join(",");
  return createRng(
    seedFrom(
      `${input.homeId}:${input.awayId}:${input.homeScore.goals}-${input.homeScore.points}:${input.awayScore.goals}-${input.awayScore.points}:${names}`,
    ),
  );
}

function firstUnused(random: () => number, already: Set<string>, variants: string[]): string | undefined {
  const left = variants.filter((tip) => !already.has(tip));
  if (left.length === 0) return undefined;
  return pickOne(random, left);
}

export function liveCoachTip(
  events: MatchEvent[],
  tactics: Tactics,
  clubId: string,
  minute: number,
  chase?: { chasing: boolean; huntGoals: boolean },
): string | null {
  if (![14, 23, 41, 52].includes(minute)) return null;
  if (events.some((event) => event.kind === "coach" && event.minute === minute)) return null;
  const ours = events.filter((event) => event.teamId === clubId);
  const broken = ours.filter((event) => event.kind === "puckout" && /broken|turned over/i.test(event.text)).length;
  const won = ours.filter((event) => event.kind === "puckout" && /fields the puck-out|takes the short puck-out|starts the attack/i.test(event.text)).length;
  const wides = ours.filter((event) => event.kind === "wide").length;
  const scores = ours.filter((event) => event.kind === "point" || event.kind === "goal" || event.kind === "free").length;
  const yellows = events.filter(
    (event) => (event.kind === "booking" || event.kind === "red") && event.teamId === clubId,
  ).length;
  const already = new Set(events.filter((event) => event.kind === "coach").map((event) => event.text));
  const random = createRng(seedFrom(`${clubId}:${minute}:${events.length}:${events.at(-1)?.text ?? ""}`));

  const tips: string[] = [];
  if (chase?.chasing && minute === 52) {
    const chaseTip = firstUnused(
      random,
      already,
      chase.huntGoals
        ? [
            "We need a goal. Stop taking points and commit bodies forward.",
            "Hunt the net. Recycle until someone is inside the 21 — points will not do it.",
            "A point is no use now. Drive at the square and take the goal chance.",
          ]
        : [
            "Empty the tank. Push up and hunt the next score.",
            "Go after the next puck. We cannot sit on this scoreline.",
            "Push the half-forward line up and make them puck long under pressure.",
          ],
    );
    if (chaseTip) tips.push(chaseTip);
  }
  if (tactics.puckout >= 62 && broken >= won + 2) {
    const tip = firstUnused(random, already, [
      "Those long puck-outs are being broken up. Go short or mix the restart.",
      "The long puck is feeding them. Drop a few into the full-back line.",
      "They are reading the restart. Mix the length or we will keep turning it over.",
    ]);
    if (tip) tips.push(tip);
  }
  if (tactics.build >= 68 && broken >= 3) {
    const tip = firstUnused(random, already, [
      "The long ball is not sticking. They are winning the aerials.",
      "Stop pumping it. The first man is losing the aerial and we are chasing.",
      "Direct is handing them possession. Play through the pocket while it is there.",
    ]);
    if (tip) tips.push(tip);
  }
  if (wides >= scores + 3 && wides >= 3) {
    const tip = firstUnused(random, already, [
      "The shooting is off. Work it closer before letting fly.",
      "Too many wides from distance. Recycle and take the extra pass.",
      "The striking is wild. Bring it inside the 65 unless it is a placed ball.",
    ]);
    if (tip) tips.push(tip);
  }
  if (yellows >= 2) {
    const tip = firstUnused(random, already, [
      "The referee has them in the book. Tone down the tackling.",
      "Two yellows already. Win the ball, do not win the argument.",
      "The whistle is against us. Stay on the right side of the hook.",
    ]);
    if (tip) tips.push(tip);
  }
  if (tactics.aggression < 28 && minute >= 40) {
    const tip = firstUnused(random, already, [
      "We are too light in the tackle. They are running through hooks.",
      "Step into them. The first hook is a suggestion at the moment.",
      "They have too much time. A heavier tackle would slow the transfer.",
    ]);
    if (tip) tips.push(tip);
  }
  if (tactics.pressure >= 78 && minute >= 41) {
    const tip = firstUnused(random, already, [
      "The press is winning ball, but the legs are going. Drop the pressure a notch.",
      "High press is costing match fitness. Use it in spells for the last quarter.",
      "We are hunting every puck and it is showing in the running. Sit off a strip.",
    ]);
    if (tip) tips.push(tip);
  }
  return tips.find((tip) => !already.has(tip)) ?? null;
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
  const random = coachRng(input);

  const ourTotal = total(ourScore);
  const theirTotal = total(theirScore);
  const ourLine = `${ourScore.goals}-${ourScore.points}`;
  const theirLine = `${theirScore.goals}-${theirScore.points}`;
  if (ourTotal > theirTotal) {
    notes.push(
      pickOne(random, [
        `${we} took the day ${ourLine} to ${theirLine}. Keep the same shape unless the next opponent plays a sweeper.`,
        `${we} had the better of it, ${ourLine} to ${theirLine}. The scoreboard is right — do not tinker with a fifteen that won dirty ball.`,
        `A proper championship win, ${ourLine} to ${theirLine}. The next day will ask a different question, but the work-rate can travel.`,
        `${we} put ${focused ? "them" : they} away ${ourLine} to ${theirLine}. Hunt the same breaking ball next day; the extras will come if the first hook is on.`,
        `The result is the one we wanted (${ourLine} to ${theirLine}). Look at who went missing before you change the shape.`,
      ]),
    );
  } else if (ourTotal < theirTotal) {
    notes.push(
      pickOne(random, [
        `${we} came out on the wrong side of ${theirLine} to ${ourLine}. The next session has to sharpen the middle third.`,
        `Beaten ${theirLine} to ${ourLine}. Too many easy possessions given up — win the first ball or the rest of the plan is decoration.`,
        `${we} were second to the break and the scoreboard showed it, ${theirLine} to ${ourLine}. Tighten the marking before you talk about scoring.`,
        `A hard hour, ${theirLine} to ${ourLine} against. The shooting will be mentioned; the real leak was how cheaply they turned us.`,
        `${they} wanted the dirty ball more. ${theirLine} to ${ourLine} is the evidence. Address the tackle before the tactics board.`,
      ]),
    );
  } else {
    notes.push(
      pickOne(random, [
        `A share of the spoils, ${ourLine} apiece. A point on the board, but the next day needs a clearer scoring plan.`,
        `Level at the finish, ${ourLine} each. Two points that will feel like one if we keep missing the pocket.`,
        `Neither side deserved to lose, ${ourLine} apiece. We still left scores behind — the next session is shooting and support runs.`,
        `A draw, ${ourLine}. Honest enough, not enough if the year is about more than the group.`,
      ]),
    );
  }

  if (ourTactics.build >= 64 && them.highFieldingWon > us.highFieldingWon + 1) {
    notes.push(
      pickOne(random, [
        `${we} went ${buildLabel(ourTactics.build).toLowerCase()}, but ${they.toLowerCase()} won the aerials ${them.highFieldingWon}-${us.highFieldingWon}. Mix the delivery or go shorter next day.`,
        `The long ball asked a question and got the wrong answer — aerials ${them.highFieldingWon}-${us.highFieldingWon}. If the first man is losing it, play through the half-forward line.`,
        `Direct was the brief (${buildLabel(ourTactics.build).toLowerCase()}) and they still fielded it ${them.highFieldingWon}-${us.highFieldingWon}. A few more ground balls would have changed the hour.`,
      ]),
    );
  } else if (ourTactics.build <= 36 && us.passesCompleted < them.passesCompleted * 0.75) {
    notes.push(
      pickOne(random, [
        `The running game stalled — passes completed ${us.passesCompleted} to ${them.passesCompleted}. Look for a more direct option when the pocket is closed.`,
        `We tried to play through them and the chain broke (${us.passesCompleted} completed to ${them.passesCompleted}). A longer puck into space would at least stretch the sweeper.`,
        `Short hurling needs a free man. Completions ${us.passesCompleted}-${them.passesCompleted} says they shut the pocket — mix a strike when the runner is covered.`,
      ]),
    );
  }

  if (ourTactics.puckout >= 62 && (us.puckoutsAttempted ?? 0) >= 4 && us.puckoutsWon + 1 <= lostPuckouts(us)) {
    notes.push(
      pickOne(random, [
        `Long puck-outs were the plan (${puckoutLabel(ourTactics.puckout).toLowerCase()}), yet we lost the restarts ${us.puckoutsWon}-${lostPuckouts(us)}. Shorten a few to the back line.`,
        `The keeper kept going long and they kept breaking it, ${us.puckoutsWon} won from ${us.puckoutsAttempted ?? 0}. Mix the restart or we feed their half-forward line.`,
        `Attacking puck-outs leaked possession (${us.puckoutsWon}-${lostPuckouts(us)}). A short one into the full-back line would have slowed their press.`,
      ]),
    );
  } else if (ourTactics.puckout <= 38 && (us.puckoutsAttempted ?? 0) >= 4 && us.puckoutsWon + 2 < lostPuckouts(us)) {
    notes.push(
      pickOne(random, [
        `Short restarts were turned over. A few longer contests would at least ask a question.`,
        `They hunted the short puck-out and won it. Go over the first press once or twice next day.`,
        `The short restart became a turnover factory. Keep it if the full-back is free; otherwise strike it.`,
      ]),
    );
  }

  if (ourTactics.aggression >= 72) {
    const yellows = input.events.filter(
      (event) =>
        (event.kind === "booking" || event.kind === "red") &&
        event.teamId === (focused ? input.clubId : input.homeId),
    ).length;
    if (yellows >= 2) {
      notes.push(
        pickOne(random, [
          `Aggression was ${aggressionLabel(ourTactics.aggression).toLowerCase()} and it showed — ${yellows} yellow cards. Tone it down or the referee will empty the bench.`,
          `${yellows} yellows from a heavy brief. The hook is useful until it is a booking — stay on the right side of the whistle.`,
          `We came to rattle them and the referee noticed (${yellows} yellows). Win the ball; do not win the argument.`,
        ]),
      );
    } else if (us.tacklesWon > them.tacklesWon) {
      notes.push(
        pickOne(random, [
          `The heavy tackling worked: hooks won ${us.tacklesWon}-${them.tacklesWon}. Keep it, but stay on the right side of the whistle.`,
          `We won the first hook (${us.tacklesWon}-${them.tacklesWon}) and it set the hour. Same spite next day, cleaner timing.`,
          `That aggression told: ${us.tacklesWon} hooks to ${them.tacklesWon}. It is a weapon if the referee stays with us.`,
        ]),
      );
    }
  } else if (ourTactics.aggression <= 28 && them.tacklesWon < us.tacklesAttempted && us.tacklesWon + 3 < them.tacklesWon) {
    notes.push(
      pickOne(random, [
        `Too light in the tackle. ${they} broke the first hook too often. Step the aggression up a notch.`,
        `${they} ran through challenges that should have slowed them. A heavier tackle would change the transfer.`,
        `We stood off the man. Championship hurling starts with the hook — raise it a strip.`,
      ]),
    );
  }

  if (ourTactics.pressure >= 72) {
    notes.push(
      pickOne(random, [
        `Pressure was ${pressureLabel(ourTactics.pressure).toLowerCase()} — tackles ${us.tacklesWon} won, but match fitness took a hit. Use it in spells, not for the full hour.`,
        `The press won ball (${us.tacklesWon} hooks) and spent legs. Hunt in bursts after our own puck-out, not for sixty minutes.`,
        `High pressure asked a question and the fitness numbers will show it. Keep the hunt for when we need a score.`,
      ]),
    );
  } else if (ourTactics.pressure <= 28 && us.tacklesWon + 3 < them.tacklesWon) {
    notes.push(
      pickOne(random, [
        `We sat off them. ${they} had too much time on the ball. Turn the pressure up.`,
        `Too much respect. They turned and struck before we arrived. Squeeze the half-forward line.`,
        `The sit-off invited them onto it. A higher press would have rushed the first strike.`,
      ]),
    );
  }

  if (input.climate) {
    notes.push(
      pickOne(random, [
        `Conditions: ${climateSummary(input.climate, { first: input.homeName, second: input.awayName })}.`,
        `The weather was a factor — ${climateSummary(input.climate, { first: input.homeName, second: input.awayName })}. Plan the puck-out around it next day.`,
        `Take the climate as read: ${climateSummary(input.climate, { first: input.homeName, second: input.awayName })}. It asked a question of first touch more than of tactics.`,
      ]),
    );
  }

  if (us.shots >= 6 && rate(us.scores, us.shots) < 0.48) {
    notes.push(
      pickOne(random, [
        `Shooting was wasteful — ${us.scores} scores from ${us.shots} shots (${shootingLabel(ourTactics.shooting ?? 50).toLowerCase()}). Work it closer before letting fly.`,
        `${us.scores} from ${us.shots} is not championship striking. Recycle unless the pocket is on — too many from distance.`,
        `The wides will haunt the video. ${us.scores} scores from ${us.shots} shots; bring it inside the 65 or pick a placed ball.`,
      ]),
    );
  } else if (us.shots >= 8 && rate(us.scores, us.shots) >= 0.7 && (ourTactics.shooting ?? 50) <= 35) {
    notes.push(
      pickOne(random, [
        `The shoot-on-sight brief paid off: ${us.scores} from ${us.shots}. Keep asking questions from distance while it is dropping.`,
        `Letting fly early worked (${us.scores} from ${us.shots}). Do not suddenly start over-playing it next day.`,
        `Distance striking dropped (${us.scores}/${us.shots}). While the eye is in, take the look.`,
      ]),
    );
  } else if (us.shots + 3 < them.shots) {
    notes.push(
      pickOne(random, [
        `${they} had the look (${them.shots} shots to ${us.shots}). We need more ball in the scoring zone.`,
        `Too little of the sliotar in their half — shots ${them.shots}-${us.shots}. Win the next break and the scores will come.`,
        `We were starved of looks (${us.shots} shots to ${them.shots}). The half-forward line has to turn and go.`,
      ]),
    );
  }

  if (theirTactics.shape === "sweeper" && theirScore.goals <= 1 && focused) {
    notes.push(
      pickOne(random, [
        "They dropped a sweeper and it cut the goal chance. Shoot from distance and work the overlaps rather than forcing the square ball.",
        "The extra man in their full-back line killed the goal. Use the spare around the 21 and take the point.",
        "Sweeper in, square ball out. Stretch him with the extra man and strike from the pocket.",
      ]),
    );
  }

  const passenger = input.players
    .filter((player) => player.teamId === us.teamId && player.started && player.rating <= 5)
    .sort((a, b) => a.rating - b.rating)[0];
  if (passenger) {
    notes.push(
      pickOne(random, [
        `${passenger.name} had a quiet hour (${passenger.rating} match rating). A change in the fifteen is worth a look.`,
        `${passenger.name} never got into it (${passenger.rating}). If the marker is winning that battle, move him or hook the runner earlier.`,
        `${passenger.name} was a passenger (${passenger.rating}). Championship days are unforgiving — look at the bench.`,
        `${passenger.name} drifted through it (${passenger.rating}). Ask whether the role is right before you write him off.`,
      ]),
    );
  }

  const standout = input.players
    .filter((player) => player.teamId === us.teamId && player.rating >= 8)
    .sort((a, b) => b.rating - a.rating)[0];
  if (standout) {
    notes.push(
      pickOne(random, [
        `${standout.name} carried it (${standout.rating}). Keep him on the ball.`,
        `${standout.name} was the man (${standout.rating}). Give him the next possession, not the thank-you sub.`,
        `${standout.name} hurled like a county man (${standout.rating}). Build the next attack around him.`,
        `${standout.name} set the standard (${standout.rating}). The others have to live with that work-rate.`,
      ]),
    );
  }

  const featured = input.players
    .filter((player) => player.teamId === us.teamId && player.minutes >= 12)
    .map((player) => player.name);
  notes.push(
    ...formCoachNotes(
      input.condition,
      featured,
      seedFrom(`${input.homeId}:${input.awayId}:${ourLine}:${theirLine}`),
    ),
  );

  const ourTeamwork = focused ? (usIsHome ? input.homeTeamwork : input.awayTeamwork) : input.homeTeamwork;
  if (typeof ourTeamwork === "number") {
    const mark = Math.round(ourTeamwork);
    if (ourTeamwork >= 16 && us.passesCompleted >= them.passesCompleted) {
      notes.push(
        pickOne(random, [
          `Teamwork is showing (${mark}). The same lads in the same positions are finding each other — keep the spine together.`,
          `That is a knitted fifteen (${mark} teamwork). Completions stayed ahead because they know the next man's run.`,
          `The teamwork is there (${mark}). Do not break the spine for the sake of a new shape.`,
        ]),
      );
    } else if (ourTeamwork <= 11 && us.passesCompleted + 4 < them.passesCompleted) {
      notes.push(
        pickOne(random, [
          `Teamwork is still raw (${mark}). A challenge match and another championship day in the same shape will knit the passing.`,
          `They are still strangers in the same jerseys (${mark}). Keep the same fifteen together until the extra man appears.`,
          `Raw teamwork (${mark}) showed in the broken chains. Another hour in this shape will do more than a tactics talk.`,
        ]),
      );
    } else if (ourTeamwork >= 13) {
      notes.push(
        pickOne(random, [
          `Teamwork sits at ${mark}. Stay loyal to the fifteen that has been playing together.`,
          `Teamwork is coming (${mark}). Resist the urge to shuffle the spine before the next day.`,
          `The fifteen are starting to find each other (${mark}). Same positions, same lads.`,
        ]),
      );
    }
  }

  return notes.slice(0, 8);
}
