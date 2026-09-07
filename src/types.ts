export type Score = {
  goals: number;
  points: number;
};

export type GroupId = "1" | "2" | "3" | "4";

export type MatchStage =
  | "group"
  | "quarter-final"
  | "semi-final"
  | "final"
  | "relegation-semi"
  | "relegation-final";

export type TeamRef =
  | { type: "team"; teamId: string }
  | { type: "group-position"; groupId: GroupId; position: 1 | 2 | 3 | 4 }
  | { type: "winner"; matchId: string }
  | { type: "loser"; matchId: string };

export type Team = {
  id: string;
  name: string;
  irishName: string;
  nickname?: string;
  colours: { primary: string; secondary: string; label: string };
  note?: string;
};

export type PlayerGrade = "A" | "B" | "C" | "D";

export type Group = {
  id: GroupId;
  name: string;
  teamIds: string[];
};

export type Match = {
  id: string;
  stage: MatchStage;
  round?: number;
  groupId?: GroupId;
  date: string;
  time?: string;
  venue?: string;
  home: TeamRef;
  away: TeamRef;
  homeScore: Score | null;
  awayScore: Score | null;
};

export type Player = {
  number: number;
  name: string;
};

export type TeamLineup = {
  matchId: string;
  teamId: string;
  starters: Player[];
  subs: Player[];
  source: string;
};

export type SquadPlayer = Player & {
  starts: number;
  appearances: number;
};

export type Championship = {
  title: string;
  shortTitle: string;
  year: number;
  sponsor: string;
  trophy: string;
  county: string;
  defendingChampionId: string;
  promotedId: string;
  teams: Team[];
  groups: Group[];
  matches: Match[];
};

export type TeamStats = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  points: number;
};

export type StandingRow = TeamStats & {
  position: number;
  difference: number;
  status: "quarter-final" | "safe" | "relegation" | "pending";
};

export type PageId = "home" | "squad" | "tactics" | "fixtures" | "table" | "training";

export type PositionLine = "GK" | "FB" | "HB" | "MF" | "HF" | "FF";

export type PositionFamiliarity = Record<PositionLine, number>;

export type Tactics = {
  mentality: "contain" | "balanced" | "attacking";
  /** 0 = short passing / running game, 100 = direct long ball */
  build: number;
  /** 0 = short puck-outs to half-backs, 100 = long to a midfielder or half-forward */
  puckout: number;
  /** 0 = light tackling, 100 = aggressive — more hooks, more frees and bookings given away */
  aggression: number;
  /** 0 = sit off, 100 = hunt every possession — more tackles, more match fatigue */
  pressure: number;
  /** 0 = shoot on sight, 100 = only take a shot when the look is certain */
  shooting: number;
  shape: "sweeper" | "traditional";
  longFreeTaker?: string;
  shortFreeTaker?: string;
  sidelineTaker?: string;
  /** Named midfielder or half-forward to hit on attacking puck-outs. */
  puckoutTarget?: string;
};

export type PlayerRatings = {
  speed: number;
  aerialReach: number;
  stamina: number;
  strength: number;
  acceleration: number;
  firstTouch: number;
  highFielding: number;
  strikingDistance: number;
  shooting: number;
  vision: number;
  hooking: number;
  passing: number;
  offTheBall: number;
  manMarking: number;
  workrate: number;
  underPressure: number;
  composure: number;
  teamwork: number;
  frees: number;
  sidelines: number;
  puckoutReach: number;
  familiarity: PositionFamiliarity;
  overall: number;
};

export type RatedPlayer = SquadPlayer & {
  position: PositionLine;
  ratings: PlayerRatings;
  age: number;
  grade: PlayerGrade;
};

export type AttributeBoosts = Partial<
  Record<Exclude<keyof PlayerRatings, "familiarity" | "overall">, number>
>;

export type PlayerInjury = {
  weeksLeft: number;
  durationWeeks: number;
  ailment: string;
  source: "match" | "training";
};

export type PlayerCondition = {
  fatigue: number;
  sharpness: number;
  /** Hidden match form, 8–92. Not shown on the squad card. */
  form?: number;
  /** @deprecated Migrated into form. */
  mood?: number;
  moodNote?: string;
  /** Small training lifts on 1–20 profile stats. Natural ability is the unboosted baseline. */
  boosts?: AttributeBoosts;
  injury?: PlayerInjury;
};

