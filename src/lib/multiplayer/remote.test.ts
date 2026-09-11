import { describe, expect, it } from "vitest";
import { createCampaign, addSeat, startCampaign } from "./campaign";
import { applyRemoteCampaign } from "./merge";
import { connectRoom } from "./remote";

const NOW = 1_700_000_000_000;

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

    const host = connectRoom(campaign.code, { onCampaign: () => undefined });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("host room did not go live")), 8000);
      const wait = connectRoom(campaign.code, {
        onCampaign: () => undefined,
        onStatus: (status) => {
          if (status !== "live") return;
          clearTimeout(timer);
          wait.disconnect();
          resolve();
        },
      });
    });
    host.publish(campaign);

    const received = await new Promise<typeof campaign>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("guest did not see the room")), 8000);
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
    const host = connectRoom(created.code, {
      onCampaign: (remote) => {
        const applied = applyRemoteCampaign(hostCopy, remote);
        hostCopy = applied.campaign;
        if (applied.publish) host.publish(applied.publish);
      },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("host room did not go live")), 8000);
      const wait = connectRoom(created.code, {
        onCampaign: () => undefined,
        onStatus: (status) => {
          if (status !== "live") return;
          clearTimeout(timer);
          wait.disconnect();
          resolve();
        },
      });
    });
    host.publish(started.campaign);

    const guest = connectRoom(created.code, { onCampaign: () => undefined });
    guest.publish(joined.campaign);

    const received = await new Promise<typeof started.campaign>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("room stayed in the lobby")), 10_000);
      const reader = connectRoom(created.code, {
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
});
