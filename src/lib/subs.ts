import type { MatchEvent, TeamSheet } from "../types";

export const MATCH_SUB_LIMIT = 5;

export function isSubstitutionSwap(sheet: TeamSheet, first: string, second: string): boolean {
  return sheet.starters.includes(first) !== sheet.starters.includes(second);
}

export function substitutionCount(events: MatchEvent[], teamId: string): number {
  return events.filter((event) => event.kind === "sub" && event.teamId === teamId).length;
}

export function tacticalSubCount(
  opening: TeamSheet,
  next: TeamSheet,
  events: MatchEvent[],
  teamId: string,
): number {
  const injured = new Set(
    events.filter((event) => event.kind === "injury" && event.teamId === teamId).map((event) => event.playerName),
  );
  const nextStarters = new Set(next.starters);
  return opening.starters.filter((name) => !nextStarters.has(name) && !injured.has(name)).length;
}

export function remainingMatchSubs(
  events: MatchEvent[],
  teamId: string,
  opening: TeamSheet,
  next: TeamSheet = opening,
): number {
  const used = substitutionCount(events, teamId) + tacticalSubCount(opening, next, events, teamId);
  return Math.max(0, MATCH_SUB_LIMIT - used);
}

export function replacedNameOf(event: MatchEvent): string | undefined {
  if (event.replacedName) return event.replacedName;
  const match = event.text.match(/is on for (.+)\.?\s*$/);
  return match?.[1];
}

export type SubAppearance = {
  onMinute?: number;
  offMinute?: number;
  offKind?: "sub" | "injury";
};

export function appearanceOf(
  events: MatchEvent[],
  teamId: string,
  name: string,
  opening?: TeamSheet,
  current?: TeamSheet,
): SubAppearance {
  const mark: SubAppearance = {};
  for (const event of events) {
    if (event.teamId !== teamId) continue;
    if (event.kind === "sub" && event.playerName === name) {
      mark.onMinute = event.minute;
    }
    if (event.kind === "injury" && event.playerName === name) {
      mark.offMinute = event.minute;
      mark.offKind = "injury";
    } else if (event.kind === "sub" && replacedNameOf(event) === name && mark.offKind !== "injury") {
      mark.offMinute = event.minute;
      mark.offKind = "sub";
    }
  }
  if (!opening || !current) return mark;
  const started = opening.starters.includes(name);
  const nowOn = current.starters.includes(name);
  if (!started && nowOn && mark.onMinute === undefined) mark.onMinute = 32;
  if (started && !nowOn && mark.offMinute === undefined) {
    mark.offMinute = 32;
    mark.offKind = "sub";
  }
  if (nowOn && mark.offKind === "sub" && mark.onMinute === undefined) {
    mark.onMinute = mark.offMinute;
    mark.offMinute = undefined;
    mark.offKind = undefined;
  }
  return mark;
}

export function sheetChangeSubEvents(
  from: TeamSheet,
  to: TeamSheet,
  teamId: string,
  minute: number,
): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (let index = 0; index < 15; index += 1) {
    const outgoing = from.starters[index];
    const incoming = to.starters[index];
    if (!outgoing || !incoming || outgoing === incoming) continue;
    if (from.starters.includes(incoming) && to.starters.includes(outgoing)) continue;
    if (!to.starters.includes(incoming) || !from.starters.includes(outgoing)) continue;
    events.push({
      minute,
      teamId,
      playerName: incoming,
      replacedName: outgoing,
      kind: "sub",
      text: `${incoming} is on for ${outgoing}.`,
    });
  }
  return events;
}

export function prependHalfTimeSubs(
  first: { homeId: string; awayId: string; homeSheet: TeamSheet; awaySheet: TeamSheet; homeClosingSheet?: TeamSheet; awayClosingSheet?: TeamSheet },
  second: { events: MatchEvent[] },
  sheets: { home: TeamSheet; away: TeamSheet },
): MatchEvent[] {
  const extras = [
    ...sheetChangeSubEvents(first.homeClosingSheet ?? first.homeSheet, sheets.home, first.homeId, 32),
    ...sheetChangeSubEvents(first.awayClosingSheet ?? first.awaySheet, sheets.away, first.awayId, 32),
  ];
  if (extras.length === 0) return second.events;
  return [...extras, ...second.events];
}
