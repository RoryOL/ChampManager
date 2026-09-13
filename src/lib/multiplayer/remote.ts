import type { IClientOptions, MqttClient } from "mqtt";
import type { Campaign } from "../../types";
import { normaliseCode } from "./codes";
import { campaignOutranks, freshestCampaign } from "./merge";
import { encodeCampaign, decodeCampaign } from "./codec";

/** Public brokers. Mosquitto first — HiveMQ often hangs on CONNACK. EMQX last. */
export const BROKER_URLS = [
  "wss://test.mosquitto.org:8081/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
];

const USER_AGENT = "ChampManager/1.0";
const BROKER_STORE = "capture-the-canon-room-brokers";
const DISCOVER_WAIT_MS = 800;
const PROBE_WAIT_MS = 5_000;
const ROOM_HEARTBEAT_MS = 4000;
const REPUBLISH_MS = 400;

export type RoomStatus = "offline" | "connecting" | "live";

export type RoomProbe = {
  connected: boolean;
  campaign: Campaign | null;
  brokerUrl?: string;
};

export type JoinPreview = {
  connected: boolean;
  found: boolean;
  /** True only when the live MQTT lobby for this code was actually read. */
  liveFound: boolean;
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

function isPublicBroker(url: string): boolean {
  return BROKER_URLS.includes(url);
}

function brokerList(code: string, options: { brokerUrl?: string; brokerUrls?: string[] }): string[] {
  if (options.brokerUrl) return [options.brokerUrl];
  if (options.brokerUrls?.length) return options.brokerUrls;
  const preferred = roomBroker(code);
  // Lab brokers (and a dead pin) stay exclusive so tests do not hit the public net.
  // Public rooms mesh every working broker: a snapshot joiner on Mosquitto still
  // reaches a host who landed on HiveMQ.
  if (preferred && !isPublicBroker(preferred)) return [preferred];
  return uniqueUrls([preferred, ...BROKER_URLS]);
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

async function discoverFirst(
  mqtt: (typeof import("mqtt"))["default"],
  urls: string[],
  code: string,
  waitMs: number,
): Promise<{ chosen: Discovered | null; connected: boolean }> {
  if (urls.length === 0) return { chosen: null, connected: false };
  if (urls.length === 1) {
    const row = await discoverBroker(mqtt, urls[0], code, waitMs);
    return { chosen: row, connected: Boolean(row) };
  }

  return new Promise((resolve) => {
    let settled = false;
    let pending = urls.length;
    const rows: Discovered[] = [];
    const finish = (chosen: Discovered | null, connected: boolean) => {
      if (settled) return;
      settled = true;
      for (const row of rows) {
        if (row !== chosen) closeClient(row.client);
      }
      resolve({ chosen, connected });
    };

    for (const url of urls) {
      void discoverBroker(mqtt, url, code, waitMs).then((row) => {
        pending -= 1;
        if (settled) {
          closeClient(row?.client);
          return;
        }
        if (row) rows.push(row);
        if (row?.campaign) {
          finish(row, true);
          return;
        }
        if (pending === 0) {
          const picked = pickDiscovered(rows);
          finish(picked.chosen, picked.connected);
        }
      });
    }
  });
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
  const attached = new Map<string, MqttClient>();
  let lastSent = "";
  let queued: Campaign | null = null;
  let best: Campaign | null = null;
  let stopped = false;
  let pendingConnects = 0;
  const republishTimers = new Set<ReturnType<typeof setTimeout>>();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  options.onStatus?.("connecting");

  const anyConnected = () => [...attached.values()].some((client) => client.connected);

  const reportStatus = () => {
    if (stopped) return;
    if (anyConnected()) options.onStatus?.("live");
    else if (pendingConnects > 0) options.onStatus?.("connecting");
    else options.onStatus?.("offline");
  };

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
    remember(campaign);
    const live = [...attached.values()].filter((client) => client.connected);
    if (live.length === 0) return;
    lastSent = payload;
    for (const client of live) {
      client.publish(topic, payload, { qos: 1, retain: true }, (error) => {
        if (error && lastSent === payload) lastSent = "";
      });
    }
  };

  const publishQueued = () => {
    if (stopped || !queued) return;
    if (best && campaignOutranks(best, queued)) {
      publishNow(best);
      return;
    }
    publishNow(queued);
  };

  const attach = (next: MqttClient, url: string) => {
    attached.set(url, next);
    if (next.options) next.options.reconnectPeriod = 4000;
    let subscribed = false;
    const goLive = () => {
      if (stopped || subscribed) return;
      subscribed = true;
      reportStatus();
      next.subscribe(topic, { qos: 1 }, () => {
        // Let retained championships arrive before we republish, so a stale
        // lobby on this phone cannot overwrite a championship that already started.
        const timer = setTimeout(publishQueued, REPUBLISH_MS);
        republishTimers.add(timer);
      });
      if (!heartbeat) {
        heartbeat = setInterval(() => {
          if (stopped || !queued || !anyConnected()) return;
          publishQueued();
        }, ROOM_HEARTBEAT_MS);
      }
    };
    next.on("connect", () => {
      subscribed = false;
      goLive();
    });
    next.on("reconnect", () => {
      subscribed = false;
      if (!stopped && !anyConnected()) options.onStatus?.("connecting");
    });
    next.on("close", () => {
      subscribed = false;
      reportStatus();
    });
    next.on("error", () => {
      reportStatus();
    });
    next.on("message", (_topic, payload) => {
      const text = payload.toString();
      if (!text || text === lastSent) return;
      const campaign = decodeCampaign(text);
      if (!campaign || normaliseCode(campaign.code) !== normaliseCode(code)) return;
      rememberRoomBroker(code, url);
      remember(campaign);
      options.onCampaign(campaign);
    });
    if (next.connected) goLive();
  };

  void import("mqtt").then(async (mod) => {
    if (stopped) return;
    const mqtt = mod.default;
    const urls = brokerList(code, options);
    if (urls.length === 0) {
      options.onStatus?.("offline");
      return;
    }
    pendingConnects = urls.length;
    for (const url of urls) {
      void tryBroker(mqtt, url, clientId(code)).then((next) => {
        if (stopped) {
          closeClient(next);
          return;
        }
        pendingConnects -= 1;
        if (next) {
          rememberRoomBroker(code, url);
          attach(next, url);
        }
        reportStatus();
      });
    }
  });

  return {
    publish: publishNow,
    remember,
    disconnect: () => {
      stopped = true;
      pendingConnects = 0;
      for (const timer of republishTimers) clearTimeout(timer);
      republishTimers.clear();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      options.onStatus?.("offline");
      for (const client of attached.values()) closeClient(client);
      attached.clear();
    },
  };
}

export async function probeRoom(code: string, timeoutMs = 10_000, brokerUrl?: string | string[]): Promise<RoomProbe> {
  const normalised = normaliseCode(code);
  if (normalised.length < 4) return { connected: false, campaign: null };

  const mqtt = (await import("mqtt")).default;
  const urls = searchBrokerList(normalised, brokerUrl);
  const waitMs = Math.min(PROBE_WAIT_MS, Math.max(DISCOVER_WAIT_MS, timeoutMs));
  const { chosen, connected } = await discoverFirst(mqtt, urls, normalised, waitMs);
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
