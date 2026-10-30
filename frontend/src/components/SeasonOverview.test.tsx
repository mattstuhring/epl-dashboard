/** Verify full-season outcomes and progress boundaries without live data or timers. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Fixture } from '../types'
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
  expect(container.querySelectorAll('.season-results > li')).toHaveLength(40)
  expect(screen.getAllByLabelText('Not played')).toHaveLength(30)
  expect(screen.getByLabelText('Result unavailable')).toHaveTextContent('?')
  expect(container.querySelectorAll('.season-results .form-W')).toHaveLength(7)
  expect(screen.getByText('Some completed games have no reported score.')).toBeInTheDocument()
})

it('uses the provider week independently of played totals and avoids duplicate endpoint labels', () => {
  const { container, rerender } = render(<SeasonJourney matches={[]} currentMatchday={9} />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '9')
  expect(container.querySelectorAll('.season-journey-dots > span')).toHaveLength(38)
  expect(container.querySelectorAll('.is-played')).toHaveLength(8)
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
  expect(container.querySelectorAll('.is-played')).toHaveLength(37)
  expect(screen.getAllByText('Week 38')).toHaveLength(1)
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Week 38 of 38; 38 games played, 0 to play',
  )
})
