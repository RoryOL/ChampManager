import { useState } from "react";
import type { Campaign, Championship, GameSave, Match, MatchPrep, NewsItem, Seat, WeekShape } from "../types";
import { CampaignWeekCard } from "../components/CampaignWeekCard";
import { ClubBadge } from "../components/ClubBadge";
import { NewsKindIcon } from "../components/NewsKindIcon";
import { WeekShapePicker } from "../components/WeekShapePicker";
import { compactName, sideLabel } from "../lib/display";
import { NEWS_KIND_LABEL } from "../lib/news";
import { resolveMatchSides, teamById, teamGroup } from "../lib/resolve";
import { formatDate, stageLabel } from "../lib/scoring";
import { buildPreMatchBriefing } from "../lib/briefing";
import { averageFitness, averageMatchOverall, DEFAULT_WEEK_SHAPE, MATCH_PREP_OPTIONS, matchPrepTitle, MIN_MATCH_FITNESS, PRESEASON_WEEKS } from "../lib/training";
import { ratedSquad, sideTeamwork } from "../lib/players";
import { rollClimate, climateSummary } from "../lib/weather";

type Props = {
  championship: Championship;
  save: GameSave;
  nextMatch: Match | null;
  batchLabel: string | null;
  campaign?: Campaign | null;
  playerId?: string;
  localSeats?: Seat[];
  roomStatus?: "offline" | "connecting" | "live";
  onGoToMatch: () => void;
  onSkip: () => void;
  onResign: () => void;
  onReady?: () => void;
  onUnready?: () => void;
  onForce?: () => void;
  onPass?: (playerId: string) => void;
  onReadNews: (id: string) => void;
  onOpenMatch: (matchId: string) => void;
  onOpenPlayer: (name: string) => void;
  onOpenTeam?: (teamId: string) => void;
  onOpenTraining?: () => void;
  onSetWeekShape?: (shape: WeekShape) => void;
  onRunWeek?: (shape: WeekShape) => void;
  onMatchPrep?: (prep: MatchPrep) => void;
  finaleStep?: "ceremony" | "offer" | "done" | null;
  championId?: string | null;
  onStartNewSeason?: () => void;
};

function preview(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > 110 ? `${text.slice(0, 107)}…` : text;
}

