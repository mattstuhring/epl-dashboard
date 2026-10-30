/**
 * Present current and next rounds grouped by Pacific calendar day from saved fixture state.
 * Polling retains scores between navigation changes; no browser request calls the provider.
 */
import { getFixtures } from '../api'
import { useLocalDataset } from '../hooks/useLocalDataset'
import type { Fixture } from '../types'
import { DatasetFreshness } from './DatasetFreshness'
import { TeamCrest } from './TeamCrest'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  minute: '2-digit',
})
const statusLabels: Record<string, string> = {
  FINISHED: 'FT',
  IN_PLAY: 'In play',
  PAUSED: 'Half-time',
  LIVE: 'In play',
  POSTPONED: 'Postponed',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
  AWARDED: 'Awarded',
  SCHEDULED: 'Time to be confirmed',
  TIMED: 'Scheduled',
}

/**
 * Poll and display two provider-numbered rounds while preserving last-known-good data.
 * @param props Favorite club ID for highlighting; never used to filter the schedule.
 * @returns Chronological fixture panels and independent refresh/failure context.
 */
export function Matchweeks({ favoriteTeamId }: { favoriteTeamId: number | null }) {
  const { state, error } = useLocalDataset(getFixtures)

  // Phase 1: Select displayed rounds; round 38 never creates an imaginary round 39.
  const data = state?.fixtures
  const weeks = data
    ? [data.current_matchday, data.current_matchday + 1].filter((week) => week <= 38)
    : []

  return (
    <section aria-label="Premier League matchweeks">
      {(error || state?.refresh_error) && (
        <p className="stale-message" role="status">
          {error ?? state?.refresh_error} {data ? 'Showing the last successful fixture data.' : ''}
        </p>
      )}
      {!data && (
        <div className="message-panel" role="status">
          {state?.refresh_status === 'error'
            ? 'Fixture data is not available yet.'
            : 'Waiting for matchweeks…'}
        </div>
      )}
      {data && (
        <>
          <div className="matchweek-grid">
            {weeks.map((week) => {
              const matches = data.matches
                .filter((match) => match.matchday === week)
                .sort(
                  (a, b) => (a.kickoff ?? '9999').localeCompare(b.kickoff ?? '9999') || a.id - b.id,
                )

              return (
                <section
                  className="table-card matchweek-card"
                  key={week}
                  aria-labelledby={`week-${week}`}
                >
                  <header className="matchweek-header">
                    <h2 id={`week-${week}`}>Matchweek {week}</h2>
                    <span>{matches.length} matches</span>
                  </header>
                  {matches.length ? (
                    groupFixturesByDay(matches).map((day) => (
                      <section className="fixture-day" key={day.key} aria-label={day.label}>
                        <h3 className="fixture-day-heading">{day.label}</h3>
                        <ol className="fixture-list">
                          {day.matches.map((match) => (
                            <FixtureRow
                              key={match.id}
                              match={match}
                              favoriteTeamId={favoriteTeamId}
                            />
                          ))}
                        </ol>
                      </section>
                    ))
                  ) : (
                    <p className="message-panel">No fixtures are available for this matchweek.</p>
                  )}
                </section>
              )
            })}
          </div>
          <footer className="table-footer">
            <span>Kickoffs in Pacific time · Scores update periodically</span>
            <DatasetFreshness
              datasetName="Fixtures"
              isFresh={
                !error &&
                (state.refresh_status === 'fresh' || state.refresh_status === 'refreshing')
              }
              hasError={Boolean(error || state.refresh_error)}
              lastSuccessAt={data.retrieved_at}
              nextRefreshAt={state.next_refresh_at}
            />
          </footer>
        </>
      )}
    </section>
  )
}

/**
 * Group chronological fixtures by Pacific calendar date, placing unknown dates last.
 * @param matches Fixtures already sorted by kickoff and stable provider ID.
 * @returns Ordered date groups; Date TBC remains separate from all known calendar days.
 */
function groupFixturesByDay(matches: Fixture[]) {
  const groups = new Map<string, { key: string; label: string; matches: Fixture[] }>()
  for (const match of matches) {
    const kickoff = match.kickoff ? new Date(match.kickoff) : null
    const key = kickoff ? dayKeyFormatter.format(kickoff) : 'date-tbc'
    let group = groups.get(key)
    if (!group) {
      group = { key, label: kickoff ? dateFormatter.format(kickoff) : 'Date TBC', matches: [] }
      groups.set(key, group)
    }
    group.matches.push(match)
  }
  return [...groups.values()]
}

/**
 * Present one matchup beneath its shared date heading, retaining individual provider status.
 * @param props Normalized match and selected favorite identity.
 * @returns A stable list row; unknown scores are never rendered as zero.
 */
function FixtureRow({ match, favoriteTeamId }: { match: Fixture; favoriteTeamId: number | null }) {
  // Keep reported zero scores distinct from absent scores and future kickoff times.
  const favorite = match.home.id === favoriteTeamId || match.away.id === favoriteTeamId
  const inPlay = ['IN_PLAY', 'PAUSED', 'LIVE'].includes(match.status)
  const showScore =
    !['SCHEDULED', 'TIMED', 'POSTPONED', 'CANCELLED'].includes(match.status) &&
    match.home_score !== null &&
    match.away_score !== null
  const kickoff = match.kickoff ? new Date(match.kickoff) : null
  const centerLabel = showScore
    ? `${match.home_score} – ${match.away_score}`
    : kickoff && match.status === 'TIMED'
      ? timeFormatter.format(kickoff)
      : 'vs'

  return (
    <li className={`fixture-row ${favorite ? 'favorite-fixture' : ''}`}>
      <div className="fixture-meta">
        <span className={inPlay ? 'match-in-play' : ''}>
          {statusLabels[match.status] ?? match.status.replaceAll('_', ' ')}
        </span>
      </div>
      <div className="fixture-teams">
        <div className="fixture-club">
          <TeamCrest name={match.home.name} url={match.home.crest} />
          <span>{match.home.name}</span>
        </div>
        <strong className={`fixture-score ${showScore ? '' : 'kickoff-time'}`}>
          {centerLabel}
        </strong>
        <div className="fixture-club fixture-away">
          <TeamCrest name={match.away.name} url={match.away.crest} />
          <span>{match.away.name}</span>
        </div>
      </div>
    </li>
  )
}
