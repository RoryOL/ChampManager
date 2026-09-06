import type { PlayerCondition, PlayerMatchStats, RatedPlayer, TeamSheet } from "../types";
import { XV_SLOTS } from "./attributes";

function clampMood(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function moodValue(condition: PlayerCondition): number {
  return condition.mood ?? 58;
}

export function moodLabel(mood: number): string {
  if (mood >= 78) return "Buzzing";
  if (mood >= 64) return "Upbeat";
  if (mood >= 48) return "Settled";
  if (mood >= 34) return "Flat";
  return "Fed up";
}

export function moodAdjust(condition: PlayerCondition): number {
  const mood = moodValue(condition);
  if (mood >= 80) return 1;
  if (mood < 28) return -2;
  if (mood < 40) return -1;
  return 0;
}

export function starterOutOfPosition(player: RatedPlayer, index: number): boolean {
  const line = XV_SLOTS[index] ?? player.position;
  return player.ratings.familiarity[line] < 12;
}

export function applyMatchMood(
  condition: Record<string, PlayerCondition>,
  squad: RatedPlayer[],
  opening: TeamSheet,
  closing: TeamSheet,
  players: PlayerMatchStats[],
  result: "win" | "draw" | "loss",
): Record<string, PlayerCondition> {
  const next = { ...condition };
  const stats = new Map(players.map((row) => [row.name, row]));
  const openingSet = new Set(opening.starters);
  const closingSet = new Set(closing.starters);

  for (const player of squad) {
    const current = { ...(next[player.name] ?? { fatigue: 16, sharpness: 38, mood: 58 }) };
    let mood = moodValue(current);
    const notes: string[] = [];
    const row = stats.get(player.name);
    const started = openingSet.has(player.name);
    const finished = closingSet.has(player.name);
    const index = Math.max(opening.starters.indexOf(player.name), closing.starters.indexOf(player.name));

    if (result === "win") {
      mood += started ? 8 : 3;
      notes.push(started ? "the win" : "the result off the bench");
    } else if (result === "loss") {
      mood -= started ? 8 : 3;
      notes.push(started ? "the defeat" : "watching a defeat");
    } else {
      mood += 1;
    }

    if (!started) {
      mood -= 4;
      notes.push("not starting");
    }
    if (started && !finished) {
      mood -= 3;
      notes.push("being taken off");
    }
    if (index >= 0 && starterOutOfPosition(player, index)) {
      mood -= 5;
      notes.push("playing out of position");
    }
    if (row && row.rating <= 5.2 && (started || finished)) {
      mood -= 6;
      notes.push("a poor showing");
    } else if (row && row.rating >= 8) {
      mood += 5;
      notes.push("a strong display");
    }

    next[player.name] = {
      ...current,
      mood: clampMood(mood),
      moodNote: notes[0] ? `Mood moved by ${notes.slice(0, 2).join(" and ")}.` : current.moodNote,
    };
  }
  return next;
}
