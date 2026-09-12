import type { IClientOptions, MqttClient } from "mqtt";
import type { Campaign } from "../../types";
import { normaliseCode } from "./codes";
import { campaignOutranks, freshestCampaign } from "./merge";
import { encodeCampaign, decodeCampaign } from "./codec";

/** Public brokers, first working one wins. EMQX is last — it has been refusing MQTT. */
export const BROKER_URLS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
];

const USER_AGENT = "ChampManager/1.0";
const BROKER_STORE = "capture-the-canon-room-brokers";
const DISCOVER_WAIT_MS = 800;
const LOBBY_HEARTBEAT_MS = 2500;

export type RoomStatus = "offline" | "connecting" | "live";

export type RoomProbe = {
  connected: boolean;
  campaign: Campaign | null;
  brokerUrl?: string;
};

export type JoinPreview = {
  connected: boolean;
  found: boolean;
  clubs: string[];
  hostName?: string;
  source: "live" | "snapshot" | "local" | "none";
};

type Discovered = {
  url: string;
  client: MqttClient | null;
  campaign: Campaign | null;
};

function readStoredBrokers(): Array<[string, string]> {
  try {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(BROKER_STORE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is [string, string] =>
        Array.isArray(row) && typeof row[0] === "string" && typeof row[1] === "string",
    );
  } catch {
    return [];
  }
}

const roomBrokers = new Map<string, string>(readStoredBrokers());

function persistBrokers(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(BROKER_STORE, JSON.stringify([...roomBrokers]));
  } catch {
    // private mode / tests
  }
}

export function rememberRoomBroker(code: string, url: string): void {
  roomBrokers.set(normaliseCode(code), url);
  persistBrokers();
}

export function roomBroker(code: string): string | undefined {
  return roomBrokers.get(normaliseCode(code));
}

export function forgetRoomBroker(code: string): void {
  roomBrokers.delete(normaliseCode(code));
  persistBrokers();
}

export function resetRoomBrokers(): void {
  roomBrokers.clear();
  persistBrokers();
}

function topicFor(code: string): string {
  return `capture-the-canon/v1/${normaliseCode(code)}`;
}

function clientId(code: string): string {
  return `cm-${normaliseCode(code).slice(0, 4)}-${Math.random().toString(16).slice(2, 10)}`;
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    list.push(url);
  }
  return list;
}

function brokerList(code: string, options: { brokerUrl?: string; brokerUrls?: string[] }): string[] {
  if (options.brokerUrl) return [options.brokerUrl];
  if (options.brokerUrls?.length) return options.brokerUrls;
  const preferred = roomBroker(code);
  // Once a code has a broker, stay there. Failover publishes the lobby onto a
  // different public broker, and the host never sees the joiner.
  if (preferred) return [preferred];
  return BROKER_URLS;
}

function searchBrokerList(code: string, brokerUrl?: string | string[]): string[] {
  if (Array.isArray(brokerUrl)) return uniqueUrls(brokerUrl);
  if (brokerUrl) return [brokerUrl];
  return uniqueUrls([roomBroker(code), ...BROKER_URLS]);
}

function closeClient(client: MqttClient | null | undefined): void {
  try {
    client?.end(true);
  } catch {
    // already closed
  }
}

function tryBroker(
  mqtt: (typeof import("mqtt"))["default"],
  url: string,
  id: string,
): Promise<MqttClient | null> {
  return new Promise((resolve) => {
    const client = mqtt.connect(url, {
      clientId: id,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 3500,
      username: USER_AGENT,
      protocolVersion: 4,
    } satisfies IClientOptions);
    let settled = false;
    const finish = (value: MqttClient | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeAllListeners("connect");
      client.removeAllListeners("close");
      if (!value) client.end(true);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 4000);
    client.on("error", () => finish(null));
    client.once("connect", () => finish(client));
    // mqtt.js can emit close during a handshake that still connects; wait a tick.
    client.once("close", () => {
      setTimeout(() => {
        if (!settled && !client.connected) finish(null);
      }, 80);
    });
  });
}

