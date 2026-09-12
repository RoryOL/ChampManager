import type { MqttClient } from "mqtt";
import type { Campaign } from "../../types";
import { normaliseCode } from "./codes";
import { campaignOutranks } from "./merge";
import { parseCampaignInvite } from "./store";

const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
const USER_AGENT = "ChampManager/1.0";

export type RoomStatus = "offline" | "connecting" | "live";

function topicFor(code: string): string {
  return `capture-the-canon/v1/${normaliseCode(code)}`;
}

export function connectRoom(
  code: string,
  options: {
    onCampaign: (campaign: Campaign) => void;
    onStatus?: (status: RoomStatus) => void;
    brokerUrl?: string;
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
    const payload = JSON.stringify(campaign);
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

  void import("mqtt").then((mod) => {
    if (stopped) return;
    const mqtt = mod.default;
    client = mqtt.connect(options.brokerUrl ?? BROKER_URL, {
      clientId: `cm-${normaliseCode(code).slice(0, 4)}-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 4000,
      connectTimeout: 8000,
      username: USER_AGENT,
      protocolVersion: 4,
    });

    client.on("connect", () => {
      if (stopped) return;
      options.onStatus?.("live");
      client?.subscribe(topic, { qos: 1 }, () => {
        if (republishTimer) clearTimeout(republishTimer);
        // Let the retained championship arrive before we republish, so a stale
        // lobby on this phone cannot overwrite a championship that already started.
        republishTimer = setTimeout(publishQueued, 400);
      });
    });

    client.on("reconnect", () => {
      if (!stopped) options.onStatus?.("connecting");
    });
    client.on("close", () => {
      if (!stopped) options.onStatus?.("offline");
    });
    client.on("error", () => {
      if (!stopped) options.onStatus?.("offline");
    });

    client.on("message", (_topic, payload) => {
      const text = payload.toString();
      if (!text || text === lastSent) return;
      const campaign = parseCampaignInvite(text);
      if (!campaign || normaliseCode(campaign.code) !== normaliseCode(code)) return;
      remember(campaign);
      options.onCampaign(campaign);
    });
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

export function fetchRoom(code: string, timeoutMs = 7000): Promise<Campaign | null> {
  const normalised = normaliseCode(code);
  if (normalised.length < 4) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (campaign: Campaign | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handle.disconnect();
      resolve(campaign);
    };

    const handle = connectRoom(normalised, {
      onCampaign: (campaign) => finish(campaign),
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}
