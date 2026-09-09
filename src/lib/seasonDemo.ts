import type { SeasonWrap } from "../types";
import { simulateChampionship } from "./championshipSim";
import { newSave, persistSave } from "./gameStorage";

export function installFinaleDemo(demo: string): void {
  const { championId, championship } = simulateChampionship({ seed: 2026 });
  const clubId =
    demo === "finale-loss"
      ? championId === "ballyea"
        ? "eire-og"
        : "ballyea"
      : (championId ?? "ballyea");
  const wrap: SeasonWrap | undefined =
    demo === "finale-offer" ? "offer" : demo === "finale-done" ? "done" : undefined;
  persistSave({
    ...newSave(clubId),
    phase: "season",
    trainingDue: false,
    seasonWrap: wrap,
    matches: championship.matches.map((match) => ({
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
    extraMatches: championship.matches.filter((match) => Boolean(match.replayOf)),
  });
}