function waitForCampaign(client: MqttClient, topic: string, waitMs: number): Promise<Campaign | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Campaign | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (_topic: string, payload: { toString(): string }) => {
      const campaign = decodeCampaign(payload.toString());
      if (campaign) finish(campaign);
    };
    const timer = setTimeout(() => finish(null), waitMs);
    client.on("message", onMessage);
    client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) finish(null);
    });
  });
}

async function discoverBroker(
  mqtt: (typeof import("mqtt"))["default"],
  url: string,
  code: string,
  waitMs: number,
): Promise<Discovered | null> {
  const client = await tryBroker(mqtt, url, clientId(code));
  if (!client) return null;
  const campaign = await waitForCampaign(client, topicFor(code), waitMs);
  if (!client.connected) {
    closeClient(client);
    return campaign ? { url, client: null, campaign } : null;
  }
  return { url, client, campaign };
}

function pickDiscovered(rows: Array<Discovered | null>): {
  chosen: Discovered | null;
  connected: boolean;
} {
  const found = rows.filter((row): row is Discovered => Boolean(row));
  const withCampaign = found.filter((row) => row.campaign);
  const campaign = freshestCampaign(withCampaign.map((row) => row.campaign));
  const winner =
    (campaign && withCampaign.find((row) => row.campaign === campaign)) ||
    (campaign &&
      withCampaign.find(
        (row) => row.campaign?.id === campaign.id && row.campaign?.revision === campaign.revision,
      )) ||
    (!campaign ? found[0] : undefined);
  for (const row of found) {
    if (row !== winner) closeClient(row.client);
  }
  return { chosen: winner ?? null, connected: found.length > 0 };
}

