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

export type MatchPeriod = "first" | "second" | "full" | "et1" | "et2";

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
  /** Set when this fixture is a replay of a knockout that stayed level after extra time. */
  replayOf?: string;
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
  /** 0 = short puck-outs to the full-back line, 100 = long to a midfielder or half-forward */
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
  /** Our defender/midfielder name → opposition forward/midfielder name. */
  manMarks?: Record<string, string>;
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
  shotStopping: number;
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

export type PlayerSuspension = {
  matchesLeft: number;
  reason: "straight-red";
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
  /** Straight red: miss the next match. Two yellows do not set this. */
  suspension?: PlayerSuspension;
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

/** Championship rest-week work for the next day only. */
export type MatchPrep = "puckout" | "shooting" | "marking" | "running";

/** @deprecated Use WeekSession. Kept so older saves/tests still type-check during migration. */
export type TrainingFocus = WeekSession | "fitness" | "skills" | "setpieces";

export type CalendarPhase = "preseason" | "season";

/** After the Canon is won: ceremony, then a new-season offer, then browsing. */
export type SeasonWrap = "offer" | "done";

export type Difficulty = "junior" | "intermediate" | "senior" | "intercounty";

/** How panels are generated when a season starts. */
export type SquadBalance = "standard" | "balanced";

/** Natural 1–20 card, without familiarity or the derived overall. */
export type CareerRatings = Omit<PlayerRatings, "familiarity" | "overall">;

/** A hurler who was not on the original panel. */
export type SquadJoin = {
  number: number;
  position: PositionLine;
  grade: PlayerGrade;
  familiarity: PositionFamiliarity;
};

/** Age and natural ratings carried from one championship into the next. */
export type PlayerCareer = {
  age: number;
  ratings: CareerRatings;
  /** Fractional progress toward the next integer change. */
  bank?: Partial<CareerRatings>;
  /** Set when this name came in as a recruit. Copied forward each winter. */
  joined?: SquadJoin;
  /** Called it a day. Kept so the original panel name does not reappear. */
  retired?: boolean;
};

/** club id → player name → winter card */
export type CareerBook = Record<string, Record<string, PlayerCareer>>;

export type RatingsContext = {
  seed?: number;
  balance?: SquadBalance;
  careers?: CareerBook;
};

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
  | "play"
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
  puckoutsAttempted?: number;
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
  /** Player who came off when kind is "sub". */
  replacedName?: string;
  /** Straight red vs two yellows. Omitted on older events; infer from text. */
  dismissal?: "straight" | "secondYellow";
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
  puckoutsAttempted?: number;
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
  puckoutsAttempted?: number;
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
  events?: MatchEvent[];
  homeClosingSheet?: TeamSheet;
  awayClosingSheet?: TeamSheet;
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
  homeClosingSheet?: TeamSheet;
  awayClosingSheet?: TeamSheet;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
  players: PlayerMatchStats[];
  coachReport: string[];
  gameSeed?: number;
  balance?: SquadBalance;
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
  version: 15;
  clubId: string;
  seed: number;
  difficulty: Difficulty;
  balance: SquadBalance;
  tactics: Tactics;
  sheet: TeamSheet;
  matches: { id: string; homeScore: Score | null; awayScore: Score | null }[];
  extraMatches?: Match[];
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
  rivals: Record<string, ClubRuntime>;
  nextMatchPrep?: MatchPrep;
  seasonWrap?: SeasonWrap;
  /** Championship year. Omitted on a first season, which is 2026. */
  year?: number;
  defendingChampionId?: string;
  /** Natural ratings after winters. Absent until the first new season. */
  careers?: CareerBook;
};

export type LivePhase =
  | "first"
  | "half-time"
  | "half-wait"
  | "second"
  | "extra-time"
  | "et1"
  | "extra-half"
  | "et2"
  | "finished"
  | "throw-in";

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
  nextMatchPrep?: MatchPrep;
  /** 1–6 during preseason; 7+ once this club has started the championship. */
  preseasonWeek?: number;
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
  difficulty: Difficulty;
  balance: SquadBalance;
  createdAt: number;
  seats: Seat[];
  phase: "lobby" | "preseason" | "season";
  preseasonWeek: number;
  matches: { id: string; homeScore: Score | null; awayScore: Score | null }[];
  extraMatches?: Match[];
  reports: Record<string, MatchReport>;
  clubs: Record<string, ClubRuntime>;
  week: WeekState;
  seasonWrap?: SeasonWrap;
};
