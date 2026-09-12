import type { IClientOptions, MqttClient } from "mqtt";
import type { Campaign } from "../../types";
import { normaliseCode } from "./codes";
import { campaignOutranks } from "./merge";
import { encodeCampaign, decodeCampaign } from "./codec";

/** Public brokers, first working one wins. EMQX is last — it has been refusing MQTT. */
export const BROKER_URLS = [
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
];

const USER_AGENT = "ChampManager/1.0";

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

const roomBrokers = new Map<string, string>();

export function rememberRoomBroker(code: string, url: string): void {
  roomBrokers.set(normaliseCode(code), url);
}

export function roomBroker(code: string): string | undefined {
  return roomBrokers.get(normaliseCode(code));
}

export function resetRoomBrokers(): void {
  roomBrokers.clear();
}

function topicFor(code: string): string {
  return `capture-the-canon/v1/${normaliseCode(code)}`;
}

function clientId(code: string): string {
  return `cm-${normaliseCode(code).slice(0, 4)}-${Math.random().toString(16).slice(2, 10)}`;
}

function brokerList(code: string, options: { brokerUrl?: string; brokerUrls?: string[] }): string[] {
  if (options.brokerUrl) return [options.brokerUrl];
  if (options.brokerUrls?.length) return options.brokerUrls;
  const preferred = roomBroker(code);
  if (preferred) return [preferred, ...BROKER_URLS.filter((url) => url !== preferred)];
  return BROKER_URLS;
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
      connectTimeout: 5000,
      username: USER_AGENT,
      protocolVersion: 4,
    } satisfies IClientOptions);
    let settled = false;
    const finish = (value: MqttClient | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.removeAllListeners("connect");
      client.removeAllListeners("error");
      client.removeAllListeners("close");
      if (!value) client.end(true);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5500);
    client.once("connect", () => finish(client));
    client.once("error", () => finish(null));
    client.once("close", () => finish(null));
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
  let client: MqttClient | null = null;
  let lastSent = "";
  let queued: Campaign | null = null;
  let best: Campaign | null = null;
  let stopped = false;
  let republishTimer: ReturnType<typeof setTimeout> | null = null;
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

  const attach = (next: MqttClient) => {
    client = next;
    if (next.options) next.options.reconnectPeriod = 4000;
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
    for (const url of urls) {
      if (stopped) return;
      const next = await tryBroker(mqtt, url, clientId(code));
      if (stopped) {
        next?.end(true);
        return;
      }
      if (next) {
        rememberRoomBroker(code, url);
        attach(next);
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
      options.onStatus?.("offline");
      client?.end(true);
      client = null;
    },
  };
}

export function probeRoom(code: string, timeoutMs = 10_000, brokerUrl?: string): Promise<RoomProbe> {
  const normalised = normaliseCode(code);
  if (normalised.length < 4) return Promise.resolve({ connected: false, campaign: null });

  return new Promise((resolve) => {
    let settled = false;
    let connected = false;
    let campaign: Campaign | null = null;
    let hold: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (hold) clearTimeout(hold);
      clearTimeout(timer);
      handle.disconnect();
      resolve({ connected, campaign, brokerUrl: roomBroker(normalised) });
    };

    const handle = connectRoom(normalised, {
      brokerUrl,
      onStatus: (status) => {
        if (status !== "live") return;
        connected = true;
        if (campaign) {
          finish();
          return;
        }
        if (hold) clearTimeout(hold);
        hold = setTimeout(finish, 900);
      },
      onCampaign: (next) => {
        campaign = next;
        if (connected) finish();
      },
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

export async function fetchRoom(code: string, timeoutMs = 10_000, brokerUrl?: string): Promise<Campaign | null> {
  const probe = await probeRoom(code, timeoutMs, brokerUrl);
  return probe.campaign;
}
