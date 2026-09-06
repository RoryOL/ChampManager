import { useState } from "react";
import type { Campaign, Championship, GameSave, Match, NewsItem, Seat, WeekSession } from "../types";
import { CampaignWeekCard } from "../components/CampaignWeekCard";
import { ClubBadge } from "../components/ClubBadge";
import { TrainingMixEditor } from "../components/TrainingMixEditor";
import { compactName, sideLabel } from "../lib/display";
import { NEWS_KIND_LABEL } from "../lib/news";
import { resolveMatchSides, teamById, teamGroup } from "../lib/resolve";
import { formatDate, stageLabel } from "../lib/scoring";
import { buildPreMatchBriefing } from "../lib/briefing";
import {
  SESSION_OPTIONS,
  applyPlansToSquad,
  averageFitness,
  averageMatchOverall,
  averageSharpness,
  defaultMixFor,
  mixSummary,
  planFor,
  PRESEASON_WEEKS,
} from "../lib/training";
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
  onTrain: (session: WeekSession) => void;
  onSetPlans: (plans: GameSave["plans"]) => void;
  onReady?: () => void;
  onUnready?: () => void;
  onForce?: () => void;
  onPass?: (playerId: string) => void;
  onReadNews: (id: string) => void;
  onOpenMatch: (matchId: string) => void;
  onOpenPlayer: (name: string) => void;
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
      <p className="kicker">
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
  onTrain,
  onSetPlans,
  onReady,
  onUnready,
  onForce,
  onPass,
  onReadNews,
  onOpenMatch,
  onOpenPlayer,
}: Props) {
  const club = teamById(championship, save.clubId);
  const group = teamGroup(championship, save.clubId);
  const sides = nextMatch ? resolveMatchSides(championship, nextMatch) : null;
  const [session, setSession] = useState<WeekSession>("mixed");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [template, setTemplate] = useState(() => ({
    mix: defaultMixFor("MF"),
    recovery: false,
  }));
  const squad = ratedSquad(save.clubId);
  const names = squad.map((player) => player.name);
  const fitness = averageFitness(save.condition, names);
  const sharpness = averageSharpness(save.condition, names);
  const form = averageMatchOverall(squad, save.condition, save.sheet.starters);
  const preseason = save.phase === "preseason";
  const formDelta = Math.round((form.match - form.ability) * 10) / 10;
  const opened = save.inbox.find((item) => item.id === openId) ?? null;
  const unread = save.inbox.filter((item) => !item.read).length;

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
        {save.trainingDue ? (
          <>
            <div className="choice-stack">
              {SESSION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={session === option.value ? "is-active" : ""}
                  onClick={() => setSession(option.value)}
                >
                  <strong>{option.title}</strong>
                  <span>{option.copy}</span>
                </button>
              ))}
            </div>
            {session === "mixed" ? (
              <div className="training-schedules">
                <p className="kicker">Squad template</p>
                <TrainingMixEditor plan={template} onChange={setTemplate} />
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onSetPlans(applyPlansToSquad(squad, template))}
                  >
                    Apply to whole panel
                  </button>
                </div>
                <p className="kicker">Individual schedules</p>
                <ul className="plan-list">
                  {squad.map((player) => {
                    const plan = planFor(player.name, save.plans, player.position);
                    const open = openPlan === player.name;
                    return (
                      <li key={player.name}>
                        <button
                          type="button"
                          className={`plan-row${open ? " is-open" : ""}`}
                          onClick={() => setOpenPlan(open ? null : player.name)}
                        >
                          <strong>{player.name}</strong>
                          <span>{plan.recovery ? "Recovery" : mixSummary(plan.mix)}</span>
                        </button>
                        {open ? (
                          <TrainingMixEditor
                            plan={plan}
                            onChange={(next) => onSetPlans({ ...save.plans, [player.name]: next })}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="row-actions">
              <button type="button" className="btn" onClick={() => onTrain(session)}>
                {preseason
                  ? session === "challenge"
                    ? `Challenge week ${save.preseasonWeek}`
                    : `Train week ${save.preseasonWeek}`
                  : session === "challenge"
                    ? "Play challenge match"
                    : session === "recovery"
                      ? "Run recovery week"
                      : "Run midweek session"}
              </button>
            </div>
          </>
        ) : campaign && preseason ? (
          <p className="tactic-copy">Your session is in. Waiting on the other managers before the week turns.</p>
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
            }).notes.map((note) => (
              <p key={note} className="hint hint--tight">
                {note}
              </p>
            ))}
          </div>
        ) : null}
        {preseason && !save.trainingDue ? (
          <p className="hint hint--tight">Round 1 waits after six weeks. Finish the session above when it is due.</p>
        ) : null}
      </section>

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
                  <em>
                    {item.source || NEWS_KIND_LABEL[item.kind]}
                    {item.date ? ` · ${formatDate(item.date)}` : ""}
                  </em>
                  <strong>{item.title}</strong>
                  <span>{preview(item.body)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
