import type {
  Campaign,
  ClubRuntime,
  HalfPlan,
  MatchLive,
  NewsItem,
  Seat,
  WeekState,
} from "../../types";

const PHASE_RANK: Record<Campaign["phase"], number> = {
  lobby: 0,
  preseason: 1,
  season: 2,
};

function laterPlan(left?: HalfPlan, right?: HalfPlan): HalfPlan | undefined {
  if (!left) return right;
  if (!right) return left;
  return left.submittedAt >= right.submittedAt ? left : right;
}

function unionInbox(left: NewsItem[], right: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const item of [...left, ...right]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items.slice(0, 40);
}

function clubProgress(club: ClubRuntime): number {
  let fatigue = 0;
  let injured = 0;
  for (const row of Object.values(club.condition)) {
    fatigue += row.fatigue ?? 0;
    injured += row.injury?.weeksLeft ?? 0;
  }
  const sessions = club.sessionsDone ?? 0;
  return (club.trainingDue ? sessions * 22 : 80) + club.inbox.length * 3 + injured + fatigue / 40;
}

function mergeClub(left?: ClubRuntime, right?: ClubRuntime, leftRev = 0, rightRev = 0): ClubRuntime | undefined {
  if (!left) return right;
  if (!right) return left;
  const leftScore = clubProgress(left);
  const rightScore = clubProgress(right);
  const ahead = leftScore === rightScore ? (leftRev >= rightRev ? left : right) : leftScore > rightScore ? left : right;
  const behind = ahead === left ? right : left;
  return {
    ...ahead,
    inbox: unionInbox(ahead.inbox, behind.inbox),
    trainingDue: left.trainingDue && right.trainingDue,
    plans: ahead.plans ?? behind.plans ?? {},
    lastSheet: ahead.lastSheet ?? behind.lastSheet,
    intensity: ahead.intensity ?? behind.intensity,
    weekShape: ahead.weekShape ?? behind.weekShape,
    sessionsDone: ahead.sessionsDone ?? behind.sessionsDone ?? 0,
    trainingDeltas: Object.keys(ahead.trainingDeltas ?? {}).length > 0 ? ahead.trainingDeltas : behind.trainingDeltas,
  };
}

function mergeLive(left?: MatchLive, right?: MatchLive): MatchLive | undefined {
  if (!left) return right;
  if (!right) return left;
  const leftEvents = left.combined?.events.length ?? left.first.events.length;
  const rightEvents = right.combined?.events.length ?? right.first.events.length;
  const richer = rightEvents > leftEvents ? right : left;
  const other = richer === left ? right : left;
  const injuries = { ...(other.injuries ?? {}) };
  for (const [clubId, items] of Object.entries(richer.injuries ?? {})) {
    injuries[clubId] = items.length >= (injuries[clubId]?.length ?? 0) ? items : injuries[clubId];
  }
  return {
    matchId: richer.matchId,
    first: richer.first,
    homeSecond: laterPlan(left.homeSecond, right.homeSecond),
    awaySecond: laterPlan(left.awaySecond, right.awaySecond),
    combined: left.combined ?? right.combined,
    injuries: Object.keys(injuries).length > 0 ? injuries : richer.injuries,
  };
}

function soonerDeadline(left: number | null, right: number | null): number | null {
  if (left == null) return right;
  if (right == null) return left;
  return Math.min(left, right);
}

function mergeWeek(left: WeekState, right: WeekState): WeekState {
  const ready: WeekState["ready"] = { ...left.ready };
  for (const [clubId, row] of Object.entries(right.ready)) {
    const existing = ready[clubId];
    if (!existing || row.at >= existing.at) ready[clubId] = row;
  }
  const lives: WeekState["lives"] = { ...left.lives };
  for (const [matchId, live] of Object.entries(right.lives)) {
    const merged = mergeLive(lives[matchId], live);
    if (merged) lives[matchId] = merged;
  }
  const locked = left.locked || right.locked;
  const labelled = left.batchLabel ? left : right;
  return {
    locked,
    deadlineAt: soonerDeadline(left.deadlineAt, right.deadlineAt),
    ready,
    lives,
    batchLabel: labelled.batchLabel,
    batchMatchIds: labelled.batchMatchIds,
  };
}

function mergeSeats(left: Seat[], right: Seat[]): Seat[] {
  const seats = [...left];
  for (const seat of right) {
    if (seats.some((item) => item.playerId === seat.playerId || item.clubId === seat.clubId)) continue;
    seats.push(seat);
  }
  return seats;
}

export function campaignsEquivalent(left: Campaign, right: Campaign): boolean {
  return left.revision === right.revision && JSON.stringify(left) === JSON.stringify(right);
}

export function mergeCampaigns(left: Campaign, right: Campaign): Campaign {
  if (left.code !== right.code) return left.revision >= right.revision ? left : right;
  if (left.id !== right.id) {
    if (left.seats.length !== right.seats.length) return left.seats.length >= right.seats.length ? left : right;
    return left.createdAt <= right.createdAt ? left : right;
  }

  const phase = PHASE_RANK[left.phase] >= PHASE_RANK[right.phase] ? left.phase : right.phase;
  const newer = left.revision >= right.revision ? left : right;
  const older = newer === left ? right : left;
  const clubs: Campaign["clubs"] = { ...older.clubs };
  for (const clubId of new Set([...Object.keys(left.clubs), ...Object.keys(right.clubs)])) {
    const merged = mergeClub(left.clubs[clubId], right.clubs[clubId], left.revision, right.revision);
    if (merged) clubs[clubId] = merged;
  }

  const reports = { ...older.reports, ...newer.reports };
  const matches = newer.matches.map((row, index) => {
    const other = older.matches[index] ?? older.matches.find((item) => item.id === row.id);
    if (row.homeScore && row.awayScore) return row;
    if (other?.homeScore && other.awayScore) return other;
    return row;
  });

  const merged: Campaign = {
    ...newer,
    waitHours: newer.waitHours,
    seats: mergeSeats(left.seats, right.seats),
    phase,
    preseasonWeek: Math.max(left.preseasonWeek, right.preseasonWeek),
    matches,
    reports,
    clubs,
    week: mergeWeek(left.week, right.week),
    revision: Math.max(left.revision, right.revision),
  };

  if (campaignsEquivalent(merged, left)) return left;
  if (campaignsEquivalent(merged, right)) return right;
  if (JSON.stringify(merged) === JSON.stringify(left)) return left;
  if (JSON.stringify(merged) === JSON.stringify(right)) return right;
  return { ...merged, revision: merged.revision + 1 };
}
