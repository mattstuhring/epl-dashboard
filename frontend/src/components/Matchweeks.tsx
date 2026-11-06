/**
 * Own the outlook for the round immediately after the API-selected current round.
 * Retain actual provider statuses even when a following-round fixture finishes early.
 */
import type { FixturesState } from '../types'
import { FixtureRound } from './FixtureRound'

/**
 * Show the following round without creating a nonexistent round 39 at season end.
 */
export function Matchweeks({
  data,
  favoriteTeamId,
}: {
  data: NonNullable<FixturesState['fixtures']>
  favoriteTeamId: number | null
}) {
  return (
    <section className="matchweek-page" aria-label="Premier League matchweek">
      {data.current_matchday < 38 ? (
        <FixtureRound
          matches={data.matches}
          week={data.current_matchday + 1}
          title="Next round"
          favoriteTeamId={favoriteTeamId}
        />
      ) : (
        <p className="message-panel">
          This is the final matchweek. No following round is scheduled in this season.
        </p>
      )}
    </section>
  )
}
