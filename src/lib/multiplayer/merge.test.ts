import { describe, expect, it } from "vitest";
import { PRESEASON_WEEKS } from "../training";
import { addSeat, clubPreseasonWeek, createCampaign, readyClub, startCampaign, trainClub } from "./campaign";
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

function trainFullWeek(
  campaign: ReturnType<typeof lobby>,
  clubId: string,
  session: "mixed" | "fitness" | "skills" | "setpieces" | "recovery" | "challenge",
  now: number,
) {
  let next = campaign;
  for (let index = 0; index < 3; index += 1) {
    next = trainClub(next, clubId, session, now + index);
  }
  return next;
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
    const hostCopy = trainFullWeek(base, "ballyea", "skills", NOW + 10);
    const guestCopy = trainFullWeek(base, "inagh-kilnamona", "fitness", NOW + 11);
    const merged = mergeCampaigns(hostCopy, guestCopy);
    expect(clubPreseasonWeek(merged, "ballyea")).toBe(2);
    expect(clubPreseasonWeek(merged, "inagh-kilnamona")).toBe(2);
    expect(merged.clubs.ballyea.inbox.some((item) => item.kind === "training")).toBe(true);
    expect(merged.clubs["inagh-kilnamona"].inbox.some((item) => item.kind === "training")).toBe(true);
  });

  it("unions ready flags from both phones", () => {
    let season = lobby();
    for (let week = 1; week <= PRESEASON_WEEKS; week += 1) {
      season = trainClub(season, "ballyea", "skills", NOW + week);
      season = trainClub(season, "ballyea", "skills", NOW + week + 1);
      season = trainClub(season, "ballyea", "skills", NOW + week + 2);
      season = trainClub(season, "inagh-kilnamona", "fitness", NOW + week + 10);
      season = trainClub(season, "inagh-kilnamona", "fitness", NOW + week + 11);
      season = trainClub(season, "inagh-kilnamona", "fitness", NOW + week + 12);
    }
    const hostReady = readyClub(season, "ballyea", NOW + 100);
    const guestReady = readyClub(season, "inagh-kilnamona", NOW + 101);
    const merged = mergeCampaigns(hostReady, guestReady);
    expect(merged.week.ready.ballyea).toBeTruthy();
    expect(merged.week.ready["inagh-kilnamona"]).toBeTruthy();
  });

  it("is stable if you merge the same pair twice", () => {
    const base = lobby();
    const hostCopy = trainFullWeek(base, "ballyea", "skills", NOW + 10);
    const guestCopy = trainFullWeek(base, "inagh-kilnamona", "fitness", NOW + 11);
    const once = mergeCampaigns(hostCopy, guestCopy);
    const twice = mergeCampaigns(once, guestCopy);
    expect(clubPreseasonWeek(twice, "ballyea")).toBe(2);
    expect(clubPreseasonWeek(twice, "inagh-kilnamona")).toBe(2);
    expect(mergeCampaigns(once, once)).toBe(once);
  });
});
