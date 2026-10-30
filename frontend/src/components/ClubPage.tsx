/**
 * Give the selected club a matchday focus using its locally stored EPL season.
 * Countdown ticks are browser-only; provider status owns in-play and final states.
 */
import { useCallback, useEffect, useState } from 'react'
import { getClubFixtures } from '../api'
import { useLocalDataset } from '../hooks/useLocalDataset'
import type { Fixture, FixtureTeam, StandingsResponse, StandingsRow } from '../types'
import { DatasetFreshness } from './DatasetFreshness'
import { TeamCrest } from './TeamCrest'
import { SeasonJourney, SeasonRecord } from './SeasonOverview'
import {
  liveStatuses,
  statusLabels,
  selectClubMatches,
  kickoffLabel,
  matchOutcome,
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
 * @param props Club ID and shared saved standings; the parent keys fixtures by club ID.
 * @returns Club screen with persistent data, explicit empty/failure states and shared freshness.
 */
export function ClubPage({
  teamId,
  standings = null,
}: {
  teamId: number
  standings?: StandingsResponse | null
}) {
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
  const { next, results } = selectClubMatches(data.matches)
  // Independent snapshots must refer to the same season before showing comparison totals.
  const tableRows = standings?.season_id === data.season_id ? standings.rows : []
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
          <div className="club-preview-grid">
            <PreviewTeam
              team={next.home}
              row={tableRows.find((row) => row.team_id === next.home.id)}
            />
            <div className="club-preview-center">
              {liveStatuses.has(next.status) &&
                next.home_score !== null &&
                next.away_score !== null && (
                  <strong className="club-preview-score">
                    {next.home_score} – {next.away_score}
                  </strong>
                )}
              <KickoffCountdown match={next} now={now} />
              <p className="club-kickoff">
                {next.kickoff ? kickoffFormatter.format(new Date(next.kickoff)) : 'Date TBC'}
              </p>
              <p className="club-preview-venue">{next.home.id === teamId ? 'Home' : 'Away'}</p>
            </div>
            <PreviewTeam
              team={next.away}
              row={tableRows.find((row) => row.team_id === next.away.id)}
            />
          </div>
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
        <SeasonRecord matches={data.matches} teamId={teamId} />
      </div>
      <SeasonJourney matches={data.matches} currentMatchday={data.current_matchday} />
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
 * Present one next-match club with its saved season record, without inventing missing totals.
 * @param props Fixture identity and matching-season standings row, when available.
 * @returns Crest/name group with league position and W/D/L beneath it.
 */
function PreviewTeam({ team, row }: { team: FixtureTeam; row?: StandingsRow }) {
  const suffixes: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
  const position = row
    ? `${row.position}${suffixes[new Intl.PluralRules('en', { type: 'ordinal' }).select(row.position)]}`
    : null
  return (
    <div className="club-preview-team">
      <TeamCrest name={team.name} url={team.crest} />
      <h3>{team.name}</h3>
      {row ? (
        <div
          className="club-preview-record"
          aria-label={`${team.name}: ${position}, ${row.won} wins, ${row.drawn} draws, ${row.lost} losses`}
        >
          <strong>{position}</strong>
          <span aria-hidden="true">·</span>
          <span>W {row.won}</span>
          <span>D {row.drawn}</span>
          <span>L {row.lost}</span>
        </div>
      ) : (
        <p className="club-preview-record">Standings unavailable</p>
      )}
    </div>
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

/**
 * Render the existing countdown as a broadcast score strip, retaining a readable status fallback.
 * @param props Selected saved match and current local clock instant.
 * @returns Three labelled time blocks, or the provider/unknown-time status without invented timing.
 */
function KickoffCountdown({ match, now }: { match: Fixture; now: number }) {
  const label = kickoffLabel(match, now)
  const parts = label.match(/^(\d+)d · (\d+)h · (\d+)m$/)
  if (!parts) return <p className="club-countdown countdown-status">{label}</p>

  const units = ['Days', 'Hours', 'Mins']
  return (
    <div className="club-countdown countdown-blocks" aria-label={label}>
      {units.map((unit, index) => (
        <span key={unit}>
          <strong>{parts[index + 1].padStart(2, '0')}</strong>
          <small>{unit}</small>
        </span>
      ))}
    </div>
  )
}
