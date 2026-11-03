/**
 * Own the current-round hub, including finished, live and still-scheduled fixtures.
 * Matchday is a screen identity, not a restriction to one calendar date.
 */
import type { FixturesState } from '../types'
import { FixtureRound } from './FixtureRound'

/**
 * Follow the API-selected round; all its games remain visible until that round advances.
 */
export function Matchday({
  data,
  favoriteTeamId,
}: {
  data: NonNullable<FixturesState['fixtures']>
  favoriteTeamId: number | null
}) {
  return (
    <section className="matchday-page" aria-label="Premier League matchday">
      <FixtureRound
        matches={data.matches}
        week={data.current_matchday}
        context="Current round"
        favoriteTeamId={favoriteTeamId}
      />
    </section>
  )
}
