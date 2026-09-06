import { describe, expect, it } from "vitest";
import { createCampaign } from "./campaign";
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
});
