import { randomId } from "./codes";

const PLAYER_KEY = "champ-manager:player-v1";
const LOCAL_SEATS_KEY = "champ-manager:local-seats-v1";

export type LocalPlayer = {
  id: string;
  name: string;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadPlayer(): LocalPlayer | null {
  const parsed = readJson<LocalPlayer>(PLAYER_KEY);
  if (!parsed?.id) return null;
  return { id: parsed.id, name: typeof parsed.name === "string" ? parsed.name : "" };
}

export function persistPlayer(player: LocalPlayer): void {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

export function ensurePlayer(): LocalPlayer {
  const existing = loadPlayer();
  if (existing) return existing;
  const created = { id: randomId(), name: "" };
  persistPlayer(created);
  return created;
}

export function setPlayerName(name: string): LocalPlayer {
  const player = { ...ensurePlayer(), name: name.trim() || "Manager" };
  persistPlayer(player);
  return player;
}

export function loadLocalSeatIds(): string[] {
  const parsed = readJson<string[]>(LOCAL_SEATS_KEY);
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
}

export function persistLocalSeatIds(ids: string[]): void {
  const unique = [...new Set(ids)];
  localStorage.setItem(LOCAL_SEATS_KEY, JSON.stringify(unique));
}

export function rememberLocalSeat(playerId: string): void {
  persistLocalSeatIds([...loadLocalSeatIds(), playerId]);
}

export function clearLocalSeats(): void {
  localStorage.removeItem(LOCAL_SEATS_KEY);
}

export function isLocalSeat(playerId: string, selfId: string): boolean {
  return playerId === selfId || loadLocalSeatIds().includes(playerId);
}
