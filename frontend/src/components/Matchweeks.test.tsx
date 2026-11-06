import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Matchweeks } from './Matchweeks'
import { Matchday } from './Matchday'
import { FixturePages } from './FixturePages'
import { TeamCrest } from './TeamCrest'
import type { Fixture } from '../types'

const fixture: Fixture = {
  id: 1,
  matchday: 8,
  kickoff: '2026-10-24T17:00:00Z',
  status: 'FINISHED',
  home: { id: 66, name: 'Manchester United', crest: 'https://example.org/united.svg' },
  away: { id: 57, name: 'Arsenal', crest: null },
  home_score: 0,
  away_score: 2,
}
const data = {
  season_id: 2026,
  current_matchday: 8,
  retrieved_at: '2026-10-24T18:00:00Z',
  matches: [
    fixture,
    { ...fixture, id: 2, matchday: 9, status: 'TIMED', home_score: null, away_score: null },
  ],
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows the whole current round with completed, live and future fixtures across dates', () => {
  render(
    <Matchday
      data={{
        ...data,
        matches: [
          fixture,
          {
            ...fixture,
            id: 3,
            status: 'IN_PLAY',
            kickoff: '2026-10-25T16:00:00Z',
            home_score: 1,
            away_score: 0,
          },
          {
            ...fixture,
            id: 4,
            status: 'TIMED',
            kickoff: '2026-10-26T17:00:00Z',
            home_score: null,
            away_score: null,
          },
          data.matches[1],
        ],
      }}
      favoriteTeamId={66}
    />,
  )
  expect(screen.getByText('Matchweek 8')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Current round' })).toBeInTheDocument()
  expect(screen.getByText('0 – 2')).toBeInTheDocument()
  expect(screen.getByText('1 – 0')).toBeInTheDocument()
  expect(screen.getByLabelText('In play')).toHaveTextContent('LIVE')
  expect(screen.getByLabelText('Full-time')).toHaveTextContent('FT')
  expect(screen.getByText('10:00 AM')).toBeInTheDocument()
  expect(screen.queryByText('Matchweek 9')).not.toBeInTheDocument()
})

it('shows only the following round and advances with the provider-selected round', () => {
  const { rerender } = render(<Matchweeks data={data} favoriteTeamId={66} />)
  expect(screen.getByText('Matchweek 9')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Next round' })).toBeInTheDocument()
  expect(screen.queryByText('0 – 2')).not.toBeInTheDocument()
  expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
  rerender(<Matchweeks data={{ ...data, current_matchday: 9 }} favoriteTeamId={66} />)
  expect(screen.getByText('Matchweek 10')).toBeInTheDocument()
  expect(screen.getByText('No fixtures are available for this matchweek.')).toBeInTheDocument()
  rerender(<Matchweeks data={{ ...data, current_matchday: 38 }} favoriteTeamId={66} />)
  expect(screen.getByText(/final matchweek/)).toBeInTheDocument()
  expect(screen.queryByText('Matchweek 39')).not.toBeInTheDocument()
})

it('keeps Pacific date bands, unknown dates and favorite highlighting', () => {
  const { container } = render(
    <Matchday
      data={{
        ...data,
        matches: [
          { ...fixture, id: 4, kickoff: null, status: 'POSTPONED' },
          { ...fixture, id: 3, kickoff: '2026-10-25T08:00:00Z' },
          { ...fixture, id: 2, kickoff: '2026-10-25T01:00:00Z' },
          fixture,
        ],
      }}
      favoriteTeamId={66}
    />,
  )
  const groups = container.querySelectorAll('.fixture-day')
  expect([...groups].map((group) => group.getAttribute('aria-label'))).toEqual([
    'Sat, Oct 24, 2026',
    'Sun, Oct 25, 2026',
    'Date TBC',
  ])
  expect(groups[0].querySelectorAll('.fixture-row')).toHaveLength(2)
  expect(screen.getByText('Postponed')).toBeInTheDocument()
  expect(container.querySelectorAll('.favorite-fixture')).toHaveLength(4)
})

it('updates the current-round hub when the provider advances rather than using the date', () => {
  const { rerender } = render(<Matchday data={data} favoriteTeamId={66} />)
  expect(screen.getByText('0 – 2')).toBeInTheDocument()
  rerender(<Matchday data={{ ...data, current_matchday: 9 }} favoriteTeamId={66} />)
  expect(screen.getByText('Matchweek 9')).toBeInTheDocument()
  expect(screen.queryByText('0 – 2')).not.toBeInTheDocument()
})

it('shares one current/next poll between both screens and retains freshness', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      fixtures: data,
      refresh_status: 'fresh',
      next_refresh_at: null,
      refresh_error: null,
    }),
  })
  vi.stubGlobal('fetch', fetcher)
  const { rerender } = render(<FixturePages favoriteTeamId={66} view="fixtures" />)
  expect(await screen.findByText('Matchweek 9')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'Fixtures data freshness' })).toBeInTheDocument()
  rerender(<FixturePages favoriteTeamId={66} view="matchday" />)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][0]).toBe('/api/fixtures')
})

it('shows an initial provider failure without a successful empty schedule', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fixtures: null,
        refresh_status: 'error',
        refresh_error: 'Fixture refresh failed.',
      }),
    }),
  )
  render(<FixturePages favoriteTeamId={null} view="fixtures" />)
  await waitFor(() =>
    expect(screen.getAllByText('Fixture data is not available yet.')).toHaveLength(2),
  )
  expect(screen.queryByText('Matchweek 8')).not.toBeInTheDocument()
})

it('uses initials when a crest fails', async () => {
  const { container } = render(
    <TeamCrest name="Manchester United" url="https://example.org/united.svg" />,
  )
  fireEvent.error(container.querySelector('img')!)
  await waitFor(() => expect(screen.getByText('MA')).toBeInTheDocument())
})