export type TrainingType = "defensive" | "attacking" | "tactics" | "physical" | "setpieces";

export type TrainingMix = Record<TrainingType, number>;

export type PlayerPlan = {
  mix: TrainingMix;
  /** Old saves treated this as a skipped week; it now maps to light intensity. */
  recovery?: boolean;
  /** Overrides squad intensity for this player. Unset means use the squad default. */
  intensity?: TrainingIntensity;
};

export type TrainingPlans = Record<string, PlayerPlan>;

/** Week session: individual mixes, a challenge match, or a full recovery week. */
export type WeekSession = "mixed" | "challenge" | "recovery";

export type TrainingIntensity = "intense" | "balanced" | "light";

/** Preseason week: two mixed sessions plus a challenge, or three mixed sessions. */
export type WeekShape = "challenge" | "triple";

/** @deprecated Use WeekSession. Kept so older saves/tests still type-check during migration. */
export type TrainingFocus = WeekSession | "fitness" | "skills" | "setpieces";

export type CalendarPhase = "preseason" | "season";

export type NewsKind = "chairman" | "match" | "press" | "injury" | "training" | "recovery" | "briefing";

export type NewsTone = "positive" | "negative" | "neutral";

export type AmbitionTarget = "canon" | "final" | "semi" | "quarter" | "group";

export type NewsItem = {
  id: string;
  kind: NewsKind;
  source: string;
  title: string;
  body: string;
  date: string;
  matchId?: string;
  playerName?: string;
  read?: boolean;
  tone?: NewsTone;
};

export type ShotKind = "point" | "goal" | "wide" | "save" | "free" | "sixtyFive" | "sideline";

export type ShotAttempt = {
  minute: number;
  teamId: string;
  playerName: string;
  kind: ShotKind;
  scored: boolean;
  /** Metres from the left sideline (0–90). */
  x: number;
  /** Metres from the home goal line (0–145). */
  y: number;
  distance: number;
};

export type WeatherSky = "sunny" | "wet" | "cold" | "windy";

export type MatchClimate = {
  sky: WeatherSky;
  windStrength: number;
  windAngle: number;
};

export type MatchEventKind =
  | "point"
  | "goal"
  | "wide"
  | "save"
  | "free"
  | "sixtyFive"
  | "sideline"
  | "hook"
  | "booking"
  | "red"
  | "puckout"
  | "turnover"
  | "coach"
  | "injury"
  | "sub"
  | "half"
  | "full";

export type StatCredit = {
  name: string;
  teamId: string;
  possessions?: number;
  sequences?: number;
  passesAttempted?: number;
  passesCompleted?: number;
  shots?: number;
  scores?: number;
  highFieldingAttempted?: number;
  highFieldingWon?: number;
  puckoutsWon?: number;
  tacklesAttempted?: number;
  tacklesWon?: number;
  freesConceded?: number;
  freesAttempted?: number;
  freesScored?: number;
  sixtyFivesAttempted?: number;
  sixtyFivesScored?: number;
  minutes?: number;
};

export type MatchEvent = {
  minute: number;
  teamId: string;
  playerName: string;
  kind: MatchEventKind;
  text: string;
  momentum?: number;
  credits?: StatCredit[];
};

export type PlayerMatchStats = {
  name: string;
  teamId: string;
  started: boolean;
  minutes: number;
  possessions: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  scores: number;
  highFieldingAttempted: number;
  highFieldingWon: number;
  puckoutsWon: number;
  tacklesAttempted: number;
  tacklesWon: number;
  freesConceded?: number;
  freesAttempted?: number;
  freesScored?: number;
  sixtyFivesAttempted?: number;
  sixtyFivesScored?: number;
  groundCovered: number;
  fatigue: number;
  fitness: number;
  overall: number;
  rating: number;
  mood: number;
};

