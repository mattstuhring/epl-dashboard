/**
 * Application-owned JSON contracts: UTC timestamp strings, date-only season dates, and nullable scores.
 */
/**
 * One ranked club with season totals; zero is meaningful, and crest may be absent.
 */
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

/**
 * Latest saved total table for one season, including provider retrieval time.
 */
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

/**
 * Saved standings plus backend scheduling/failure state, not browser polling times.
 */
export type StandingsStateResponse = {
  standings: StandingsResponse | null
  refresh_status: 'pending' | 'refreshing' | 'fresh' | 'stale' | 'error'
  last_attempt_at: string | null
  last_success_at: string | null
  next_refresh_at: string | null
  refresh_error: string | null
}

/**
 * Stable club identity and optional decorative HTTPS crest.
 */
export type FixtureTeam = { id: number; name: string; crest: string | null }
/**
 * One scheduled or reported match; null scores differ from a genuine 0–0 result.
 */
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
/**
 * Current and next numbered matchweeks, together with independent backend refresh metadata.
 */
export type FixturesState = Omit<StandingsStateResponse, 'standings'> & {
  fixtures: {
    season_id: number
    current_matchday: number
    matches: Fixture[]
    retrieved_at: string
  } | null
}
