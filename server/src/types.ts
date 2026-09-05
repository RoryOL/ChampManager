export interface Team {
  id: string;
  name: string;
  /** Attacking strength, 1-100. */
  attack: number;
  /** Defensive strength, 1-100. */
  defense: number;
}

export interface Match {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
}

export interface Database {
  teams: Team[];
  matches: Match[];
}

export interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
