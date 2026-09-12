import type { Campaign } from "../../types";
import { tickCampaign, withCampaignDefaults } from "./campaign";

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

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota, private mode */
  }
}

function rooms(): Record<string, Campaign> {
  return readJson<Record<string, Campaign>>(ROOMS_KEY) ?? {};
}

function writeRooms(next: Record<string, Campaign>): void {
  writeJson(ROOMS_KEY, next);
}

function campaignForStorage(campaign: Campaign): Campaign {
  const lives: Campaign["week"]["lives"] = {};
  for (const [id, live] of Object.entries(campaign.week?.lives ?? {})) {
    if (!live || live.combined || campaign.reports?.[id]) continue;
    lives[id] = live;
  }
  const clubs: Campaign["clubs"] = { ...campaign.clubs };
  for (const clubId of Object.keys(clubs)) {
    const club = clubs[clubId];
    if (club && Array.isArray(club.inbox) && club.inbox.length > 24) {
      clubs[clubId] = { ...club, inbox: club.inbox.slice(0, 24) };
    }
  }
  return {
    ...campaign,
    clubs,
    week: { ...(campaign.week ?? { locked: false, deadlineAt: null, ready: {} }), lives },
  };
}

export function persistCampaign(campaign: Campaign): void {
  const stored = campaignForStorage(campaign);
  writeJson(CAMPAIGN_KEY, stored);
  writeRooms({ ...rooms(), [stored.code]: stored });
}

export function loadCampaign(now = Date.now()): Campaign | null {
  const stored = readJson<Campaign>(CAMPAIGN_KEY);
  if (!stored || stored.version !== 1 || !stored.code) return null;
  try {
    const ticked = tickCampaign(withCampaignDefaults(stored), now);
    if (ticked.revision !== stored.revision) persistCampaign(ticked);
    return ticked;
  } catch {
    try {
      return withCampaignDefaults(stored);
    } catch {
      return null;
    }
  }
}

export function loadRoom(code: string, now = Date.now()): Campaign | null {
  const campaign = rooms()[code];
  if (!campaign || campaign.version !== 1) return null;
  return tickCampaign(withCampaignDefaults(campaign), now);
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
    if (parsed?.version === 1 && parsed.code && Array.isArray(parsed.seats)) return withCampaignDefaults(parsed);
  } catch {
    return null;
  }
  return null;
}
