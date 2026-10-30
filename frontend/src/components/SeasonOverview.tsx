/**
 * Present the full saved season record and a separate 38-game progress journey.
 * These views reuse club fixtures; neither introduces polling or provider calls.
 */
import { useId, type CSSProperties } from 'react'
import seasonRunner from '../assets/illustrations/season-run-player.png'
import type { Fixture } from '../types'
import { EPL_SEASON_GAMES, matchOutcome, seasonProgress, seasonResults } from '../clubPresentation'

/**
 * Keep the original played/remaining counters and five-by-eight season grid.
 * @param props Full club season and favorite identity for W/D/L colors and letters.
 * @returns Thirty-eight game cells and two unused spaces; missing scores stay unknown.
 */
export function SeasonRecord({ matches, teamId }: { matches: Fixture[]; teamId: number }) {
  const outcomes = new Map(
    seasonResults(matches).map((match) => [match.id, matchOutcome(match, teamId)]),
  )
  const completed = matches
    .filter((match) => ['FINISHED', 'AWARDED'].includes(match.status))
    .sort((a, b) => (a.kickoff ?? '9999').localeCompare(b.kickoff ?? '9999') || a.id - b.id)
  const { played, remaining } = seasonProgress(matches)
  return (
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
      <ol className="season-results" aria-label="Full season results, oldest first">
        {Array.from({ length: 5 * 8 }, (_, index) => {
          if (index >= EPL_SEASON_GAMES)
            return <li key={index} className="is-unused" aria-hidden="true" />
          const match = index < played ? completed[index] : undefined
          const outcome = match ? outcomes.get(match.id) : undefined
          let label = 'Not played'
          if (match) label = outcome?.label ?? 'Result unavailable'
          return (
            <li
              key={index}
              className={outcome ? `form-${outcome.marker}` : 'season-result-pending'}
              aria-label={label}
            >
              {outcome?.marker ?? (match ? '?' : '')}
            </li>
          )
        })}
      </ol>
      <p className="club-kickoff">
        {played} of {EPL_SEASON_GAMES} EPL games complete
      </p>
      {completed.slice(0, played).some((match) => !outcomes.has(match.id)) && (
        <p className="club-kickoff">Some completed games have no reported score.</p>
      )}
    </article>
  )
}

/**
 * Show provider matchweek progress with a footballer above the current week.
 * @param props Saved club fixtures for played totals, plus the provider-selected current matchweek.
 * @returns Accessible week progress out of 38; played totals remain independent of postponements.
 */
export function SeasonJourney({
  matches,
  currentMatchday,
}: {
  matches: Fixture[]
  currentMatchday: number
}) {
  const crispFilterId = useId()
  const { played, remaining } = seasonProgress(matches)
  const week = Math.min(EPL_SEASON_GAMES, Math.max(1, currentMatchday))
  const marker = ((week - 0.5) / EPL_SEASON_GAMES) * 100
  const style = { '--journey-position': `${marker}%` } as CSSProperties
  return (
    <section className="season-journey" aria-label="The season run" style={style}>
      <header>
        <h2>The season run</h2>
        <p>
          <strong>{played}</strong> played <span>·</span> <strong>{remaining}</strong> to go
        </p>
      </header>
      <div
        className="season-journey-track"
        role="progressbar"
        aria-label="Season matchweek"
        aria-valuenow={week}
        aria-valuemin={1}
        aria-valuemax={EPL_SEASON_GAMES}
        aria-valuetext={`Week ${week} of 38; ${played} games played, ${remaining} to play`}
      >
        <svg
          className="season-runner-filter"
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id={crispFilterId}>
              {/* Remove the generated asset's translucent halo without dimming the solid silhouette. */}
              <feComponentTransfer result="crispSilhouette">
                <feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1" />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>
        <div className="season-runner" aria-hidden="true">
          <div className="season-runner-trails">
            <span />
            <span />
            <span />
          </div>
          <img src={seasonRunner} alt="" style={{ filter: `url(#${crispFilterId})` }} />
        </div>
        <div className="season-journey-dots" aria-hidden="true">
          {Array.from({ length: EPL_SEASON_GAMES }, (_, index) => (
            <span
              key={index}
              className={[
                index < week - 1 ? 'is-played' : '',
                index === week - 1 ? 'is-current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {index === week - 1 && <WeekBall />}
            </span>
          ))}
        </div>
      </div>
      <div className="season-journey-labels">
        <span>Week 1</span>
        {week > 1 && week < EPL_SEASON_GAMES && (
          <span className="season-journey-position">Week {week}</span>
        )}
        <span>Week 38</span>
      </div>
    </section>
  )
}

/**
 * Draw the current-week marker as a flat mint football, without a separate image request.
 * @returns Decorative panel pattern; the parent progressbar provides the accessible week label.
 */
function WeekBall() {
  return (
    <svg className="season-week-ball" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="47" fill="var(--accent)" stroke="var(--hero)" strokeWidth="4" />
      <path d="M50 30 69 44 62 67 38 67 31 44Z" fill="var(--hero)" />
      {/* Five evenly spaced perimeter panels and seams keep the ball balanced at icon size. */}
      {[0, 72, 144, 216, 288].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 50 50)`}>
          <path d="M29 8 Q50 -1 71 8 L50 18Z" fill="var(--hero)" />
          <path d="M50 18V31" stroke="var(--hero)" strokeWidth="3.5" />
        </g>
      ))}
    </svg>
  )
}
