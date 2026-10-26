export type StandingsRow = {
  position: number
  team_id: number
  team_name: string
  team_crest?: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
}

export type StandingsResponse = {
  competition_id: number
  competition_code: string
  competition_name: string
  season_id: number
  season_start: string
  season_end: string
  current_matchday: number | null
  rows: StandingsRow[]
  retrieved_at: string
}

export type StandingsStateResponse = {
  standings: StandingsResponse | null
  refresh_status: 'pending' | 'refreshing' | 'fresh' | 'stale' | 'error'
  last_attempt_at: string | null
  last_success_at: string | null
  next_refresh_at: string | null
  refresh_error: string | null
}


export type FixtureTeam = { id: number; name: string; crest: string | null }
export type Fixture = {
  id: number
  matchday: number
  kickoff: string | null
  status: string
  home: FixtureTeam
  away: FixtureTeam
  home_score: number | null
  away_score: number | null
}
export type FixturesState = Omit<StandingsStateResponse, 'standings'> & {
  fixtures: {
    season_id: number
    current_matchday: number
    matches: Fixture[]
    retrieved_at: string
  } | null
}
