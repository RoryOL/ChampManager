import type { Tactics, TeamSheet } from "../types";
import { XV_SLOTS } from "./attributes";

/** Full-back 1–3 mark full-forwards 12–14; half-backs 4–6 mark half-forwards 9–11. */
export function markerSlot(forwardIndex: number): number {
  if (forwardIndex >= 12) return Math.min(3, Math.max(1, forwardIndex - 11));
  if (forwardIndex >= 9) return Math.min(6, Math.max(4, forwardIndex - 5));
  if (forwardIndex >= 7) return forwardIndex === 7 ? 4 : 6;
  return Math.max(1, Math.min(6, forwardIndex));
}

/** Full-backs, half-backs and midfielders can be told to track a man. */
export function isMarkerSlot(index: number): boolean {
  return index >= 1 && index <= 8;
}

/** Opposition half-forwards and full-forwards can be picked up. */
export function isAttackerSlot(index: number): boolean {
  return index >= 9 && index <= 14;
}

export function slotLineLabel(index: number): string {
  return XV_SLOTS[index] ?? "Bench";
}

export function migrateManMarks(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const next: Record<string, string> = {};
  for (const [marker, target] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof target === "string" && target.trim() && marker.trim()) next[marker] = target;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function sanitizeManMarks(
  marks: Record<string, string> | undefined,
  ourStarters: string[],
  theirStarters: string[],
): Record<string, string> {
  const next: Record<string, string> = {};
  const used = new Set<string>();
  for (const [marker, target] of Object.entries(marks ?? {})) {
    const markerIndex = ourStarters.indexOf(marker);
    const targetIndex = theirStarters.indexOf(target);
    if (!isMarkerSlot(markerIndex) || !isAttackerSlot(targetIndex) || used.has(target)) continue;
    next[marker] = target;
    used.add(target);
  }
  return next;
}

export function withManMarks(tactics: Tactics, marks: Record<string, string>): Tactics {
  const manMarks = Object.keys(marks).length > 0 ? marks : undefined;
  if (!manMarks && !tactics.manMarks) return tactics;
  return { ...tactics, manMarks };
}

export function setManMark(tactics: Tactics, marker: string, target: string | undefined): Tactics {
  const next = { ...(tactics.manMarks ?? {}) };
  if (!target) delete next[marker];
  else {
    for (const [name, marked] of Object.entries(next)) {
      if (marked === target && name !== marker) delete next[name];
    }
    next[marker] = target;
  }
  return withManMarks(tactics, next);
}

/**
 * A full-back told to track a half-forward pushes onto the half-back line;
 * a half-back drops into the full-back line.
 */
export function applyManMarkShape(
  sheet: TeamSheet,
  opponent: TeamSheet,
  marks: Record<string, string> | undefined,
): TeamSheet {
  const starters = [...sheet.starters];
  const clean = sanitizeManMarks(marks, starters, opponent.starters);
  const pushing = new Set(
    Object.entries(clean)
      .filter(([, target]) => {
        const targetIndex = opponent.starters.indexOf(target);
        return targetIndex >= 9 && targetIndex <= 11;
      })
      .map(([marker]) => marker),
  );

  for (const [marker, target] of Object.entries(clean)) {
    const markerIndex = starters.indexOf(marker);
    const targetIndex = opponent.starters.indexOf(target);
    if (markerIndex < 1 || markerIndex > 3) continue;
    if (targetIndex < 9 || targetIndex > 11) continue;
    const preferred = markerSlot(targetIndex);
    const candidates = [preferred, 4, 5, 6].filter((index, i, list) => list.indexOf(index) === i);
    const dropIndex = candidates.find((index) => {
      const occupant = starters[index];
      return Boolean(occupant) && occupant !== marker && !pushing.has(occupant);
    });
    if (dropIndex === undefined) continue;
    const dropper = starters[dropIndex]!;
    starters[dropIndex] = marker;
    starters[markerIndex] = dropper;
  }
  return { starters, subs: [...sheet.subs] };
}

export function resolveMarker(
  attackerIndex: number,
  attackerName: string,
  defenderNames: string[],
  marks: Record<string, string> | undefined,
): { name: string; assigned: boolean } {
  const assigned = Object.entries(marks ?? {}).find(
    ([marker, target]) => target === attackerName && defenderNames.includes(marker),
  )?.[0];
  if (assigned) return { name: assigned, assigned: true };
  return { name: defenderNames[markerSlot(attackerIndex)] ?? "", assigned: false };
}

/** Extra cover when a named man-mark is on — marking, pace, strength, workrate and hooking all count. */
export function markNegation(
  marker: {
    manMarking: number;
    speed?: number;
    acceleration?: number;
    strength?: number;
    workrate?: number;
    hooking?: number;
  },
  assigned: boolean,
): { extraCover: number; aerialBoost: number; convertCut: number } {
  if (!assigned) return { extraCover: 0, aerialBoost: 0, convertCut: 0 };
  const manMarking = marker.manMarking;
  const speed = marker.speed ?? 12;
  const acceleration = marker.acceleration ?? 12;
  const strength = marker.strength ?? 12;
  const workrate = marker.workrate ?? 12;
  const hooking = marker.hooking ?? 12;
  const extraCover = Math.max(
    -2.8,
    Math.min(
      5.2,
      (manMarking - 12) * 0.24 +
        (speed - 12) * 0.1 +
        (acceleration - 12) * 0.1 +
        (strength - 12) * 0.14 +
        (workrate - 12) * 0.12 +
        (hooking - 12) * 0.1,
    ),
  );
  const aerialBoost = (manMarking - 12) * 0.28 + (strength - 12) * 0.16;
  const convertCut = Math.max(0, Math.min(0.22, (manMarking + workrate + hooking - 36) * 0.012));
  return { extraCover, aerialBoost, convertCut };
}

export function willPushToHalfBack(ourStarters: string[], theirStarters: string[], marker: string, target: string): boolean {
  const markerIndex = ourStarters.indexOf(marker);
  const targetIndex = theirStarters.indexOf(target);
  return markerIndex >= 1 && markerIndex <= 3 && targetIndex >= 9 && targetIndex <= 11;
}
