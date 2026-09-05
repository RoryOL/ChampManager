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
  colours: { primary: string; secondary: string };
  note?: string;
};

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

export type PageId = "home" | "squad" | "tactics" | "fixtures" | "table";

export type Tactics = {
  mentality: "contain" | "balanced" | "attacking";
  style: "possession" | "direct";
  pressing: "low" | "medium" | "high";
};

export type PlayerRatings = {
  handling: number;
  tackling: number;
  pace: number;
  stamina: number;
  striking: number;
  scoring: number;
  passing: number;
  overall: number;
};

export type RatedPlayer = SquadPlayer & {
  position: string;
  ratings: PlayerRatings;
};

export type NewsItem = {
  id: string;
  title: string;
  body: string;
  date: string;
  matchId?: string;
};

export type MatchEvent = {
  minute: number;
  teamId: string;
  playerName: string;
  kind: "point" | "goal" | "wide" | "save" | "half" | "full";
  text: string;
};

export type SimulatedMatch = {
  matchId: string;
  homeScore: Score;
  awayScore: Score;
  events: MatchEvent[];
};

export type TeamSheet = {
  starters: string[];
  subs: string[];
};

export type GameSave = {
  version: 1;
  clubId: string;
  seed: number;
  tactics: Tactics;
  sheet: TeamSheet;
  matches: { id: string; homeScore: Score | null; awayScore: Score | null }[];
  inbox: NewsItem[];
};
