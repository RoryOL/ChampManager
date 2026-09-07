import { describe, expect, it } from "vitest";
import { applyInjury, isInjured } from "../injuries";
import { matchPlayed } from "../scoring";
import { DEFAULT_TACTICS, defaultSheet } from "../players";
import { PRESEASON_WEEKS } from "../training";
import {
  addSeat,
  championshipOf,
  createCampaign,
  forceAdvance,
  liveForClub,
  readyClub,
  startCampaign,
  submitSecondHalf,
  tickCampaign,
  trainClub,
  waitingOnSecondHalf,
  waitingOnWeek,
} from "./campaign";

const NOW = 1_700_000_000_000;

function twoPlayerLobby() {
  const campaign = createCampaign({
    hostPlayerId: "host",
    hostName: "Rory",
    clubId: "ballyea",
    waitHours: 24,
    now: NOW,
    seed: 42,
    code: "TEST01",
  });
  const joined = addSeat(campaign, { playerId: "guest", name: "Siobhan", clubId: "inagh-kilnamona" });
  expect(joined.ok).toBe(true);
  if (!joined.ok) throw new Error(joined.error);
  return joined.campaign;
}

function startedCampaign() {
  const started = startCampaign(twoPlayerLobby(), "host", NOW);
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error(started.error);
  return started.campaign;
}

function trainFullWeek(
  campaign: ReturnType<typeof startedCampaign>,
  clubId: string,
  session: "mixed" | "challenge" | "recovery" | "fitness" | "skills" | "setpieces",
  now: number,
) {
  let next = campaign;
  const sessions = next.phase === "preseason" ? 3 : 1;
  for (let index = 0; index < sessions; index += 1) {
    next = trainClub(next, clubId, session, now + index);
  }
  return next;
}

function throughPreseason(campaign = startedCampaign()) {
  let next = campaign;
  for (let week = 1; week <= PRESEASON_WEEKS; week += 1) {
    next = trainFullWeek(next, "ballyea", "skills", NOW + week * 10);
    expect(next.preseasonWeek).toBe(week);
    next = trainFullWeek(next, "inagh-kilnamona", "fitness", NOW + week * 10 + 3);
  }
  expect(next.phase).toBe("season");
  return next;
}