export function connectRoom(
  code: string,
  options: {
    onCampaign: (campaign: Campaign) => void;
    onStatus?: (status: RoomStatus) => void;
    brokerUrl?: string;
    brokerUrls?: string[];
  },
): { publish: (campaign: Campaign) => void; remember: (campaign: Campaign) => void; disconnect: () => void } {
  const topic = topicFor(code);
  let client: MqttClient | null = null;
  let lastSent = "";
  let queued: Campaign | null = null;
  let best: Campaign | null = null;
  let stopped = false;
  let republishTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  options.onStatus?.("connecting");

  const remember = (campaign: Campaign) => {
    if (normaliseCode(campaign.code) !== normaliseCode(code)) return;
    if (!queued || campaignOutranks(campaign, queued) || !campaignOutranks(queued, campaign)) {
      queued = campaign;
    }
    if (!best || campaignOutranks(campaign, best) || !campaignOutranks(best, campaign)) {
      best = campaign;
    }
  };

  const publishNow = (campaign: Campaign) => {
    if (normaliseCode(campaign.code) !== normaliseCode(code)) return;
    if (best && campaignOutranks(best, campaign)) return;
    // Throw-in is ~160KB raw and public brokers drop it; lobby JSON stays plain.
    const payload = encodeCampaign(campaign);
    lastSent = payload;
    remember(campaign);
    if (!client?.connected) return;
    client.publish(topic, payload, { qos: 1, retain: true });
  };

  const publishQueued = () => {
    if (stopped || !queued) return;
    if (best && campaignOutranks(best, queued)) {
      publishNow(best);
      return;
    }
    publishNow(queued);
  };

  const attach = (next: MqttClient, seeded?: Campaign | null) => {
    client = next;
    if (next.options) next.options.reconnectPeriod = 4000;
    if (seeded) {
      remember(seeded);
      options.onCampaign(seeded);
    }
    let live = false;
    const goLive = () => {
      if (stopped || live) return;
      live = true;
      options.onStatus?.("live");
      next.subscribe(topic, { qos: 1 }, () => {
        if (republishTimer) clearTimeout(republishTimer);
        // Let the retained championship arrive before we republish, so a stale
        // lobby on this phone cannot overwrite a championship that already started.
        republishTimer = setTimeout(publishQueued, 400);
      });
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (stopped || !client?.connected || queued?.phase !== "lobby") return;
        publishQueued();
      }, LOBBY_HEARTBEAT_MS);
    };
    next.on("connect", goLive);
    next.on("reconnect", () => {
      live = false;
      if (!stopped) options.onStatus?.("connecting");
    });
    next.on("close", () => {
      live = false;
      if (!stopped) options.onStatus?.("offline");
    });
    next.on("error", () => {
      if (!stopped) options.onStatus?.("offline");
    });
    next.on("message", (_topic, payload) => {
      const text = payload.toString();
      if (!text || text === lastSent) return;
      const campaign = decodeCampaign(text);
      if (!campaign || normaliseCode(campaign.code) !== normaliseCode(code)) return;
      remember(campaign);
      options.onCampaign(campaign);
    });
    if (next.connected) goLive();
  };

  void import("mqtt").then(async (mod) => {
    if (stopped) return;
    const mqtt = mod.default;
    const urls = brokerList(code, options);
    if (urls.length <= 1) {
      const url = urls[0];
      const next = url ? await tryBroker(mqtt, url, clientId(code)) : null;
      if (stopped) {
        next && closeClient(next);
        return;
      }
      if (next && url) {
        rememberRoomBroker(code, url);
        attach(next);
        return;
      }
      if (!stopped) options.onStatus?.("offline");
      return;
    }

    const { chosen } = pickDiscovered(
      await Promise.all(urls.map((url) => discoverBroker(mqtt, url, code, DISCOVER_WAIT_MS))),
    );
    if (stopped) {
      closeClient(chosen?.client);
      return;
    }
    if (chosen) {
      rememberRoomBroker(code, chosen.url);
      let next = chosen.client;
      if (!next?.connected) {
        closeClient(next);
        next = await tryBroker(mqtt, chosen.url, clientId(code));
      }
      if (stopped) {
        closeClient(next);
        return;
      }
      if (next) {
        attach(next, chosen.campaign);
        return;
      }
    }
    if (!stopped) options.onStatus?.("offline");
  });

  return {
    publish: publishNow,
    remember,
    disconnect: () => {
      stopped = true;
      if (republishTimer) clearTimeout(republishTimer);
      if (heartbeat) clearInterval(heartbeat);
      options.onStatus?.("offline");
      closeClient(client);
      client = null;
    },
  };
}

export async function probeRoom(code: string, timeoutMs = 10_000, brokerUrl?: string | string[]): Promise<RoomProbe> {
  const normalised = normaliseCode(code);
  if (normalised.length < 4) return { connected: false, campaign: null };

  const mqtt = (await import("mqtt")).default;
  const urls = searchBrokerList(normalised, brokerUrl);
  const started = Date.now();
  const results = await Promise.all(urls.map((url) => discoverBroker(mqtt, url, normalised, DISCOVER_WAIT_MS)));
  if (Date.now() - started > timeoutMs && !results.some((row) => row?.campaign)) {
    for (const row of results) closeClient(row?.client);
    return { connected: results.some(Boolean), campaign: null, brokerUrl: roomBroker(normalised) };
  }
  const { chosen, connected } = pickDiscovered(results);
  closeClient(chosen?.client);
  if (chosen?.campaign) {
    rememberRoomBroker(normalised, chosen.url);
    return { connected: true, campaign: chosen.campaign, brokerUrl: chosen.url };
  }
  return { connected, campaign: null, brokerUrl: roomBroker(normalised) };
}

export async function fetchRoom(code: string, timeoutMs = 10_000, brokerUrl?: string): Promise<Campaign | null> {
  const probe = await probeRoom(code, timeoutMs, brokerUrl);
  return probe.campaign;
}
