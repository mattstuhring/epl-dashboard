import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { StandingsResponse, StandingsStateResponse } from './types'

const standings: StandingsResponse = {
  competition_id: 2021,
  competition_code: 'PL',
  competition_name: 'Premier League',
  season_id: 733,
  season_start: '2025-08-15',
  season_end: '2026-05-24',
  current_matchday: 6,
  rows: [
    {
      position: 1,
      team_id: 66,
      team_name: 'Manchester United FC',
      played: 6,
      won: 5,
      drawn: 1,
      lost: 0,
      goals_for: 12,
      goals_against: 3,
      goal_difference: 9,
      points: 16,
    },
    {
      position: 2,
      team_id: 57,
      team_name: 'Arsenal FC',
      played: 6,
      won: 5,
      drawn: 0,
      lost: 1,
      goals_for: 10,
      goals_against: 4,
      goal_difference: 6,
      points: 15,
    },
  ],
  retrieved_at: '2026-10-19T12:00:00Z',
}

function stateResponse(
  data: StandingsResponse | null,
  status: StandingsStateResponse['refresh_status'],
  refreshError: string | null = null,
): StandingsStateResponse {
  return {
    standings: data,
    refresh_status: status,
    last_attempt_at: '2026-10-19T12:00:00Z',
    last_success_at: data?.retrieved_at ?? null,
    next_refresh_at: '2026-10-20T00:00:00Z',
    refresh_error: refreshError,
  }
}

function mockState(data: StandingsStateResponse = stateResponse(standings, 'fresh')) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => data }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('standings dashboard', () => {
  it('shows a loading state while the local API request is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading the latest league table')
  })

  it('renders standings, defaults the favorite, and saves a changed favorite', async () => {
    mockState()

    render(<App />)

    expect(await screen.findByRole('row', { name: /Manchester United FC/ })).toHaveClass('favorite-row')
    expect(screen.getByRole('columnheader', { name: 'Pts' })).toBeInTheDocument()
    expect(screen.getByText('+9')).toBeInTheDocument()
    expect(screen.getByText(/Up to date/)).toBeInTheDocument()
    expect(screen.getByText(/Next attempt:/)).toHaveTextContent('Oct 19, 2026, 5:00 PM')
    expect(screen.getByText(/Last successful update|Up to date/)).toHaveTextContent(
      'Oct 19, 2026, 5:00 AM',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Favorite club' }), {
      target: { value: '57' },
    })

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Arsenal FC/ })).toHaveClass('favorite-row')
      expect(screen.getByRole('row', { name: /Manchester United FC/ })).not.toHaveClass('favorite-row')
      expect(window.localStorage.getItem('epl.favoriteTeamId')).toBe('57')
    })
  })

  it('distinguishes a valid empty table from an error', async () => {
    mockState(stateResponse({ ...standings, rows: [] }, 'fresh'))

    render(<App />)

    expect(await screen.findByText('No standings are available for this season yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the backend refresh failure without replacing the successful table', async () => {
    mockState(
      stateResponse(
        standings,
        'stale',
        'The latest standings refresh failed; showing the last successful data.',
      ),
    )

    render(<App />)

    expect(await screen.findByText(/latest standings refresh failed/i)).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText(/Last successful update/)).toBeInTheDocument()
    expect(screen.getByText(/Next attempt:/)).toBeInTheDocument()
  })

  it('explains when the next attempt is not scheduled', async () => {
    const response = stateResponse(standings, 'fresh')
    response.next_refresh_at = null
    mockState(response)

    render(<App />)

    expect(await screen.findByText(/Next attempt:/)).toHaveTextContent('not scheduled')
  })

  it('polls local refresh state and updates the displayed table', async () => {
    const updatedStandings = {
      ...standings,
      rows: standings.rows.map((row) =>
        row.team_id === 66 ? { ...row, points: 19 } : row,
      ),
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => stateResponse(standings, 'fresh'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => stateResponse(updatedStandings, 'fresh'),
      })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()

    render(<App />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByRole('cell', { name: '16' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('cell', { name: '19' })).toBeInTheDocument()
  })

  it('shows a local API error when the backend cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Backend connection failed.')))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend connection failed.')
  })
})


it('provides rotation controls and pauses when a tab is selected', async () => {
  mockState()
  render(<App />)
  fireEvent.click(screen.getByRole('switch', { name: 'Auto-rotate' }))
  expect(screen.getByRole('switch', { name: 'Auto-rotate' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Matchweeks' }))
  expect(screen.getByRole('switch', { name: 'Auto-rotate' })).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('heading', { name: 'Matchweeks', level: 1 })).toBeInTheDocument()
  expect(window.localStorage.getItem('epl.rotationEnabled')).toBe('false')
  const favoritePicker = await screen.findByRole('combobox', { name: 'Favorite club' })
  fireEvent.change(favoritePicker, { target: { value: '57' } })
  expect(window.localStorage.getItem('epl.favoriteTeamId')).toBe('57')
})


it('shows all twenty ranks in two panels with shared controls and a favorite in the lower half', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...standings.rows[0], position: index + 1, team_id: 1000 + index,
    team_name: `Club ${index + 1}`,
  })).reverse()
  mockState(stateResponse({ ...standings, rows }, 'fresh'))
  render(<App />)

  const top = await screen.findByRole('table', { name: 'Top' })
  const bottom = screen.getByRole('table', { name: 'Bottom' })
  expect(within(top).getAllByRole('row')).toHaveLength(11)
  expect(within(bottom).getAllByRole('row')).toHaveLength(11)
  expect(within(top).getAllByRole('rowheader').map(cell => cell.textContent?.trim())).toEqual(
    Array.from({ length: 10 }, (_, i) => `CL Club ${i + 1}`),
  )
  expect(within(bottom).getByRole('row', { name: /Club 20/ })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Favorite club' }), { target: { value: '1014' } })
  expect(within(bottom).getByRole('row', { name: /Club 15/ })).toHaveClass('favorite-row')
  expect(screen.getAllByRole('combobox', { name: 'Favorite club' })).toHaveLength(1)
  expect(screen.getAllByRole('group', { name: 'Standings data freshness' })).toHaveLength(1)
})
