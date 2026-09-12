import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Campaign } from "../../types";
import { parseCampaignInvite } from "./store";

export const PLAIN_CAMPAIGN_LIMIT = 8_000;

type GzipEnvelope = {
  v: 1;
  enc: "gz";
  d: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

function isGzipEnvelope(value: unknown): value is GzipEnvelope {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.v === 1 && record.enc === "gz" && typeof record.d === "string" && record.d.length > 0;
}

export function unwrapCampaignJson(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.includes('"seats"')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isGzipEnvelope(parsed)) return trimmed.startsWith("{") ? trimmed : null;
    return strFromU8(gunzipSync(base64ToBytes(parsed.d)));
  } catch {
    return null;
  }
}

export function encodeCampaign(campaign: Campaign): string {
  const json = JSON.stringify(campaign);
  if (json.length <= PLAIN_CAMPAIGN_LIMIT) return json;
  const envelope: GzipEnvelope = {
    v: 1,
    enc: "gz",
    d: bytesToBase64(gzipSync(strToU8(json), { level: 6 })),
  };
  return JSON.stringify(envelope);
}

export function decodeCampaign(raw: string): Campaign | null {
  const json = unwrapCampaignJson(raw);
  return json ? parseCampaignInvite(json) : null;
}