describe("multiplayer campaign", () => {
  it("lets a host invite another manager onto a unique club", () => {
    const campaign = twoPlayerLobby();
    expect(campaign.code).toBe("TEST01");
    expect(campaign.seats.map((seat) => seat.clubId)).toEqual(["ballyea", "inagh-kilnamona"]);
    const taken = addSeat(campaign, { playerId: "other", name: "Tom", clubId: "ballyea" });
    expect(taken.ok).toBe(false);
    const tooSoon = startCampaign(createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 6,
      now: NOW,
    }), "host", NOW);
    expect(tooSoon.ok).toBe(false);
  });

  it("holds preseason until every manager finishes that week's sessions", () => {
    let campaign = startedCampaign();
    campaign = trainClub(campaign, "ballyea", "skills", NOW + 10);
    expect(campaign.preseasonWeek).toBe(1);
    expect(campaign.clubs.ballyea.sessionsDone).toBe(1);
    expect(waitingOnWeek(campaign).map((seat) => seat.clubId).sort()).toEqual(["ballyea", "inagh-kilnamona"]);
    campaign = trainFullWeek(campaign, "ballyea", "skills", NOW + 11);
    expect(campaign.preseasonWeek).toBe(1);
    expect(waitingOnWeek(campaign).map((seat) => seat.clubId)).toEqual(["inagh-kilnamona"]);
    campaign = trainFullWeek(campaign, "inagh-kilnamona", "recovery", NOW + 20);
    expect(campaign.preseasonWeek).toBe(2);
    expect(waitingOnWeek(campaign).map((seat) => seat.clubId).sort()).toEqual(["ballyea", "inagh-kilnamona"]);
  });

  it("fills missing week actions when the host window expires", () => {
    let campaign = startedCampaign();
    campaign = trainClub(campaign, "ballyea", "skills", NOW + 10);
    campaign = tickCampaign(campaign, NOW + 25 * 60 * 60 * 1000);
    expect(campaign.preseasonWeek).toBe(2);
    expect(campaign.clubs["inagh-kilnamona"].trainingDue).toBe(true);
  });

  it("waits on both humans before a first half can be watched, then waits on both second-half plans", () => {
    let campaign = throughPreseason();
    campaign = readyClub(campaign, "ballyea", NOW + 100);
    expect(campaign.week.locked).toBe(false);
    campaign = readyClub(campaign, "inagh-kilnamona", NOW + 101);
    expect(campaign.week.locked).toBe(true);
    const live = liveForClub(campaign, "ballyea");
    expect(live).toBeTruthy();
    expect(live?.first.events.some((event) => event.kind === "half")).toBe(true);
    const championship = championshipOf(campaign);
    const played = championship.matches.find((match) => match.id === live?.matchId);
    expect(played && matchPlayed(played)).toBe(false);
    expect(waitingOnSecondHalf(campaign, live!.matchId)).toHaveLength(2);

    campaign = submitSecondHalf(campaign, "ballyea", live!.matchId, DEFAULT_TACTICS, defaultSheet("ballyea"), NOW + 102);
    expect(waitingOnSecondHalf(campaign, live!.matchId).map((seat) => seat.clubId)).toEqual(["inagh-kilnamona"]);
    expect(championshipOf(campaign).matches.find((match) => match.id === live!.matchId && matchPlayed(match))).toBeUndefined();

    campaign = submitSecondHalf(campaign, "inagh-kilnamona", live!.matchId, DEFAULT_TACTICS, defaultSheet("inagh-kilnamona"), NOW + 103);
    const finished = championshipOf(campaign).matches.find((match) => match.id === live!.matchId);
    expect(finished && matchPlayed(finished)).toBe(true);
    expect(liveForClub(campaign, "ballyea")?.combined?.events.some((event) => event.kind === "full")).toBe(true);

    const inbox = campaign.clubs.ballyea.inbox;
    expect(inbox.some((item) => item.kind === "match" && item.matchId === live!.matchId)).toBe(true);
    expect(inbox.some((item) => item.kind === "press" && item.matchId === live!.matchId)).toBe(true);
    expect(inbox.some((item) => item.title.startsWith("Elsewhere:"))).toBe(true);
    expect(campaign.clubs.ballyea.trainingDue).toBe(true);
    const injured = Object.values(campaign.clubs.ballyea.condition).some((row) => isInjured(row));
    if (injured) {
      expect(inbox.some((item) => item.kind === "injury")).toBe(true);
    }
  });

  it("lets the host force the rest of a human match after half-time", () => {
    let campaign = throughPreseason();
    campaign = readyClub(readyClub(campaign, "ballyea", NOW + 200), "inagh-kilnamona", NOW + 201);
    const matchId = liveForClub(campaign, "ballyea")!.matchId;
    campaign = submitSecondHalf(campaign, "ballyea", matchId, DEFAULT_TACTICS, defaultSheet("ballyea"), NOW + 202);
    campaign = forceAdvance(campaign, "host", NOW + 203);
    const finished = championshipOf(campaign).matches.find((match) => match.id === matchId);
    expect(finished && matchPlayed(finished)).toBe(true);
  });

  it("ticks training injuries off and writes a recovery note", () => {
    let campaign = startedCampaign();
    const name = campaign.clubs.ballyea.sheet.starters[0]!;
    campaign = {
      ...campaign,
      clubs: {
        ...campaign.clubs,
        ballyea: {
          ...campaign.clubs.ballyea,
          condition: applyInjury(campaign.clubs.ballyea.condition, name, {
            weeksLeft: 1,
            durationWeeks: 1,
            ailment: "corked thigh",
            source: "match",
          }),
        },
      },
    };
    campaign = trainClub(campaign, "ballyea", "skills", NOW + 10);
    expect(campaign.clubs.ballyea.inbox.some((item) => item.kind === "recovery" && item.playerName === name)).toBe(true);
    expect(isInjured(campaign.clubs.ballyea.condition[name])).toBe(false);
  });

  it("puts a chairman welcome in each seat's inbox when the championship starts", () => {
    const campaign = startedCampaign();
    expect(campaign.clubs.ballyea.inbox.some((item) => item.kind === "chairman")).toBe(true);
    expect(campaign.clubs["inagh-kilnamona"].inbox.some((item) => item.kind === "chairman")).toBe(true);
    expect(campaign.clubs.ballyea.inbox.find((item) => item.kind === "chairman")?.id).not.toBe(
      campaign.clubs["inagh-kilnamona"].inbox.find((item) => item.kind === "chairman")?.id,
    );
  });
});
