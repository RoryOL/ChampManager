import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, ATTRIBUTE_SHORT, type AttributeKey } from "./attributes";

export const TACTICS_COLUMNS_KEY = "champ-manager:tactics-columns";

const KEY_SET = new Set<string>(ATTRIBUTE_KEYS);

export type CompareWinner = "left" | "right" | "tie" | "none";

export type CompareLine = {
  id: string;
  label: string;
  left: string | number;
  right: string | number;
  winner: CompareWinner;
};

export function isAttributeKey(value: string): value is AttributeKey {
  return KEY_SET.has(value);
}

export function parseTacticsColumns(raw: unknown): AttributeKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AttributeKey>();
  const keys: AttributeKey[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !isAttributeKey(item) || seen.has(item)) continue;
    seen.add(item);
    keys.push(item);
  }
  return keys;
}

export function toggleTacticsColumn(current: AttributeKey[], key: AttributeKey): AttributeKey[] {
  if (current.includes(key)) return current.filter((item) => item !== key);
  return [...current, key];
}

export function loadTacticsColumns(): AttributeKey[] {
  try {
    const raw = localStorage.getItem(TACTICS_COLUMNS_KEY);
    if (!raw) return [];
    return parseTacticsColumns(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveTacticsColumns(keys: AttributeKey[]): void {
  try {
    localStorage.setItem(TACTICS_COLUMNS_KEY, JSON.stringify(parseTacticsColumns(keys)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function numericWinner(left: number, right: number): CompareWinner {
  if (left > right) return "left";
  if (right > left) return "right";
  return "tie";
}

export function compareStatLine(
  id: string,
  label: string,
  left: number,
  right: number,
): CompareLine {
  return { id, label, left, right, winner: numericWinner(left, right) };
}

export function tacticsCompareAttributeOrder(selected: AttributeKey[] = []): AttributeKey[] {
  const extra = parseTacticsColumns(selected);
  const rest = ATTRIBUTE_KEYS.filter((key) => !extra.includes(key));
  return [...extra, ...rest];
}

export function winnerTone(winner: CompareWinner, side: "left" | "right"): string {
  if (winner === "none" || winner === "tie") return "";
  return winner === side ? "is-up" : "is-down";
}

export function attributeHeading(key: AttributeKey): string {
  return ATTRIBUTE_SHORT[key];
}

export function attributeTitle(key: AttributeKey): string {
  return ATTRIBUTE_LABELS[key];
}
