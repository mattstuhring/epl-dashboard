import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Matchweeks } from './Matchweeks'
import { TeamCrest } from './TeamCrest'

const fixture = {
  id: 1,
  matchday: 8,
  kickoff: '2026-10-24T17:00:00Z',
  status: 'FINISHED',
  home: { id: 66, name: 'Manchester United', crest: 'https://example.org/united.svg' },
  away: { id: 57, name: 'Arsenal', crest: null },
  home_score: 0,
  away_score: 2,
}
const state = {
  fixtures: {
    season_id: 2026,
    current_matchday: 8,
    retrieved_at: '2026-10-24T18:00:00Z',
    matches: [
      fixture,
      { ...fixture, id: 2, matchday: 9, status: 'TIMED', home_score: null, away_score: null },
    ],
  },
  refresh_status: 'fresh',
  next_refresh_at: '2026-10-24T18:30:00Z',
  refresh_error: null,
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows numbered matchweeks, scores including zero, local kickoffs, crests and favorite highlighting', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => state }))
  const { container } = render(<Matchweeks favoriteTeamId={66} />)
  expect(await screen.findByRole('heading', { name: 'Matchweek 8' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Matchweek 9' })).toBeInTheDocument()
  expect(screen.getByText('0 – 2')).toBeInTheDocument()
  expect(screen.getByText('10:00 AM')).toBeInTheDocument()
  expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
  expect(container.querySelectorAll('.fixture-meta')).toHaveLength(0)
  expect(screen.getByText('FT').closest('.fixture-status')).not.toBeNull()
  expect(container.querySelectorAll('.fixture-status')).toHaveLength(2)
  expect(container.querySelectorAll('.fixture-status')[1]).toBeEmptyDOMElement()
  expect(screen.getByText('FT')).toBeInTheDocument()
  expect(container.querySelectorAll('.favorite-fixture')).toHaveLength(2)
  expect(container.querySelectorAll('img')).toHaveLength(2)
  expect(screen.getByRole('group', { name: 'Fixtures data freshness' })).toBeInTheDocument()
})

it('preserves a visible provider error without showing an empty successful schedule', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...state,
        fixtures: null,
        refresh_status: 'error',
        refresh_error: 'Fixture refresh failed.',
      }),
    }),
  )
  render(<Matchweeks favoriteTeamId={null} />)
  expect(await screen.findByText('Fixture data is not available yet.')).toBeInTheDocument()
  expect(screen.getByText('Fixture refresh failed.')).toBeInTheDocument()
})

it('uses an initials fallback when an image fails', async () => {
  const { container } = render(
    <TeamCrest name="Manchester United" url="https://example.org/united.svg" />,
  )
  fireEvent.error(container.querySelector('img')!)
  await waitFor(() => expect(screen.getByText('MA')).toBeInTheDocument())
})

it('groups by Pacific calendar day across UTC midnight and keeps unknown dates separate', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...state,
        fixtures: {
          ...state.fixtures,
          matches: [
            { ...fixture, id: 4, kickoff: null, status: 'POSTPONED' },
            { ...fixture, id: 3, kickoff: '2026-10-25T08:00:00Z' },
            { ...fixture, id: 2, kickoff: '2026-10-25T01:00:00Z' },
            fixture,
          ],
        },
      }),
    }),
  )
  const { container } = render(<Matchweeks favoriteTeamId={66} />)
  expect(await screen.findByRole('heading', { name: 'Sat, Oct 24' })).toBeInTheDocument()
  const groups = container.querySelectorAll('.fixture-day')
  expect([...groups].map((group) => group.getAttribute('aria-label'))).toEqual([
    'Sat, Oct 24',
    'Sun, Oct 25',
    'Date TBC',
  ])
  expect(groups[0].querySelectorAll('.fixture-row')).toHaveLength(2)
  expect(screen.getAllByText('Sat, Oct 24')).toHaveLength(1)
  expect(screen.getByText('Postponed')).toBeInTheDocument()
  expect(container.querySelectorAll('.favorite-fixture')).toHaveLength(4)
})
