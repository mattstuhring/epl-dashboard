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
  title,
  favoriteTeamId,
}: {
  matches: readonly Fixture[]
  week: number
  title: string
  favoriteTeamId: number | null
}) {
  const selected = matches.filter((match) => match.matchday === week)
  return (
    <article className="table-card matchweek-card">
      <header className="matchweek-header">
        <h2>{title}</h2>
        <span>Matchweek {week}</span>
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
