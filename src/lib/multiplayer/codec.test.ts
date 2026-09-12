import { describe, expect, it } from "vitest";
import { addSeat, createCampaign, startCampaign } from "./campaign";
import { decodeCampaign, encodeCampaign, PLAIN_CAMPAIGN_LIMIT, slimCampaignForWire, unwrapCampaignJson } from "./codec";

const NOW = 1_700_000_000_000;

function startedCampaign() {
  const created = createCampaign({
    hostPlayerId: "host",
    hostName: "Rory",
    clubId: "ballyea",
    waitHours: 24,
    now: NOW,
    seed: 42,
    code: "WIRE01",
  });
  const joined = addSeat(created, { playerId: "guest", name: "Siobhan", clubId: "inagh-kilnamona" });
  if (!joined.ok) throw new Error(joined.error);
  const started = startCampaign(joined.campaign, "host", NOW);
  if (!started.ok) throw new Error(started.error);
  return { lobby: joined.campaign, started: started.campaign };
}

describe("campaign wire codec", () => {
  it("keeps a lobby as plain JSON so Check room still works", () => {
    const { lobby } = startedCampaign();
    const encoded = encodeCampaign(lobby);
    expect(encoded.startsWith("{")).toBe(true);
    expect(encoded).toContain('"phase":"lobby"');
    expect(decodeCampaign(encoded)?.code).toBe("WIRE01");
  });

  it("compresses a started championship so public MQTT brokers can carry throw-in", () => {
    const { started } = startedCampaign();
    const plain = JSON.stringify(started);
    expect(plain.length).toBeGreaterThan(PLAIN_CAMPAIGN_LIMIT);
    const encoded = encodeCampaign(started);
    expect(encoded.length).toBeLessThan(32_000);
    expect(encoded).toContain('"enc":"gz"');
    const decoded = decodeCampaign(encoded);
    expect(decoded?.phase).toBe("preseason");
    expect(decoded?.seats.map((seat) => seat.clubId).sort()).toEqual(["ballyea", "inagh-kilnamona"]);
    expect(Object.keys(decoded?.clubs ?? {})).toHaveLength(16);
  });

  it("still reads an uncompressed championship snapshot", () => {
    const { started } = startedCampaign();
    const decoded = decodeCampaign(JSON.stringify(started));
    expect(decoded?.phase).toBe("preseason");
    expect(unwrapCampaignJson(JSON.stringify(started))?.includes('"preseason"')).toBe(true);
  });

  it("drops finished live matches from the MQTT payload", () => {
    const { started } = startedCampaign();
    const fat = {
      ...started,
      week: {
        ...started.week,
        lives: {
          done: {
            matchId: "done",
            first: { matchId: "done", events: [{ kind: "score" }] },
            combined: { matchId: "done", events: [{ kind: "full" }] },
          },
          open: {
            matchId: "open",
            first: { matchId: "open", homeId: "ballyea", awayId: "clonlara", events: [] },
          },
        },
      },
    } as unknown as typeof started;
    const slim = slimCampaignForWire(fat);
    expect(slim.week.lives.done).toBeUndefined();
    expect(slim.week.lives.open?.matchId).toBe("open");
    expect(decodeCampaign(encodeCampaign(fat))?.week.lives.open?.matchId).toBe("open");
    expect(decodeCampaign(encodeCampaign(fat))?.week.lives.done).toBeUndefined();
  });
});
