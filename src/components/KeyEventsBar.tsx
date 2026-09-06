import type { MatchEvent, MatchEventKind, Team } from "../types";
import { compactName, teamAccent } from "../lib/display";
import { isCardKind, isScoreKind } from "../lib/matchEngine";

type Props = {
  events: MatchEvent[];
  homeId?: string | null;
  awayId?: string | null;
  home?: Team;
  away?: Team;
};

function lastName(name: string): string {
  const parts = name.trim().split(" ");
  return parts.at(-1) || name;
}

function groupGoals(events: MatchEvent[], teamId: string): string {
  const goals = events.filter((event) => event.kind === "goal" && event.teamId === teamId && event.playerName);
  if (goals.length === 0) return "—";
  const byPlayer = new Map<string, number[]>();
  for (const event of goals) {
    const list = byPlayer.get(event.playerName) ?? [];
    list.push(event.minute);
    byPlayer.set(event.playerName, list);
  }
  return [...byPlayer.entries()]
    .map(([name, minutes]) => `${lastName(name)} ${minutes.map((minute) => `${minute}'`).join(", ")}`)
    .join(" · ");
}

function groupPoints(events: MatchEvent[], teamId: string): string {
  const points = events.filter(
    (event) => isScoreKind(event.kind) && event.kind !== "goal" && event.teamId === teamId && event.playerName,
  );
  if (points.length === 0) return "—";
  const byPlayer = new Map<string, number>();
  for (const event of points) {
    byPlayer.set(event.playerName, (byPlayer.get(event.playerName) ?? 0) + 1);
  }
  const ranked = [...byPlayer.entries()].sort((a, b) => b[1] - a[1]);
  const shown = ranked.slice(0, 5).map(([name, count]) => `${lastName(name)} ${count}`);
  const rest = ranked.slice(5).reduce((sum, [, count]) => sum + count, 0);
  if (rest > 0) shown.push(`+${rest}`);
  return shown.join(" · ");
}

function cardBits(events: MatchEvent[]): { text: string; kind: MatchEventKind }[] {
  return events
    .filter((event) => isCardKind(event.kind) && event.playerName)
    .map((event) => ({
      kind: event.kind,
      text: `${event.kind === "red" ? "R" : "Y"} ${lastName(event.playerName)} ${event.minute}'`,
    }));
}

export function KeyEventsBar({ events, homeId, awayId, home, away }: Props) {
  const homeAccent = teamAccent(home);
  const awayAccent = teamAccent(away);
  const cards = cardBits(events);
  return (
    <section className="key-events" aria-label="Key events">
      <div className="key-events__grid">
        <article className="key-events__side" style={{ borderColor: homeAccent.stripe, color: homeAccent.ink }}>
          <strong>{home ? compactName(home) : "Home"}</strong>
          <p>
            <span>Goals</span> {homeId ? groupGoals(events, homeId) : "—"}
          </p>
          <p>
            <span>Points</span> {homeId ? groupPoints(events, homeId) : "—"}
          </p>
        </article>
        <article className="key-events__side" style={{ borderColor: awayAccent.stripe, color: awayAccent.ink }}>
          <strong>{away ? compactName(away) : "Away"}</strong>
          <p>
            <span>Goals</span> {awayId ? groupGoals(events, awayId) : "—"}
          </p>
          <p>
            <span>Points</span> {awayId ? groupPoints(events, awayId) : "—"}
          </p>
        </article>
      </div>
      <p className="key-events__cards">
        <span>Cards</span>{" "}
        {cards.length === 0
          ? "None yet"
          : cards.map((card, index) => (
              <em key={`${card.text}-${index}`} className={card.kind === "red" ? "is-red" : "is-yellow"}>
                {card.text}
                {index < cards.length - 1 ? " · " : ""}
              </em>
            ))}
      </p>
    </section>
  );
}
