import { useState } from "react";
import type { Campaign, Championship, GameSave, Match, NewsItem, Seat, WeekShape } from "../types";
import { CampaignWeekCard } from "../components/CampaignWeekCard";
import { ClubBadge } from "../components/ClubBadge";
import { NewsKindIcon } from "../components/NewsKindIcon";
import { WeekShapePicker } from "../components/WeekShapePicker";
import { compactName, sideLabel } from "../lib/display";
import { NEWS_KIND_LABEL } from "../lib/news";
import { resolveMatchSides, teamById, teamGroup } from "../lib/resolve";
import { formatDate, stageLabel } from "../lib/scoring";
import { buildPreMatchBriefing } from "../lib/briefing";
import { averageFitness, averageMatchOverall, averageSharpness, DEFAULT_WEEK_SHAPE, PRESEASON_WEEKS, sessionForSlot, sessionsPerWeek } from "../lib/training";
import { ratedSquad } from "../lib/players";
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
  onOpenTraining?: () => void;
  onSetWeekShape?: (shape: WeekShape) => void;
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
  onOpenTraining,
  onSetWeekShape,
}: Props) {
  const club = teamById(championship, save.clubId);
  const group = teamGroup(championship, save.clubId);
  const sides = nextMatch ? resolveMatchSides(championship, nextMatch) : null;
  const [openId, setOpenId] = useState<string | null>(null);
  const squad = ratedSquad(save.clubId, save.seed);
  const names = squad.map((player) => player.name);
  const fitness = averageFitness(save.condition, names);
  const sharpness = averageSharpness(save.condition, names);
  const form = averageMatchOverall(squad, save.condition, save.sheet.starters);
  const preseason = save.phase === "preseason";
  const formDelta = Math.round((form.match - form.ability) * 10) / 10;
  const opened = save.inbox.find((item) => item.id === openId) ?? null;
  const unread = save.inbox.filter((item) => !item.read).length;
  const total = sessionsPerWeek(save.phase);
  const sessionsDone = save.sessionsDone ?? 0;
  const weekShape = save.weekShape ?? DEFAULT_WEEK_SHAPE;
  const nextKind = sessionForSlot(save.phase, weekShape, sessionsDone);

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

      <section className="card card--compact">
        <p className="kicker">{preseason ? `Preseason · week ${Math.min(save.preseasonWeek, PRESEASON_WEEKS)} of ${PRESEASON_WEEKS}` : "Condition"}</p>
        <h3>
          Panel fitness {fitness} · sharpness {sharpness}
        </h3>
        <div className="attr-bar fatigue-bar">
          <i className={fitness <= 22 ? "is-warn" : ""} style={{ width: `${fitness}%` }} />
        </div>
        <p className="xv-form">
          Championship XV match rating {form.match}
          {formDelta !== 0 ? ` (${formDelta > 0 ? "+" : ""}${formDelta})` : ""} · ability {form.ability}
        </p>
        {save.trainingDue && !preseason ? (
          <p className="hint hint--tight">Midweek training is due. Mixed work uses the schedules from Training.</p>
        ) : campaign && preseason && !save.trainingDue ? (
          <p className="tactic-copy">Your week is in. Waiting on the other managers before it turns.</p>
        ) : null}
        {save.trainingDue && !preseason && onOpenTraining ? (
          <div className="row-actions">
            <button type="button" className="btn" onClick={onOpenTraining}>
              Open training
            </button>
          </div>
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

      {preseason && onSetWeekShape ? (
        <section className="card card--compact">
          <p className="kicker">This week&apos;s shape</p>
          <WeekShapePicker weekShape={weekShape} onChange={onSetWeekShape} />
          <p className="hint hint--tight">
            Mixed sessions use the schedules from Training
            {save.trainingDue
              ? ` · next up: ${nextKind === "challenge" ? "challenge match" : "mixed session"} · ${sessionsDone} of ${total} done`
              : "."}
          </p>
          {save.trainingDue && onOpenTraining ? (
            <div className="row-actions">
              <button type="button" className="btn" onClick={onOpenTraining}>
                Open training
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
