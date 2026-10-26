import { useEffect, useState } from 'react'
import type { Fixture, FixturesState } from '../types'
import { DatasetFreshness } from './DatasetFreshness'
import { TeamCrest } from './TeamCrest'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
})
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
})
const statusLabels: Record<string, string> = {
  FINISHED: 'FT', IN_PLAY: 'In play', PAUSED: 'Half-time', LIVE: 'In play',
  POSTPONED: 'Postponed', SUSPENDED: 'Suspended', CANCELLED: 'Cancelled',
  AWARDED: 'Awarded', SCHEDULED: 'Time to be confirmed', TIMED: 'Scheduled',
}

/** Show two provider-numbered rounds, using only backend-owned local state. */
export function Matchweeks({ favoriteTeamId }: { favoriteTeamId: number | null }) {
  const [state, setState] = useState<FixturesState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const response = await fetch('/api/fixtures')
        if (!response.ok) throw new Error('Matchweeks are temporarily unavailable.')
        const data: FixturesState = await response.json()
        if (mounted) {
          setState(data)
          setError(null)
        }
      } catch {
        if (mounted) setError('Could not reach the fixture service.')
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const data = state?.fixtures
  const weeks = data ? [data.current_matchday, data.current_matchday + 1].filter(week => week <= 38) : []

  return (
    <section aria-label="Premier League matchweeks">
      {(error || state?.refresh_error) && (
        <p className="stale-message" role="status">
          {error ?? state?.refresh_error}{' '}
          {data ? 'Showing the last successful fixture data.' : ''}
        </p>
      )}
      {!data && (
        <div className="message-panel" role="status">
          {state?.refresh_status === 'error' ? 'Fixture data is not available yet.' : 'Waiting for matchweeks…'}
        </div>
      )}
      {data && <>
        <div className="matchweek-grid">
          {weeks.map(week => {
            const matches = data.matches
              .filter(match => match.matchday === week)
              .sort((a, b) => (a.kickoff ?? '9999').localeCompare(b.kickoff ?? '9999') || a.id - b.id)

            return (
              <section className="table-card matchweek-card" key={week} aria-labelledby={`week-${week}`}>
                <header className="matchweek-header">
                  <h2 id={`week-${week}`}>Matchweek {week}</h2>
                  <span>{matches.length} matches</span>
                </header>
                {matches.length ? (
                  <ol className="fixture-list">
                    {matches.map(match => <FixtureRow key={match.id} match={match} favoriteTeamId={favoriteTeamId} />)}
                  </ol>
                ) : <p className="message-panel">No fixtures are available for this matchweek.</p>}
              </section>
            )
          })}
        </div>
        <footer className="table-footer">
          <span>Kickoffs in Pacific time · Scores update periodically</span>
          <DatasetFreshness
            datasetName="Fixtures"
            isFresh={state.refresh_status === 'fresh'}
            lastSuccessAt={data.retrieved_at}
            nextRefreshAt={state.next_refresh_at}
          />
        </footer>
      </>}
    </section>
  )
}

/** Keep one continuous row per match, preserving unknown versus zero scores. */
function FixtureRow({ match, favoriteTeamId }: { match: Fixture; favoriteTeamId: number | null }) {
  const favorite = match.home.id === favoriteTeamId || match.away.id === favoriteTeamId
  const inPlay = ['IN_PLAY', 'PAUSED', 'LIVE'].includes(match.status)
  const showScore = !['SCHEDULED', 'TIMED', 'POSTPONED', 'CANCELLED'].includes(match.status)
    && match.home_score !== null && match.away_score !== null
  const kickoff = match.kickoff ? new Date(match.kickoff) : null
  const centerLabel = showScore
    ? `${match.home_score} – ${match.away_score}`
    : kickoff && match.status === 'TIMED' ? timeFormatter.format(kickoff) : 'vs'

  return (
    <li className={`fixture-row ${favorite ? 'favorite-fixture' : ''}`}>
      <div className="fixture-meta">
        <span>{kickoff ? dateFormatter.format(kickoff) : 'Date TBC'}</span>
        <span className={inPlay ? 'match-in-play' : ''}>
          {statusLabels[match.status] ?? match.status.replaceAll('_', ' ')}
        </span>
      </div>
      <div className="fixture-teams">
        <div className="fixture-club">
          <TeamCrest name={match.home.name} url={match.home.crest} />
          <span>{match.home.name}</span>
        </div>
        <strong className="fixture-score">{centerLabel}</strong>
        <div className="fixture-club fixture-away">
          <TeamCrest name={match.away.name} url={match.away.crest} />
          <span>{match.away.name}</span>
        </div>
      </div>
    </li>
  )
}
