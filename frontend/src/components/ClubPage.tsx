/**
 * Give the selected club a matchday focus using its locally stored EPL season.
 * Countdown ticks are browser-only; provider status owns in-play and final states.
 */
import { useCallback, useEffect, useState } from 'react'
import { getClubFixtures } from '../api'
import { useLocalDataset } from '../hooks/useLocalDataset'
import type { Fixture } from '../types'
import { DatasetFreshness } from './DatasetFreshness'
import { TeamCrest } from './TeamCrest'
import {
  liveStatuses,
  statusLabels,
  selectClubMatches,
  kickoffLabel,
  seasonProgress,
  matchOutcome,
  EPL_SEASON_GAMES,
  SEASON_GRID_CELLS,
} from '../clubPresentation'

const kickoffFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})
/**
 * Present next match, season progress and uniform recent results for the selected favorite.
 * @param props Club ID; the parent keys this component by ID to isolate saved snapshots.
 * @returns Club screen with persistent data, explicit empty/failure states and shared freshness.
 */
export function ClubPage({ teamId }: { teamId: number }) {
  const load = useCallback((signal: AbortSignal) => getClubFixtures(teamId, signal), [teamId])
  const { state, error } = useLocalDataset(load)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    // The clock changes presentation only; no request is made when the countdown ticks.
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const data = state?.fixtures
  if (!data) {
    return (
      <div className="message-panel" role="status">
        {error ?? state?.refresh_error ?? 'Waiting for your club’s fixtures…'}
      </div>
    )
  }

  // Phase 1: Derive independent season totals and match presentation from the saved snapshot.
  const { played, remaining } = seasonProgress(data.matches)
  const { next, results } = selectClubMatches(data.matches)
  const disruption = data.matches.filter(
    (match) =>
      ['POSTPONED', 'CANCELLED'].includes(match.status) &&
      match.kickoff &&
      Date.parse(match.kickoff) >= now,
  )

  // Phase 2: Render saved data; the clock only affects the kickoff label.
  return (
    <section className="club-page" aria-label="Your club matches">
      {(error || state.refresh_error) && (
        <p className="stale-message" role="status">
          {error ?? state.refresh_error} Showing saved fixture data.
        </p>
      )}
      <article className="club-feature table-card">
        <div className="club-feature-heading">
          <span className="club-eyebrow">
            {next && liveStatuses.has(next.status) ? 'Matchday' : 'Next whistle'}
          </span>
          {next && <span>Matchweek {next.matchday}</span>}
        </div>
        {next ? (
          <>
            <Matchup match={next} />
            <p className="club-countdown">{kickoffLabel(next, now)}</p>
            <p className="club-kickoff">
              {next.kickoff ? kickoffFormatter.format(new Date(next.kickoff)) : 'Date TBC'} ·{' '}
              {next.home.id === teamId ? 'Home' : 'Away'}
            </p>
          </>
        ) : (
          <p>No upcoming EPL fixture is currently available.</p>
        )}
        {disruption.map((match) => (
          <p className="club-kickoff" key={match.id}>
            {match.home.name} v {match.away.name} · {statusLabels[match.status]}
          </p>
        ))}
      </article>
      <div className="club-supporting">
        <article className="table-card club-season">
          <h2>The season so far</h2>
          <div className="season-counts">
            <div>
              <strong>{played}</strong>
              <span>Played</span>
            </div>
            <div>
              <strong>{remaining}</strong>
              <span>To play</span>
            </div>
          </div>
          <div
            className="season-track"
            role="progressbar"
            aria-label="Season games played"
            aria-valuenow={played}
            aria-valuemin={0}
            aria-valuemax={EPL_SEASON_GAMES}
            aria-valuetext={`${played} played, ${remaining} to play`}
          >
            {Array.from({ length: SEASON_GRID_CELLS }, (_, index) => {
              // The last two positions complete the grid without inventing extra fixtures.
              let cellClass: string | undefined
              if (index >= EPL_SEASON_GAMES) cellClass = 'is-unused'
              else if (index < played) cellClass = 'is-played'
              return <span key={index} className={cellClass} aria-hidden="true" />
            })}
          </div>
          <p className="club-kickoff">
            {played} of {EPL_SEASON_GAMES} EPL games complete
          </p>
        </article>
        <article className="table-card club-form club-history">
          <div className="club-history-content">
            <h2>Recent form</h2>
            <p className="club-kickoff">Last five completed EPL matches · latest first</p>
            {results.length ? (
              <ol>
                {results.map((match) => {
                  // The selector has narrowed both scores before outcome calculation.
                  const outcome = matchOutcome(match, teamId)

                  return (
                    <li key={match.id}>
                      <span
                        className={`form-mark form-${outcome.marker}`}
                        aria-label={outcome.label}
                      >
                        {outcome.marker}
                      </span>
                      <Matchup match={match} />
                      <span className="form-matchweek">Matchweek {match.matchday}</span>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p>Form will appear after completed matches.</p>
            )}
          </div>
        </article>
      </div>
      <footer className="table-footer">
        <span>EPL only · Scores update periodically</span>
        <DatasetFreshness
          datasetName="Club fixtures"
          isFresh={!error && ['fresh', 'refreshing'].includes(state.refresh_status)}
          hasError={Boolean(error || state.refresh_error)}
          lastSuccessAt={data.retrieved_at}
          nextRefreshAt={state.next_refresh_at}
        />
      </footer>
    </section>
  )
}

/**
 * Pair home/away identities around a reported score or versus marker.
 * @param props Saved match; null scores remain unavailable rather than becoming zero.
 * @returns Inward-facing club names/crests with home on the left and away on the right.
 */
function Matchup({ match }: { match: Fixture }) {
  const hasScore =
    !['TIMED', 'SCHEDULED', 'POSTPONED', 'CANCELLED'].includes(match.status) &&
    match.home_score !== null &&
    match.away_score !== null
  return (
    <div className="club-matchup">
      <div>
        <span>{match.home.name}</span>
        <TeamCrest name={match.home.name} url={match.home.crest} />
      </div>
      <strong>{hasScore ? `${match.home_score} – ${match.away_score}` : 'v'}</strong>
      <div>
        <TeamCrest name={match.away.name} url={match.away.crest} />
        <span>{match.away.name}</span>
      </div>
    </div>
  )
}
