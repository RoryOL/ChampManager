import type { Campaign } from "../../types";
import { tickCampaign } from "./campaign";

const CAMPAIGN_KEY = "champ-manager:campaign-v1";
const ROOMS_KEY = "champ-manager:rooms-v1";

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function rooms(): Record<string, Campaign> {
  return readJson<Record<string, Campaign>>(ROOMS_KEY) ?? {};
}

function writeRooms(next: Record<string, Campaign>): void {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(next));
}

export function persistCampaign(campaign: Campaign): void {
  localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
  writeRooms({ ...rooms(), [campaign.code]: campaign });
}

export function loadCampaign(now = Date.now()): Campaign | null {
  const stored = readJson<Campaign>(CAMPAIGN_KEY);
  if (!stored || stored.version !== 1 || !stored.code) return null;
  const ticked = tickCampaign(stored, now);
  if (ticked.revision !== stored.revision) persistCampaign(ticked);
  return ticked;
}

export function loadRoom(code: string, now = Date.now()): Campaign | null {
  const campaign = rooms()[code];
  if (!campaign || campaign.version !== 1) return null;
  return tickCampaign(campaign, now);
}

export function clearCampaign(): void {
  const current = readJson<Campaign>(CAMPAIGN_KEY);
  localStorage.removeItem(CAMPAIGN_KEY);
  if (!current) return;
  const next = { ...rooms() };
  delete next[current.code];
  writeRooms(next);
}

export function exportCampaign(campaign: Campaign): string {
  return JSON.stringify(campaign);
}

export function parseCampaignInvite(raw: string): Campaign | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Campaign;
    if (parsed?.version === 1 && parsed.code && Array.isArray(parsed.seats)) return parsed;
  } catch {
    return null;
  }
  return null;
}
