import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { formatScore, scoreTotal } from "./lib/scoring";
import { resolveTeamId } from "./lib/resolve";
import { computeStats, groupStandings, rankTeams } from "./lib/standings";

describe("hurling scoring", () => {
  it("counts a goal as three points", () => {
    expect(scoreTotal({ goals: 2, points: 15 })).toBe(21);
    expect(formatScore({ goals: 0, points: 9 })).toBe("0-9");
  });
});

describe("2026 Clare SHC group tables", () => {
  function groupRows(groupId: "1" | "2" | "3" | "4") {
    const group = seedChampionship.groups.find((item) => item.id === groupId)!;
    const matches = seedChampionship.matches.filter(
      (match) => match.stage === "group" && match.groupId === groupId,
    );
    return groupStandings(group.teamIds, matches, true);
  }

  it("places Inagh-Kilnamona and Clonlara as Group 1 qualifiers", () => {
    const rows = groupRows("1");
    expect(rows.map((row) => row.teamId)).toEqual([
      "inagh-kilnamona",
      "clonlara",
      "ballyea",
      "st-josephs",
    ]);
    expect(rows[0]).toMatchObject({ played: 3, points: 5, scored: 74, conceded: 51 });
    expect(rows[1]).toMatchObject({ played: 3, points: 4, scored: 62, conceded: 58 });
    expect(rows[0].status).toBe("quarter-final");
    expect(rows[3].status).toBe("relegation");
  });

  it("separates Group 2 on head-to-head score difference", () => {
    const rows = groupRows("2");
    expect(rows.map((row) => row.teamId)).toEqual([
      "eire-og",
      "scariff",
      "broadford",
      "crusheen",
    ]);
    expect(rows[0].points).toBe(6);
    expect(rows[1].points).toBe(2);
    expect(rows[2].points).toBe(2);
    expect(rows[3].points).toBe(2);
  });

  it("places Clooney-Quin and Cratloe as Group 3 qualifiers", () => {
    const rows = groupRows("3");
    expect(rows.map((row) => row.teamId)).toEqual([
      "clooney-quin",
      "cratloe",
      "feakle",
      "ocallaghans-mills",
    ]);
    expect(rows[0]).toMatchObject({ points: 5, difference: 28 });
    expect(rows[1]).toMatchObject({ points: 4, difference: 1 });
  });

  it("uses scores-for among Group 4's three-way tie", () => {
    const rows = groupRows("4");
    expect(rows.map((row) => row.teamId)).toEqual([
      "kilmaley",
      "wolfe-tones",
      "sixmilebridge",
      "newmarket",
    ]);
    expect(rows[0].points).toBe(6);

    const tied = ["wolfe-tones", "sixmilebridge", "newmarket"];
    const matches = seedChampionship.matches.filter(
      (match) => match.stage === "group" && match.groupId === "4",
    );
    const mini = computeStats(tied, matches);
    expect(mini.get("wolfe-tones")?.scored).toBe(50);
    expect(mini.get("sixmilebridge")?.scored).toBe(49);
    expect(mini.get("newmarket")?.scored).toBe(47);
    expect(rankTeams(tied, matches)).toEqual(tied);
  });
});

describe("2026 knockout draw from group positions", () => {
  it("resolves the published quarter-final pairings", () => {
    const pairings = [
      ["qf-1", "eire-og", "wolfe-tones"],
      ["qf-2", "clooney-quin", "scariff"],
      ["qf-3", "inagh-kilnamona", "cratloe"],
      ["qf-4", "kilmaley", "clonlara"],
    ] as const;

    for (const [id, home, away] of pairings) {
      const match = seedChampionship.matches.find((item) => item.id === id)!;
      expect(resolveTeamId(seedChampionship, match.home)).toBe(home);
      expect(resolveTeamId(seedChampionship, match.away)).toBe(away);
    }
  });

  it("resolves the relegation semi-final pairings", () => {
    const rel1 = seedChampionship.matches.find((item) => item.id === "rel-sf-1")!;
    const rel2 = seedChampionship.matches.find((item) => item.id === "rel-sf-2")!;
    expect(resolveTeamId(seedChampionship, rel1.home)).toBe("ocallaghans-mills");
    expect(resolveTeamId(seedChampionship, rel1.away)).toBe("crusheen");
    expect(resolveTeamId(seedChampionship, rel2.home)).toBe("st-josephs");
    expect(resolveTeamId(seedChampionship, rel2.away)).toBe("newmarket");
  });
});
