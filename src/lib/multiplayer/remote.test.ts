import { createServer } from "node:net";
import type { AddressInfo, Server } from "node:net";
import { Aedes } from "aedes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCampaign, addSeat, startCampaign } from "./campaign";
import { applyRemoteCampaign } from "./merge";
import { connectRoom, probeRoom, rememberRoomBroker, resetRoomBrokers } from "./remote";

const NOW = 1_700_000_000_000;

let brokerUrl = "";
let broker: Aedes;
let server: Server;

beforeEach(async () => {
  resetRoomBrokers();
  broker = await Aedes.createBroker();
  server = createServer(broker.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  brokerUrl = `mqtt://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => broker.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function openRoom(code: string, options: Parameters<typeof connectRoom>[1]) {
  return connectRoom(code, { ...options, brokerUrl });
}

function waitUntilLive(code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("host room did not go live")), 8000);
    const wait = openRoom(code, {
      onCampaign: () => undefined,
      onStatus: (status) => {
        if (status !== "live") return;
        clearTimeout(timer);
        wait.disconnect();
        resolve();
      },
    });
  });
}

describe("live room", () => {
  it("lets a second client read a retained championship", async () => {
    const campaign = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 0,
      now: NOW,
      seed: 7,
      code: `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    });

    const host = openRoom(campaign.code, { onCampaign: () => undefined });
    await waitUntilLive(campaign.code);
    host.publish(campaign);

    const received = await new Promise<typeof campaign>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("guest did not see the room")), 8000);
      const guest = openRoom(campaign.code, {
        onCampaign: (next) => {
          clearTimeout(timer);
          guest.disconnect();
          resolve(next);
        },
      });
    });

    host.disconnect();
    expect(received.id).toBe(campaign.id);
    expect(received.seats[0]?.clubId).toBe("ballyea");
  }, 15_000);

  it("does not let a late lobby publish keep the joiner out of a started championship", async () => {
    const created = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 0,
      now: NOW,
      seed: 7,
      code: `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    });
    const joined = addSeat(created, { playerId: "guest", name: "Siobhan", clubId: "inagh-kilnamona" });
    if (!joined.ok) throw new Error(joined.error);
    const started = startCampaign(joined.campaign, "host", NOW);
    if (!started.ok) throw new Error(started.error);

    let hostCopy = started.campaign;
    const host = openRoom(created.code, {
      onCampaign: (remote) => {
        const applied = applyRemoteCampaign(hostCopy, remote);
        hostCopy = applied.campaign;
        if (applied.publish) host.publish(applied.publish);
      },
    });
    await waitUntilLive(created.code);
    host.publish(started.campaign);

    const guest = openRoom(created.code, { onCampaign: () => undefined });
    guest.publish(joined.campaign);

    const received = await new Promise<typeof started.campaign>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("room stayed in the lobby")), 10_000);
      const reader = openRoom(created.code, {
        onCampaign: (next) => {
          if (next.phase === "lobby") return;
          clearTimeout(timer);
          reader.disconnect();
          resolve(next);
        },
      });
    });

    host.disconnect();
    guest.disconnect();
    expect(received.phase).toBe("preseason");
    expect(received.seats.map((seat) => seat.clubId).sort()).toEqual(["ballyea", "inagh-kilnamona"]);
  }, 20_000);

  it("probes a live room and an empty code separately", async () => {
    const campaign = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 0,
      now: NOW,
      seed: 7,
      code: `T${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    });
    const host = openRoom(campaign.code, { onCampaign: () => undefined });
    await waitUntilLive(campaign.code);
    host.publish(campaign);
    const found = await probeRoom(campaign.code, 5000, brokerUrl);
    expect(found.connected).toBe(true);
    expect(found.campaign?.id).toBe(campaign.id);

    const empty = await probeRoom(`E${Math.random().toString(36).slice(2, 7).toUpperCase()}`, 4000, brokerUrl);
    expect(empty.connected).toBe(true);
    expect(empty.campaign).toBeNull();
    host.disconnect();
  }, 15_000);

  it("falls through a dead broker to a working one", async () => {
    const seen: string[] = [];
    const handle = connectRoom("FALL01", {
      brokerUrls: ["mqtt://127.0.0.1:9", brokerUrl],
      onCampaign: () => undefined,
      onStatus: (status) => {
        seen.push(status);
      },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("did not fail over")), 8000);
      const wait = setInterval(() => {
        if (seen.includes("live")) {
          clearInterval(wait);
          clearTimeout(timer);
          resolve();
        }
      }, 50);
    });
    handle.disconnect();
  }, 15_000);

  it("keeps later joins on the broker that already has the lobby", async () => {
    const campaign = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 0,
      now: NOW,
      seed: 7,
      code: `S${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    });
    const host = openRoom(campaign.code, { onCampaign: () => undefined });
    await waitUntilLive(campaign.code);
    host.publish(campaign);
    const found = await probeRoom(campaign.code, 5000, brokerUrl);
    expect(found.campaign?.id).toBe(campaign.id);

    const received = await new Promise<typeof campaign>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("guest used a different broker")), 8000);
      const guest = connectRoom(campaign.code, {
        onCampaign: (next) => {
          clearTimeout(timer);
          guest.disconnect();
          resolve(next);
        },
      });
    });

    host.disconnect();
    expect(received.id).toBe(campaign.id);
  }, 15_000);

  it("joins the broker that already has the lobby instead of an empty earlier one", async () => {
    const emptyBroker = await Aedes.createBroker();
    const emptyServer = createServer(emptyBroker.handle);
    await new Promise<void>((resolve) => emptyServer.listen(0, "127.0.0.1", resolve));
    const emptyUrl = `mqtt://127.0.0.1:${(emptyServer.address() as AddressInfo).port}`;

    const campaign = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 0,
      now: NOW,
      seed: 7,
      code: `B${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    });
    const host = openRoom(campaign.code, { onCampaign: () => undefined });
    await waitUntilLive(campaign.code);
    host.publish(campaign);

    const received = await new Promise<typeof campaign>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("guest published onto the empty broker")), 8000);
      const guest = connectRoom(campaign.code, {
        brokerUrls: [emptyUrl, brokerUrl],
        onCampaign: (next) => {
          clearTimeout(timer);
          guest.disconnect();
          resolve(next);
        },
      });
    });

    host.disconnect();
    await new Promise<void>((resolve) => emptyBroker.close(() => resolve()));
    await new Promise<void>((resolve) => emptyServer.close(() => resolve()));
    expect(received.id).toBe(campaign.id);
    expect(received.seats[0]?.clubId).toBe("ballyea");
  }, 15_000);

  it("does not fail over after a room is pinned to a broker", async () => {
    rememberRoomBroker("PIN01", "mqtt://127.0.0.1:9");
    const seen: string[] = [];
    const handle = connectRoom("PIN01", {
      onCampaign: () => undefined,
      onStatus: (status) => {
        seen.push(status);
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    handle.disconnect();
    expect(seen).toContain("connecting");
    expect(seen).not.toContain("live");
  }, 10_000);

  it("probes an empty broker then finds the lobby on the next one", async () => {
    const emptyBroker = await Aedes.createBroker();
    const emptyServer = createServer(emptyBroker.handle);
    await new Promise<void>((resolve) => emptyServer.listen(0, "127.0.0.1", resolve));
    const emptyUrl = `mqtt://127.0.0.1:${(emptyServer.address() as AddressInfo).port}`;

    const campaign = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 0,
      now: NOW,
      seed: 7,
      code: `Q${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    });
    const host = openRoom(campaign.code, { onCampaign: () => undefined });
    await waitUntilLive(campaign.code);
    host.publish(campaign);

    const found = await probeRoom(campaign.code, 8000, [emptyUrl, brokerUrl]);
    host.disconnect();
    await new Promise<void>((resolve) => emptyBroker.close(() => resolve()));
    await new Promise<void>((resolve) => emptyServer.close(() => resolve()));
    expect(found.connected).toBe(true);
    expect(found.campaign?.id).toBe(campaign.id);
    expect(found.brokerUrl).toBe(brokerUrl);
  }, 15_000);
});
