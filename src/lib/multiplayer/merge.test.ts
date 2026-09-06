import { describe, expect, it } from "vitest";
import { PRESEASON_WEEKS } from "../training";
import { addSeat, createCampaign, readyClub, startCampaign, trainClub } from "./campaign";
import { mergeCampaigns } from "./merge";

const NOW = 1_700_000_000_000;

function lobby() {
  const created = createCampaign({
    hostPlayerId: "host",
    hostName: "Rory",
    clubId: "ballyea",
    waitHours: 24,
    now: NOW,
    seed: 42,
    code: "TEST01",
  });
  const joined = addSeat(created, { playerId: "guest", name: "Siobhan", clubId: "inagh-kilnamona" });
  if (!joined.ok) throw new Error(joined.error);
  const started = startCampaign(joined.campaign, "host", NOW);
  if (!started.ok) throw new Error(started.error);
  return started.campaign;
}

describe("campaign merge", () => {
  it("keeps both managers when one copy only has the host", () => {
    const full = lobby();
    const hostOnly = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 24,
      now: NOW,
      seed: 42,
      code: "TEST01",
    });
    const sameId = { ...hostOnly, id: full.id };
    const merged = mergeCampaigns(sameId, full);
    expect(merged.seats.map((seat) => seat.clubId).sort()).toEqual(["ballyea", "inagh-kilnamona"]);
  });

  it("keeps each club's own training when two phones train apart", () => {
    const base = lobby();
    const hostCopy = trainClub(base, "ballyea", "skills", NOW + 10);
    const guestCopy = trainClub(base, "inagh-kilnamona", "fitness", NOW + 11);
    const merged = mergeCampaigns(hostCopy, guestCopy);
    expect(merged.clubs.ballyea.trainingDue).toBe(false);
    expect(merged.clubs["inagh-kilnamona"].trainingDue).toBe(false);
    expect(merged.clubs.ballyea.inbox.some((item) => item.kind === "training")).toBe(true);
    expect(merged.clubs["inagh-kilnamona"].inbox.some((item) => item.kind === "training")).toBe(true);
  });

  it("unions ready flags from both phones", () => {
    let season = lobby();
    for (let week = 1; week <= PRESEASON_WEEKS; week += 1) {
      season = trainClub(season, "ballyea", "skills", NOW + week);
      season = trainClub(season, "inagh-kilnamona", "fitness", NOW + week + 10);
    }
    const hostReady = readyClub(season, "ballyea", NOW + 100);
    const guestReady = readyClub(season, "inagh-kilnamona", NOW + 101);
    const merged = mergeCampaigns(hostReady, guestReady);
    expect(merged.week.ready.ballyea).toBeTruthy();
    expect(merged.week.ready["inagh-kilnamona"]).toBeTruthy();
  });

  it("is stable if you merge the same pair twice", () => {
    const base = lobby();
    const hostCopy = trainClub(base, "ballyea", "skills", NOW + 10);
    const guestCopy = trainClub(base, "inagh-kilnamona", "fitness", NOW + 11);
    const once = mergeCampaigns(hostCopy, guestCopy);
    const twice = mergeCampaigns(once, guestCopy);
    expect(twice.clubs.ballyea.trainingDue).toBe(false);
    expect(twice.clubs["inagh-kilnamona"].trainingDue).toBe(false);
    expect(mergeCampaigns(once, once)).toBe(once);
  });
});