export type TeamMatchStats = {
  teamId: string;
  possessions: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  scores: number;
  highFieldingAttempted: number;
  highFieldingWon: number;
  puckoutsWon: number;
  tacklesAttempted: number;
  tacklesWon: number;
  freesConceded?: number;
  freesAttempted?: number;
  freesScored?: number;
  sixtyFivesAttempted?: number;
  sixtyFivesScored?: number;
  groundCovered: number;
  fatigue: number;
  fitness: number;
  overall: number;
  rating: number;
};

export type MatchReport = {
  matchId: string;
  homeId: string;
  awayId: string;
  homeScore: Score;
  awayScore: Score;
  homeTactics: Tactics;
  awayTactics: Tactics;
  homeSheet: TeamSheet;
  awaySheet: TeamSheet;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
  players: PlayerMatchStats[];
  coachReport: string[];
  climate?: MatchClimate;
  shots?: ShotAttempt[];
};

export type SimulatedMatch = {
  matchId: string;
  homeId: string;
  awayId: string;
  homeScore: Score;
  awayScore: Score;
  events: MatchEvent[];
  homeTactics: Tactics;
  awayTactics: Tactics;
  homeSheet: TeamSheet;
  awaySheet: TeamSheet;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
  players: PlayerMatchStats[];
  coachReport: string[];
  gameSeed?: number;
  climate: MatchClimate;
  shots: ShotAttempt[];
  homeChaseEffort?: number;
  awayChaseEffort?: number;
  matchInjuries?: {
    name: string;
    teamId: string;
    minute: number;
    injury: PlayerInjury;
  }[];
};

export type TeamSheet = {
  starters: string[];
  subs: string[];
};

export type GameSave = {
  version: 9;
  clubId: string;
  seed: number;
  tactics: Tactics;
  sheet: TeamSheet;
  matches: { id: string; homeScore: Score | null; awayScore: Score | null }[];
  inbox: NewsItem[];
  phase: CalendarPhase;
  preseasonWeek: number;
  condition: Record<string, PlayerCondition>;
  trainingDue: boolean;
  reports: Record<string, MatchReport>;
  ambition: AmbitionTarget;
  plans: TrainingPlans;
  lastSheet?: TeamSheet;
  intensity: TrainingIntensity;
  weekShape: WeekShape;
  sessionsDone: number;
  trainingDeltas: Record<string, AttributeBoosts>;
  weekDeltas: Record<string, AttributeBoosts>;
};

export type LivePhase = "first" | "half-time" | "half-wait" | "second" | "finished";

export type WaitHours = 0 | 1 | 6 | 12 | 24 | 72 | 168;

export type Seat = {
  playerId: string;
  name: string;
  clubId: string;
};

export type ClubRuntime = {
  tactics: Tactics;
  sheet: TeamSheet;
  condition: Record<string, PlayerCondition>;
  inbox: NewsItem[];
  trainingDue: boolean;
  plans: TrainingPlans;
  lastSheet?: TeamSheet;
  intensity: TrainingIntensity;
  weekShape: WeekShape;
  sessionsDone: number;
  trainingDeltas: Record<string, AttributeBoosts>;
  weekDeltas: Record<string, AttributeBoosts>;
};

export type HalfPlan = {
  tactics: Tactics;
  sheet: TeamSheet;
  submittedAt: number;
};

export type MatchLive = {
  matchId: string;
  first: SimulatedMatch;
  homeSecond?: HalfPlan;
  awaySecond?: HalfPlan;
  combined?: SimulatedMatch;
  injuries?: Record<string, import("./lib/injuries").RolledInjury[]>;
};

export type WeekState = {
  locked: boolean;
  deadlineAt: number | null;
  ready: Record<string, { at: number }>;
  lives: Record<string, MatchLive>;
  batchLabel?: string;
  batchMatchIds?: string[];
};

export type Campaign = {
  version: 1;
  id: string;
  code: string;
  revision: number;
  seed: number;
  hostPlayerId: string;
  waitHours: WaitHours;
  createdAt: number;
  seats: Seat[];
  phase: "lobby" | "preseason" | "season";
  preseasonWeek: number;
  matches: { id: string; homeScore: Score | null; awayScore: Score | null }[];
  reports: Record<string, MatchReport>;
  clubs: Record<string, ClubRuntime>;
  week: WeekState;
};
