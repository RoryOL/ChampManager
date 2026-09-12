import type { Team } from "../types";
import { ClubBadge } from "./ClubBadge";
import { compactName, teamAccent } from "../lib/display";
import { formatSideRating, sideRatingDelta } from "../lib/briefing";

type Props = {
  us?: Team;
  them?: Team;
  ourAttack: number;
  ourDefence: number;
  theirAttack: number;
  theirDefence: number;
};

const RATING_SCALE = 20;
const BAR_TRACK = "#102033";
const FALLBACK_US = "#e3b01f";
const FALLBACK_THEM = "#5b9bd5";

function hexRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "");
  if (raw.length < 6) return null;
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function colorDist(left: string, right: string): number {
  const a = hexRgb(left);
  const b = hexRgb(right);
  if (!a || !b) return 1;
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pickBarColor(team: Team | undefined, avoid?: string): string {
  const accent = teamAccent(team);
  const club = [accent.stripe, accent.ink, accent.secondary, accent.primary];
  const visible = club.filter((color) => colorDist(color, BAR_TRACK) > 0.4);
  const distinct = avoid ? visible.filter((color) => colorDist(color, avoid) > 0.45) : visible;
  if (distinct.length) {
    if (!avoid) return distinct[0] ?? FALLBACK_US;
    return [...distinct].sort((left, right) => colorDist(right, avoid) - colorDist(left, avoid))[0] ?? FALLBACK_US;
  }
  return avoid ? FALLBACK_THEM : FALLBACK_US;
}

function barWidth(value: number): string {
  return `${Math.max(6, Math.min(100, (value / RATING_SCALE) * 100))}%`;
}

function markTone(ours: number, theirs: number, side: "us" | "them"): string {
  const delta = sideRatingDelta(ours, theirs);
  if (delta === 0) return "";
  const weWin = delta > 0;
  if (side === "us") return weWin ? "is-up" : "is-down";
  return weWin ? "is-down" : "is-up";
}

function Delta({ ours, theirs }: { ours: number; theirs: number }) {
  const delta = sideRatingDelta(ours, theirs);
  if (delta === 0) return <em className="match-ratings__delta">level</em>;
  const up = delta > 0;
  return (
    <em className={`match-ratings__delta ${up ? "is-up" : "is-down"}`}>
      {up ? "+" : ""}
      {delta.toFixed(1)}
    </em>
  );
}

function RatingDuel({
  label,
  ours,
  theirs,
  usColor,
  themColor,
}: {
  label: string;
  ours: number;
  theirs: number;
  usColor: string;
  themColor: string;
}) {
  const ourMark = formatSideRating(ours);
  const theirMark = formatSideRating(theirs);
  return (
    <div className="match-ratings__row">
      <div className="match-ratings__label">
        <span>{label}</span>
        <Delta ours={ours} theirs={theirs} />
      </div>
      <div className="match-ratings__duel">
        <div className="match-ratings__side">
          <strong className={markTone(ours, theirs, "us")}>{ourMark}</strong>
          <div className="match-ratings__bar match-ratings__bar--us">
            <i style={{ width: barWidth(ours), background: usColor }} />
          </div>
        </div>
        <div className="match-ratings__side match-ratings__side--them">
          <div className="match-ratings__bar match-ratings__bar--them">
            <i style={{ width: barWidth(theirs), background: themColor }} />
          </div>
          <strong className={markTone(ours, theirs, "them")}>{theirMark}</strong>
        </div>
      </div>
    </div>
  );
}

export function MatchRatingsCompare({ us, them, ourAttack, ourDefence, theirAttack, theirDefence }: Props) {
  const usName = us ? compactName(us) : "Us";
  const themName = them ? compactName(them) : "Them";
  const usColor = pickBarColor(us);
  const themColor = pickBarColor(them, usColor);
  return (
    <div className="match-ratings">
      <p className="kicker">Scout</p>
      <div className="match-ratings__heads">
        <span className="match-ratings__club">
          <ClubBadge team={us} size="sm" variant="crest" />
          {usName}
        </span>
        <span className="match-ratings__club match-ratings__club--them">
          {themName}
          <ClubBadge team={them} size="sm" variant="crest" />
        </span>
      </div>
      <RatingDuel label="Attack" ours={ourAttack} theirs={theirAttack} usColor={usColor} themColor={themColor} />
      <RatingDuel label="Defence" ours={ourDefence} theirs={theirDefence} usColor={usColor} themColor={themColor} />
    </div>
  );
}
