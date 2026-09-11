import { describe, expect, it } from "vitest";
import { PRESEASON_WEEKS } from "../training";
import { addSeat, clubPreseasonWeek, createCampaign, readyClub, startCampaign, trainClub } from "./campaign";
import { applyRemoteCampaign, freshestCampaign, mergeCampaigns } from "./merge";

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

describe("campaign merge", { timeout: 15_000 }, () => {
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

  it("advances a joiner when the host has already started", () => {
    const started = lobby();
    const waiting = {
      ...started,
      phase: "lobby" as const,
      clubs: {},
      revision: started.revision - 1,
    };
    const merged = mergeCampaigns(waiting, started);
    expect(merged.phase).toBe("preseason");
    expect(merged.seats.map((seat) => seat.clubId).sort()).toEqual(["ballyea", "inagh-kilnamona"]);
  });

  it("prefers a started championship over an older lobby with a different id", () => {
    const started = lobby();
    const staleLobby = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 24,
      now: NOW - 1000,
      seed: 42,
      code: "TEST01",
    });
    const withGuest = addSeat(staleLobby, { playerId: "guest", name: "Siobhan", clubId: "inagh-kilnamona" });
    if (!withGuest.ok) throw new Error(withGuest.error);
    const merged = mergeCampaigns(withGuest.campaign, started);
    expect(merged.phase).toBe("preseason");
    expect(merged.id).toBe(started.id);
  });

  it("republishes the started room when a stale lobby comes back over MQTT", () => {
    const started = lobby();
    const waiting = { ...started, phase: "lobby" as const, clubs: {}, revision: 1 };
    const fromHost = applyRemoteCampaign(started, waiting);
    expect(fromHost.campaign.phase).toBe("preseason");
    expect(fromHost.publish?.phase).toBe("preseason");
    const fromGuest = applyRemoteCampaign(waiting, started);
    expect(fromGuest.campaign.phase).toBe("preseason");
  });

  it("picks a live started room over a locally stored lobby", () => {
    const started = lobby();
    const localLobby = { ...started, phase: "lobby" as const, clubs: {}, revision: 1 };
    expect(freshestCampaign([localLobby, started])?.phase).toBe("preseason");
    expect(freshestCampaign([localLobby, null, undefined])?.phase).toBe("lobby");
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