function NewsArticle({
  item,
  onBack,
  onOpenMatch,
  onOpenPlayer,
}: {
  item: NewsItem;
  onBack: () => void;
  onOpenMatch: (matchId: string) => void;
  onOpenPlayer: (name: string) => void;
}) {
  return (
    <article className={`news-article news-article--${item.tone ?? "neutral"}`}>
      <button type="button" className="text-btn text-btn--back" onClick={onBack}>
        Back to news
      </button>
      <p className="kicker kicker--news">
        <NewsKindIcon kind={item.kind} />
        {item.source || NEWS_KIND_LABEL[item.kind]}
        {item.date ? ` · ${formatDate(item.date)}` : ""}
      </p>
      <h2>{item.title}</h2>
      <p className="news-article__body">{item.body}</p>
      <div className="row-actions">
        {item.matchId ? (
          <button type="button" className="btn" onClick={() => onOpenMatch(item.matchId!)}>
            Open match
          </button>
        ) : null}
        {item.playerName ? (
          <button type="button" className="btn btn--ghost" onClick={() => onOpenPlayer(item.playerName!)}>
            Open {item.playerName.split(" ").at(-1)}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function HomeScreen({
  championship,
  save,
  nextMatch,
  batchLabel,
  campaign,
  playerId,
  localSeats = [],
  roomStatus,
  onGoToMatch,
  onSkip,
  onResign,
  onReady,
  onUnready,
  onForce,
  onPass,
  onReadNews,
  onOpenMatch,
  onOpenPlayer,
  onOpenTeam,
  onOpenTraining,
  onSetWeekShape,
  onRunWeek,
  onMatchPrep,
  finaleStep,
  championId,
  onStartNewSeason,
}: Props) {
  const club = teamById(championship, save.clubId);
  const champion = championId ? teamById(championship, championId) : undefined;
  const group = teamGroup(championship, save.clubId);
  const sides = nextMatch ? resolveMatchSides(championship, nextMatch) : null;
  const opponentId =
    sides && (sides.homeId === save.clubId ? sides.awayId : sides.awayId === save.clubId ? sides.homeId : null);
  const opponent = opponentId ? teamById(championship, opponentId) : undefined;
  const [openId, setOpenId] = useState<string | null>(null);
  const squad = ratedSquad(save.clubId, save);
  const names = squad.map((player) => player.name);
  const fitness = averageFitness(save.condition, names);
  const teamwork = sideTeamwork(save.clubId, save.sheet, save.condition, save, squad);
  const form = averageMatchOverall(squad, save.condition, save.sheet.starters);
  const preseason = save.phase === "preseason";
  const formDelta = Math.round((form.match - form.ability) * 10) / 10;
  const opened = save.inbox.find((item) => item.id === openId) ?? null;
  const unread = save.inbox.filter((item) => !item.read).length;
  const weekShape = save.weekShape ?? DEFAULT_WEEK_SHAPE;

  const openNews = (item: NewsItem) => {
    setOpenId(item.id);
    if (!item.read) onReadNews(item.id);
  };

  if (opened) {
    return (
      <div className="screen">
        <NewsArticle
          item={opened}
          onBack={() => setOpenId(null)}
          onOpenMatch={onOpenMatch}
          onOpenPlayer={onOpenPlayer}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <section className="club-banner">
        <span
          className="colour-sash"
          style={
            club
              ? { background: `linear-gradient(180deg, ${club.colours.primary} 50%, ${club.colours.secondary} 50%)` }
              : undefined
          }
        />
        <ClubBadge team={club} size="lg" variant="crest" />
        <div>
          <p>{group?.name}</p>
          <h1>{club ? compactName(club) : "Club"}</h1>
          {club ? <span className="colour-label">{club.colours.label}</span> : null}
        </div>
        <button type="button" className="text-btn" onClick={onResign}>
          {campaign ? "Leave" : "Resign"}
        </button>
      </section>

      {finaleStep === "done" && champion && onStartNewSeason ? (
        <section className="card card--compact">
          <p className="kicker">End of season</p>
          <h3>
            {compactName(champion)} have the {championship.trophy}
          </h3>
          <p className="hint hint--tight">
            {champion.id === save.clubId
              ? "The Canon is in the cabinet. Start a new Clare SHC when you are ready."
              : "The championship is over. Start a new season, or stay and read the news."}
          </p>
          <div className="row-actions">
            <button type="button" className="btn" onClick={onStartNewSeason}>
              {campaign ? "Leave championship" : "Start a new season"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="card card--compact">
        <p className="kicker">{preseason ? `Preseason · week ${Math.min(save.preseasonWeek, PRESEASON_WEEKS)} of ${PRESEASON_WEEKS}` : "Condition"}</p>
        <div className="condition-stats">
          <div className="attr-row">
            <span>Fitness</span>
            <div className="attr-bar">
              <i className={fitness <= MIN_MATCH_FITNESS ? "is-warn" : ""} style={{ width: `${fitness}%` }} />
            </div>
            <em>{fitness}</em>
          </div>
          <div className="attr-row">
            <span>Teamwork</span>
            <div className="attr-bar">
              <i style={{ width: `${Math.min(100, (teamwork / 20) * 100)}%` }} />
            </div>
            <em>{teamwork}</em>
          </div>
        </div>
        <p className="xv-form">
          Championship XV match rating {form.match}
          {formDelta !== 0 ? ` (${formDelta > 0 ? "+" : ""}${formDelta})` : ""} · ability {form.ability}
        </p>
        {save.trainingDue && !preseason ? (
          <p className="hint hint--tight">
            The panel have their legs back. Work one aspect for the next day, or go straight to the match.
          </p>
        ) : save.nextMatchPrep && !preseason ? (
          <p className="hint hint--tight">{matchPrepTitle(save.nextMatchPrep)} is in for championship day.</p>
        ) : campaign && preseason && !save.trainingDue ? (
          <p className="tactic-copy">Your week is in. Waiting on the other managers before it turns.</p>
        ) : null}
        {!preseason && nextMatch && sides && !(campaign && !campaign.week.locked) ? (
          <div className="row-actions">
            <button type="button" className="btn" onClick={onGoToMatch}>
              {campaign
                ? "Watch first half"
                : `${sideLabel(championship, nextMatch.home)} v ${sideLabel(championship, nextMatch.away)}`}
            </button>
            {campaign ? null : (
              <button type="button" className="btn btn--ghost" onClick={onSkip}>
                Instant result
              </button>
            )}
            {opponent && onOpenTeam ? (
              <button type="button" className="btn btn--ghost" onClick={() => onOpenTeam(opponent.id)}>
                Open {compactName(opponent)} squad
              </button>
            ) : null}
          </div>
        ) : !preseason && nextMatch && opponent && onOpenTeam ? (
          <div className="row-actions">
            <button type="button" className="btn btn--ghost" onClick={() => onOpenTeam(opponent.id)}>
              Open {compactName(opponent)} squad
            </button>
          </div>
        ) : null}
        {!preseason && !nextMatch && batchLabel && !campaign ? (
          <div className="row-actions">
            <button type="button" className="btn" onClick={onSkip}>
              Simulate {batchLabel}
            </button>
          </div>
        ) : null}
        {!preseason && nextMatch ? (
          <p className="hint hint--tight">
            {stageLabel(nextMatch.stage, nextMatch.round)} · {formatDate(nextMatch.date)}
            {nextMatch.venue ? ` · ${nextMatch.venue}` : ""} · {climateSummary(rollClimate(save.seed, nextMatch.id))}
          </p>
        ) : null}
        {!preseason && nextMatch ? (
          <div className="coach-brief">
            <p className="kicker">Coach notes</p>
            {buildPreMatchBriefing({
              clubId: save.clubId,
              match: nextMatch,
              championship,
              tactics: save.tactics,
              sheet: save.sheet,
              condition: save.condition,
              seed: save.seed,
              balance: save.balance,
            }).notes.map((note) => (
              <p key={note} className="hint hint--tight">
                {note}
              </p>
            ))}
          </div>
        ) : null}
        {preseason && !save.trainingDue ? (
          <p className="hint hint--tight">Round 1 waits after six weeks. Open training when the next week is due.</p>
        ) : null}
      </section>

      {!preseason && save.trainingDue && onMatchPrep ? (
        <section className="card card--compact">
          <p className="kicker">Next match work</p>
          <div className="choice-stack">
            {MATCH_PREP_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => onMatchPrep(option.value)}>
                <strong>{option.title}</strong>
                <span>{option.copy}</span>
              </button>
            ))}
          </div>
          <p className="hint hint--tight">
            Tap an aspect to work it for the next championship day. Standard schedules are for preseason.
          </p>
        </section>
      ) : null}

      {preseason && (onRunWeek || onSetWeekShape) ? (
        <section className="card card--compact">
          <p className="kicker">This week&apos;s shape</p>
          <WeekShapePicker
            weekShape={weekShape}
            disabled={!save.trainingDue}
            onChange={(shape) => {
              if (save.trainingDue && onRunWeek) onRunWeek(shape);
              else onSetWeekShape?.(shape);
            }}
          />
          <p className="hint hint--tight">
            {save.trainingDue
              ? "Tap a shape to run all three sessions now. Mixed work still uses the schedules from Training."
              : "This week's sessions are in."}
          </p>
          {onOpenTraining ? (
            <div className="row-actions">
              <button type="button" className="btn btn--ghost" onClick={onOpenTraining}>
                Edit schedules
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {campaign && playerId && onReady && onUnready && onForce && onPass ? (
        <CampaignWeekCard
          campaign={campaign}
          clubId={save.clubId}
          playerId={playerId}
          localSeats={localSeats}
          roomStatus={roomStatus}
          onReady={onReady}
          onUnready={onUnready}
          onForce={onForce}
          onPass={onPass}
        />
      ) : null}

      <section>
        <h3 className="list-title">
          News
          {unread > 0 ? <em className="news-count">{unread} new</em> : null}
        </h3>
        <ul className="inbox news-feed">
          {save.inbox.length === 0 ? (
            <li className="empty">Set your team, then go to the first match.</li>
          ) : (
            save.inbox.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`news-item news-item--${item.tone ?? "neutral"}${item.read ? "" : " is-unread"}`}
                  onClick={() => openNews(item)}
                >
                  <NewsKindIcon kind={item.kind} />
                  <span className="news-item__copy">
                    <em>
                      {item.source || NEWS_KIND_LABEL[item.kind]}
                      {item.date ? ` · ${formatDate(item.date)}` : ""}
                    </em>
                    <strong>{item.title}</strong>
                    <span>{preview(item.body)}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
