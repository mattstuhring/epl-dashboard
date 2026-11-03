/**
 * Present a complete round consistently in both current-match and next-round views.
 * Shared date bands and rows preserve scores, statuses and favorite highlighting.
 */
import { groupFixturesByDay } from '../fixturePresentation'
import type { Fixture } from '../types'
import { FixtureRow } from './FixtureList'

/**
 * Render one complete round, including undated and disrupted matches.
 */
export function FixtureRound({
  matches,
  week,
  context,
  favoriteTeamId,
}: {
  matches: readonly Fixture[]
  week: number
  context: string
  favoriteTeamId: number | null
}) {
  const selected = matches.filter((match) => match.matchday === week)
  return (
    <article className="table-card matchweek-card">
      <header className="matchweek-header">
        <div>
          <span className="fixture-view-context">{context}</span>
          <h2>Matchweek {week}</h2>
        </div>
        <span>
          {selected.length} {selected.length === 1 ? 'match' : 'matches'}
        </span>
      </header>
      {selected.length ? (
        groupFixturesByDay(selected).map((day) => (
          <section className="fixture-day" key={day.key} aria-label={day.label}>
            <h3 className="fixture-day-heading">{day.label}</h3>
            <ol className="fixture-list">
              {day.matches.map((match) => (
                <FixtureRow key={match.id} match={match} favoriteTeamId={favoriteTeamId} />
              ))}
            </ol>
          </section>
        ))
      ) : (
        <p className="message-panel">No fixtures are available for this matchweek.</p>
      )}
    </article>
  )
}
