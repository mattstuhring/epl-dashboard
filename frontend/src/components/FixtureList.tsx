/**
 * Share matchup presentation across the current-round and next-round views.
 * Provider statuses and nullable scores retain their meaning in either layout.
 */
import type { Fixture } from '../types'
import { TeamCrest } from './TeamCrest'

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  minute: '2-digit',
})
const statusLabels: Record<string, string> = {
  FINISHED: 'FT',
  IN_PLAY: 'LIVE',
  PAUSED: 'HT',
  LIVE: 'LIVE',
  POSTPONED: 'Postponed',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
  AWARDED: 'Awarded',
  SCHEDULED: 'Time to be confirmed',
  TIMED: 'Scheduled',
}

/**
 * Present one matchup beneath its shared date heading, retaining individual provider status.
 * @param props Normalized match and selected favorite identity.
 * @returns A stable list row; unknown scores are never rendered as zero.
 */
export function FixtureRow({
  match,
  favoriteTeamId,
}: {
  match: Fixture
  favoriteTeamId: number | null
}) {
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
      <span className={`fixture-status ${inPlay ? 'match-in-play' : ''}`}>
        {match.status !== 'TIMED' && (
          <span
            aria-label={
              match.status === 'PAUSED'
                ? 'Half-time'
                : match.status === 'FINISHED'
                  ? 'Full-time'
                  : inPlay
                    ? 'In play'
                    : undefined
            }
          >
            {statusLabels[match.status] ?? match.status.replaceAll('_', ' ')}
          </span>
        )}
      </span>
    </li>
  )
}
