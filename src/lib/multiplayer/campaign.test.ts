import { describe, expect, it } from "vitest";
import { applyInjury, isInjured } from "../injuries";
import { matchPlayed } from "../scoring";
import { DEFAULT_TACTICS, defaultSheet } from "../players";
import { PRESEASON_WEEKS } from "../training";
import {
  addSeat,
  championshipOf,
  clubInSeason,
  clubPreseasonWeek,
  createCampaign,
  forceAdvance,
  liveForClub,
  nextMatchForClub,
  preMatchTacticsLocked,
  readyClub,
  startCampaign,
  submitSecondHalf,
  tickCampaign,
  trainClub,
  trainClubWeek,
  waitingOnSecondHalf,
  waitingOnClub,
  withClubTactics,
} from "./campaign";
import { mergeCampaigns } from "./merge";

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
  const sessions = clubInSeason(next, clubId) ? 1 : 3;
  for (let index = 0; index < sessions; index += 1) {
    next = trainClub(next, clubId, session, now + index);
  }
  return next;
}

function throughPreseason(campaign = startedCampaign()) {
  let next = campaign;
  for (let week = 1; week <= PRESEASON_WEEKS; week += 1) {
    const hostClub = next.seats[0]!.clubId;
    const guestClub = next.seats[1]!.clubId;
    next = trainFullWeek(next, hostClub, "skills", NOW + week * 10);
    expect(clubPreseasonWeek(next, hostClub)).toBe(week + 1);
    next = trainFullWeek(next, guestClub, "fitness", NOW + week * 10 + 3);
    expect(clubPreseasonWeek(next, guestClub)).toBe(week + 1);
  }
  expect(next.phase).toBe("season");
  expect(clubInSeason(next, next.seats[0]!.clubId)).toBe(true);
  return next;
}

