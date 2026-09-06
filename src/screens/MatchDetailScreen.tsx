import type { Championship, GameSave, Match, MatchReport } from "../types";
import { MatchStatsPanel } from "../components/MatchStatsPanel";
import { ClubBadge } from "../components/ClubBadge";
import { aggressionLabel, buildLabel, pressureLabel, puckoutLabel } from "../lib/attributes";
import { compactName, sideLabel } from "../lib/display";
import { clubTactics, ratedSquad } from "../lib/players";
import { resolveMatchSides, teamById } from "../lib/resolve";
import { formatDate, formatScore, matchPlayed, stageLabel } from "../lib/scoring";
import { shootingLabel } from "../lib/shooting";
import { climateSummary } from "../lib/weather";
import { ShotMap } from "../components/ShotMap";

type Props = {
  championship: Championship;
  save: GameSave;
  match: Match;
  report: MatchReport | null;
  onBack: () => void;
  onOpenTeam: (teamId: string) => void;
};

function TacticSummary({
  mentality,
  build,
  puckout,
  aggression,
  pressure,
  shooting,
  shape,
}: ReturnType<typeof clubTactics>) {
  return (
    <p>
      {mentality} · {buildLabel(build)} · {puckoutLabel(puckout)} · {aggressionLabel(aggression)} ·{" "}
      {pressureLabel(pressure)} · {shootingLabel(shooting ?? 50)} · {shape === "sweeper" ? "sweeper" : "6-2-6"}
    </p>
  );
}

export function MatchDetailScreen({ championship, save, match, report, onBack, onOpenTeam }: Props) {
  const { homeId, awayId } = resolveMatchSides(championship, match);
  const home = homeId ? teamById(championship, homeId) : undefined;
  const away = awayId ? teamById(championship, awayId) : undefined;
  const homeTactics = report?.homeTactics ?? (homeId === save.clubId ? save.tactics : homeId ? clubTactics(homeId) : save.tactics);
  const awayTactics = report?.awayTactics ?? (awayId === save.clubId ? save.tactics : awayId ? clubTactics(awayId) : save.tactics);
  const played = matchPlayed(match) && match.homeScore && match.awayScore;

  return (
    <div className="screen">
      <button type="button" className="text-btn" onClick={onBack}>
        Back to fixtures
      </button>
      <p className="kicker">
        {stageLabel(match.stage, match.round)} · {formatDate(match.date)}
        {match.venue ? ` · ${match.venue}` : ""}
      </p>
      <h2>
        {home ? compactName(home) : sideLabel(championship, match.home)}
        {played ? ` ${formatScore(match.homeScore!)} ${formatScore(match.awayScore!)} ` : " v "}
        {away ? compactName(away) : sideLabel(championship, match.away)}
      </h2>
      <div className="row-actions">
        {homeId ? (
          <button type="button" className="btn btn--ghost" onClick={() => onOpenTeam(homeId)}>
            {home ? <ClubBadge team={home} size="sm" variant="crest" /> : null}
            {home ? compactName(home) : "Home"} squad
          </button>
        ) : null}
        {awayId ? (
          <button type="button" className="btn btn--ghost" onClick={() => onOpenTeam(awayId)}>
            {away ? <ClubBadge team={away} size="sm" variant="crest" /> : null}
            {away ? compactName(away) : "Away"} squad
          </button>
        ) : null}
      </div>
      <section className="card">
        <h3>Tactics</h3>
        <p className="kicker">{home ? compactName(home) : "Home"}</p>
        <TacticSummary {...homeTactics} />
        <p className="kicker">{away ? compactName(away) : "Away"}</p>
        <TacticSummary {...awayTactics} />
      </section>
      {report ? (
        <>
          {report.climate ? (
            <section className="card">
              <h3>Conditions</h3>
              <p className="tactic-copy">{climateSummary(report.climate)}</p>
            </section>
          ) : null}
          {report.shots && report.shots.length > 0 ? (
            <ShotMap
              shots={report.shots}
              home={home}
              away={away}
              homeId={homeId ?? ""}
              awayId={awayId ?? ""}
              climate={report.climate}
            />
          ) : null}
          <section className="card">
            <h3>Match stats</h3>
            <MatchStatsPanel
              homeName={home ? compactName(home) : "Home"}
              awayName={away ? compactName(away) : "Away"}
              homeId={homeId ?? ""}
              awayId={awayId ?? ""}
              homeStats={report.homeStats}
              awayStats={report.awayStats}
              players={report.players}
              homeSquad={homeId ? ratedSquad(homeId) : []}
              awaySquad={awayId ? ratedSquad(awayId) : []}
              homeSheet={report.homeSheet}
              awaySheet={report.awaySheet}
              homeCondition={homeId === save.clubId ? save.condition : undefined}
              awayCondition={awayId === save.clubId ? save.condition : undefined}
            />
          </section>
          <section className="card">
            <h3>Coach report</h3>
            {report.coachReport.map((note) => (
              <p key={note} className="tactic-copy">
                {note}
              </p>
            ))}
          </section>
        </>
      ) : (
        <section className="card">
          <h3>{played ? "No chart" : "Preview"}</h3>
          <p className="tactic-copy">
            {played
              ? "This tie was played before match charts were kept. New championship days will store full stats."
              : `Not played yet. ${homeId === save.clubId || awayId === save.clubId ? "Your current fifteen and dials are listed above." : `${home ? compactName(home) : "Home"} are likely to set up as shown; tap through to scout the panel.`}`}
          </p>
        </section>
      )}
    </div>
  );
}
