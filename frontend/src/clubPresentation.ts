/**
 * Derive club match selection, outcomes, season totals and kickoff labels from saved fixtures.
 * Keep these calculations independent of React, polling and storage so boundary cases
 * can be tested without a browser or provider request.
 */
import type { Fixture } from './types'

export const liveStatuses: ReadonlySet<string> = new Set(['LIVE', 'IN_PLAY', 'PAUSED', 'SUSPENDED'])
export const statusLabels: Readonly<Record<string, string>> = {
  LIVE: 'In play',
  IN_PLAY: 'In play',
  PAUSED: 'Half-time',
  SUSPENDED: 'Suspended',
  POSTPONED: 'Postponed',
  CANCELLED: 'Cancelled',
}

// EPL-only presentation: 20 clubs play each opponent home and away.
export const EPL_SEASON_GAMES = 38
// The visual grid has six rows of seven; the last four cells are intentionally unused.
export const SEASON_GRID_CELLS = 6 * 7

/**
 * A score-known outcome from the selected club's perspective.
 */
export type MatchOutcome = { marker: 'W' | 'D' | 'L'; label: 'Win' | 'Draw' | 'Loss' }

type SeasonResult = MatchOutcome | { marker: '?'; label: 'Result unavailable' }

/**
 * Identify completed games consistently for aggregate progress and the season grid.
 * @param match Saved club fixture; no score is required for completion counting.
 * @returns Whether the provider reports a final or awarded game.
 */
function isCompleted(match: Fixture): boolean {
  return ['FINISHED', 'AWARDED'].includes(match.status)
}

/**
 * A final result with both reported scores; zero remains a genuine score.
 */
export type CompletedFixture = Fixture & { home_score: number; away_score: number }

/**
 * Narrow a fixture only when a final score can safely drive recent form.
 * @param match A saved fixture whose reported status and nullable scores are inspected.
 * @returns Whether both final scores are available for typed outcome calculations.
 */
function hasFinalScore(match: Fixture): match is CompletedFixture {
  return match.status === 'FINISHED' && match.home_score !== null && match.away_score !== null
}

/**
 * Count the full saved season, independently of the five-result recent-form limit.
 * @param matches The selected club's saved EPL fixtures; no provider reads are performed.
 * @returns Completed and remaining games out of 38; awarded games count, postponements do not.
 */
export function seasonProgress(matches: Fixture[]) {
  const completed = matches.filter(isCompleted).length
  const played = Math.min(EPL_SEASON_GAMES, completed)
  return { played, remaining: EPL_SEASON_GAMES - played }
}

/**
 * Build the complete chronological season record, keeping unknown outcomes explicit.
 * @param matches Full saved club fixtures; input order and scores are not mutated.
 * @param teamId Selected club for home/away outcome interpretation.
 * @returns Played/remaining counts, up to 38 completed result marks, and missing-score context.
 */
export function seasonRecord(matches: Fixture[], teamId: number) {
  const { played, remaining } = seasonProgress(matches)
  const completed = matches
    .filter(isCompleted)
    .sort((a, b) => (a.kickoff ?? '9999').localeCompare(b.kickoff ?? '9999') || a.id - b.id)
    .slice(0, EPL_SEASON_GAMES)
  const results: SeasonResult[] = completed.map((match) => {
    if (match.home_score === null || match.away_score === null) {
      return { marker: '?', label: 'Result unavailable' }
    }
    return matchOutcome(
      { ...match, home_score: match.home_score, away_score: match.away_score },
      teamId,
    )
  })
  return {
    played,
    remaining,
    results,
    hasMissingResults: results.some((result) => result.marker === '?'),
  }
}

/**
 * Describe the selected club's outcome without a non-null assertion or score fallback.
 * @param match A completed, score-known fixture from recent form or the full season.
 * @param teamId The club whose perspective determines W/D/L, including away matches.
 * @returns A concise marker and accessible label; no UI or storage side effects.
 */
export function matchOutcome(match: CompletedFixture, teamId: number): MatchOutcome {
  const home = match.home.id === teamId
  const scored = home ? match.home_score : match.away_score
  const conceded = home ? match.away_score : match.home_score
  if (scored === conceded) return { marker: 'D', label: 'Draw' }
  if (scored > conceded) return { marker: 'W', label: 'Win' }
  return { marker: 'L', label: 'Loss' }
}

/**
 * Select matches by actual kickoff order, independent of provider matchweek numbering.
 * @param matches Saved matches already filtered to one club.
 * @returns Featured active/upcoming match and up to five score-known completed results.
 * Dated results are newest first; undated results follow without inventing chronology.
 */
export function selectClubMatches(matches: Fixture[]) {
  const ordered = [...matches].sort(
    (a, b) => (a.kickoff ?? '9999').localeCompare(b.kickoff ?? '9999') || a.id - b.id,
  )
  const active = ordered.find((match) => liveStatuses.has(match.status))
  const next = active ?? ordered.find((match) => ['TIMED', 'SCHEDULED'].includes(match.status))
  // Unknown kickoff dates cannot establish the newest result; keep them after dated results.
  const results = matches
    .filter(hasFinalScore)
    .sort((a, b) => {
      if (!a.kickoff && b.kickoff) return 1
      if (a.kickoff && !b.kickoff) return -1
      return (b.kickoff ?? '').localeCompare(a.kickoff ?? '') || b.id - a.id
    })
    .slice(0, 5)
  return { next, results }
}

/**
 * Show a conservative kickoff countdown, never an invented match clock.
 * @param match Normalized match selected from saved data.
 * @param now Current browser instant; provider status still determines live play.
 * @returns Countdown or explicit status/unknown-time message.
 */
export function kickoffLabel(match: Fixture, now: number): string {
  if (statusLabels[match.status]) return statusLabels[match.status]
  if (match.status !== 'TIMED' || !match.kickoff) return 'Kickoff TBC'
  const remaining = Date.parse(match.kickoff) - now
  if (remaining <= 0) return 'Awaiting match update'
  const minutes = Math.ceil(remaining / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return `${days}d · ${hours}h · ${minutes % 60}m`
}
