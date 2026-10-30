/** Verify full-season outcomes and progress boundaries without live data or timers. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Fixture } from '../types'
import { seasonRecord } from '../clubPresentation'
import { SeasonJourney, SeasonRecord } from './SeasonOverview'

const match: Fixture = {
  id: 1,
  matchday: 1,
  kickoff: '2026-08-22T12:00:00Z',
  status: 'FINISHED',
  home: { id: 1, name: 'Home', crest: null },
  away: { id: 2, name: 'Away', crest: null },
  home_score: 0,
  away_score: 1,
}
afterEach(cleanup)

it('uses all season results from the club perspective and flags unknown awarded scores', () => {
  const matches = Array.from({ length: 7 }, (_, index) => ({ ...match, id: index + 1 }))
  const { container } = render(
    <SeasonRecord
      teamId={2}
      matches={[
        ...matches,
        { ...match, id: 8, status: 'AWARDED', home_score: null },
        { ...match, id: 9, status: 'IN_PLAY' },
      ]}
    />,
  )
  expect(screen.getByText('8')).toBeInTheDocument()
  expect(container.querySelectorAll('.season-results > li')).toHaveLength(42)
  expect(screen.getAllByLabelText('Not played')).toHaveLength(30)
  expect(screen.getByLabelText('Result unavailable')).toHaveTextContent('?')
  expect(container.querySelectorAll('.season-results .form-W')).toHaveLength(7)
  expect(screen.getByText('Some completed games have no reported score.')).toBeInTheDocument()
})

it('uses the provider week independently of played totals and avoids duplicate endpoint labels', () => {
  const { container, rerender } = render(<SeasonJourney matches={[]} currentMatchday={9} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '9')
  expect(container.querySelectorAll('.season-journey-dots > span')).toHaveLength(38)
  expect(container.querySelectorAll('.is-past')).toHaveLength(8)
  expect(screen.getByText('Week 9')).toBeInTheDocument()
  expect(container.querySelectorAll('.is-current')).toHaveLength(1)
  expect(screen.getByRole('region', { name: 'The season run' })).not.toHaveClass('table-card')
  expect(container.querySelector('.season-runner img')).toHaveAttribute('alt', '')
  rerender(
    <SeasonJourney
      matches={Array.from({ length: 38 }, (_, id) => ({ ...match, id }))}
      currentMatchday={38}
    />,
  )
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38')
  expect(container.querySelectorAll('.is-past')).toHaveLength(37)
  expect(screen.getAllByText('Week 38')).toHaveLength(1)
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Week 38 of 38; 38 games played, 0 to play',
  )
})

it('orders season outcomes without mutating input and preserves unknown, awarded and zero-score results', () => {
  const matches: Fixture[] = [
    { ...match, id: 2, kickoff: '2026-08-24T12:00:00Z' },
    { ...match, id: 5, kickoff: '2026-08-23T12:00:00Z', away_score: null },
    { ...match, id: 6, status: 'POSTPONED' },
    { ...match, id: 4, status: 'AWARDED', home_score: 0, away_score: 0 },
    { ...match, id: 3, kickoff: '2026-08-21T12:00:00Z', home: match.away, away: match.home },
  ]
  const record = seasonRecord(matches, 2)
  expect(record).toMatchObject({ played: 4, remaining: 34, hasMissingResults: true })
  expect(record.results.map((result) => result.marker)).toEqual(['L', 'D', '?', 'W'])
  expect(matches.map((fixture) => fixture.id)).toEqual([2, 5, 6, 4, 3])
})