function splitGroupCampaign() {
  const campaign = createCampaign({
    hostPlayerId: "host",
    hostName: "Rory",
    clubId: "ballyea",
    waitHours: 24,
    now: NOW,
    seed: 42,
    code: "SPLIT1",
  });
  const joined = addSeat(campaign, { playerId: "guest", name: "Siobhan", clubId: "eire-og" });
  expect(joined.ok).toBe(true);
  if (!joined.ok) throw new Error(joined.error);
  const started = startCampaign(joined.campaign, "host", NOW);
  expect(started.ok).toBe(true);
  if (!started.ok) throw new Error(started.error);
  return started.campaign;
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

  it("stores the host's difficulty on a new championship", () => {
    const junior = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 24,
      now: NOW,
      seed: 42,
      code: "JUNIOR",
      difficulty: "junior",
    });
    expect(junior.difficulty).toBe("junior");
    expect(twoPlayerLobby().difficulty).toBe("intermediate");
  });

  it("stores the host's panel mode on a new championship", () => {
    const balanced = createCampaign({
      hostPlayerId: "host",
      hostName: "Rory",
      clubId: "ballyea",
      waitHours: 24,
      now: NOW,
      seed: 42,
      code: "EVEN01",
      balance: "balanced",
    });
    expect(balanced.balance).toBe("balanced");
    expect(twoPlayerLobby().balance).toBe("standard");
  });

  it("lets each manager run preseason weeks without waiting on the other", () => {
    let campaign = startedCampaign();
    campaign = trainClub(campaign, "ballyea", "skills", NOW + 10);
    expect(clubPreseasonWeek(campaign, "ballyea")).toBe(1);
    expect(campaign.clubs.ballyea.sessionsDone).toBe(1);
    expect(waitingOnClub(campaign, "ballyea")).toEqual([]);
    campaign = trainFullWeek(campaign, "ballyea", "skills", NOW + 11);
    expect(clubPreseasonWeek(campaign, "ballyea")).toBe(2);
    expect(clubPreseasonWeek(campaign, "inagh-kilnamona")).toBe(1);
    expect(waitingOnClub(campaign, "inagh-kilnamona")).toEqual([]);
    campaign = trainFullWeek(campaign, "inagh-kilnamona", "recovery", NOW + 20);
    expect(clubPreseasonWeek(campaign, "inagh-kilnamona")).toBe(2);
    expect(clubPreseasonWeek(campaign, "ballyea")).toBe(2);
  });

  it("lets a manager run a two-session-plus-challenge week in one action", () => {
    let campaign = startedCampaign();
    campaign = trainClubWeek(campaign, "ballyea", "challenge", NOW + 30);
    expect(campaign.clubs.ballyea.trainingDue).toBe(true);
    expect(campaign.clubs.ballyea.sessionsDone).toBe(0);
    expect(campaign.clubs.ballyea.weekShape).toBe("challenge");
    expect(clubPreseasonWeek(campaign, "ballyea")).toBe(2);
    expect(clubPreseasonWeek(campaign, "inagh-kilnamona")).toBe(1);
    expect(campaign.clubs.ballyea.inbox.some((item) => item.title.includes("complete"))).toBe(true);
  });

  it("does not auto-advance the other manager's preseason when the wait window expires", () => {
    let campaign = startedCampaign();
    campaign = trainClub(campaign, "ballyea", "skills", NOW + 10);
    campaign = tickCampaign(campaign, NOW + 25 * 60 * 60 * 1000);
    expect(clubPreseasonWeek(campaign, "ballyea")).toBe(1);
    expect(clubPreseasonWeek(campaign, "inagh-kilnamona")).toBe(1);
    expect(campaign.clubs["inagh-kilnamona"].trainingDue).toBe(true);
  });

  it("does not let a joining copy push the host's preseason week forward", () => {
    const base = startedCampaign();
    const hostCopy = trainFullWeek(base, "ballyea", "skills", NOW + 10);
    const guestTick = tickCampaign(base, NOW + 25 * 60 * 60 * 1000);
    const merged = mergeCampaigns(hostCopy, guestTick);
    expect(clubPreseasonWeek(merged, "ballyea")).toBe(2);
    expect(clubPreseasonWeek(merged, "inagh-kilnamona")).toBe(1);
  });

  it("lets a manager play a computer tie without waiting on the other human", () => {
    let campaign = throughPreseason(splitGroupCampaign());
    campaign = readyClub(campaign, "ballyea", NOW + 100);
    expect(liveForClub(campaign, "ballyea")).toBeTruthy();
    expect(liveForClub(campaign, "eire-og")).toBeUndefined();
    expect(campaign.week.ready["eire-og"]).toBeFalsy();
    const championship = championshipOf(campaign);
    const ballyeaMatch = championship.matches.find((match) => match.id === liveForClub(campaign, "ballyea")?.matchId);
    expect(ballyeaMatch && !matchPlayed(ballyeaMatch)).toBe(true);
  });

  it("locks first-half tactics after a manager confirms a human match", () => {
    let campaign = throughPreseason();
    const mentality = campaign.clubs.ballyea.tactics.mentality;
    campaign = readyClub(campaign, "ballyea", NOW + 100);
    expect(preMatchTacticsLocked(campaign, "ballyea")).toBe(true);
    campaign = withClubTactics(campaign, "ballyea", { ...campaign.clubs.ballyea.tactics, mentality: "attacking" });
    expect(campaign.clubs.ballyea.tactics.mentality).toBe(mentality);
    campaign = readyClub(campaign, "inagh-kilnamona", NOW + 101);
    expect(liveForClub(campaign, "ballyea")).toBeTruthy();
    expect(preMatchTacticsLocked(campaign, "ballyea")).toBe(false);
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
    expect(campaign.week.lives[live!.matchId]?.combined?.events.some((event) => event.kind === "full")).toBe(true);
    expect(liveForClub(campaign, "ballyea")).toBeUndefined();
    expect(liveForClub(campaign, "inagh-kilnamona")).toBeUndefined();

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

  it("lets both managers confirm the next championship day after a finished tie", () => {
    let campaign = throughPreseason();
    campaign = readyClub(readyClub(campaign, "ballyea", NOW + 100), "inagh-kilnamona", NOW + 101);
    const firstId = liveForClub(campaign, "ballyea")!.matchId;
    campaign = submitSecondHalf(campaign, "ballyea", firstId, DEFAULT_TACTICS, defaultSheet("ballyea"), NOW + 102);
    campaign = submitSecondHalf(campaign, "inagh-kilnamona", firstId, DEFAULT_TACTICS, defaultSheet("inagh-kilnamona"), NOW + 103);
    expect(liveForClub(campaign, "ballyea")).toBeUndefined();
    const nextHost = nextMatchForClub(campaign, "ballyea");
    const nextGuest = nextMatchForClub(campaign, "inagh-kilnamona");
    expect(nextHost?.id).not.toBe(firstId);
    expect(nextGuest?.id).not.toBe(firstId);
    const hostReady = readyClub(campaign, "ballyea", NOW + 200);
    expect(hostReady.week.ready.ballyea).toBeTruthy();
    expect(hostReady.revision).toBeGreaterThan(campaign.revision);
    const guestReady = readyClub(hostReady, "inagh-kilnamona", NOW + 201);
    expect(guestReady.week.ready["inagh-kilnamona"]).toBeTruthy();
    const nextLive = liveForClub(guestReady, "ballyea") ?? liveForClub(guestReady, "inagh-kilnamona");
    if (nextHost?.id === nextGuest?.id) {
      expect(nextLive?.matchId).toBe(nextHost?.id);
      expect(nextLive?.combined).toBeFalsy();
    }
  });

  it("lets a manager confirm the next day after finishing a computer tie", () => {
    let campaign = throughPreseason(splitGroupCampaign());
    campaign = readyClub(campaign, "ballyea", NOW + 100);
    const first = liveForClub(campaign, "ballyea");
    expect(first).toBeTruthy();
    campaign = submitSecondHalf(campaign, "ballyea", first!.matchId, DEFAULT_TACTICS, defaultSheet("ballyea"), NOW + 101);
    expect(liveForClub(campaign, "ballyea")).toBeUndefined();
    const next = nextMatchForClub(campaign, "ballyea");
    expect(next?.id).not.toBe(first!.matchId);
    campaign = readyClub(campaign, "ballyea", NOW + 102);
    expect(liveForClub(campaign, "ballyea")?.matchId).toBe(next?.id);
    expect(liveForClub(campaign, "ballyea")?.combined).toBeFalsy();
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

  it("starts a human match when the wait window expires after one manager has confirmed", () => {
    let campaign = throughPreseason();
    campaign = readyClub(campaign, "ballyea", NOW + 300);
    expect(liveForClub(campaign, "ballyea")).toBeUndefined();
    campaign = tickCampaign(campaign, NOW + 300 + 25 * 60 * 60 * 1000);
    expect(liveForClub(campaign, "ballyea")).toBeTruthy();
    expect(campaign.week.ready["inagh-kilnamona"]).toBeTruthy();
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

  it("runs computer clubs through preseason when the championship starts", () => {
    const campaign = startedCampaign();
    expect(Object.keys(campaign.clubs).length).toBe(16);
    expect(campaign.clubs.clonlara.tactics).not.toEqual(DEFAULT_TACTICS);
    const cpu = campaign.clubs.clonlara;
    expect(cpu).toBeTruthy();
    const moved = Object.values(cpu.condition).some(
      (row) => (row.sharpness ?? 0) > 38 || (row.fatigue ?? 0) > 0 || Boolean(row.boosts && Object.keys(row.boosts).length),
    );
    expect(moved).toBe(true);
  });
});
