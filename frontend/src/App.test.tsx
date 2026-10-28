import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute('open', '')
    },
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    },
  },
})
const fixtureResponse = {
  ok: true,
  json: async () => ({ fixtures: null, refresh_status: 'pending', refresh_error: null }),
}
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open dashboard menu' }))
}
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
    vi
      .fn()
      .mockImplementation((url) =>
        Promise.resolve(
          url === '/api/fixtures' ? fixtureResponse : { ok: true, json: async () => data },
        ),
      ),
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
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )

    render(<App />)

    expect(screen.getByText('Loading the latest league table…')).toBeInTheDocument()
  })

  it('renders standings, defaults the favorite, and saves a changed favorite', async () => {
    mockState()

    render(<App />)

    expect(await screen.findByRole('row', { name: /Manchester United FC/ })).toHaveClass(
      'favorite-row',
    )
    expect(screen.getByRole('columnheader', { name: 'Pts' })).toBeInTheDocument()
    expect(screen.getByText('+9')).toBeInTheDocument()
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
    openMenu()

    fireEvent.change(screen.getByRole('combobox', { name: 'Favorite club' }), {
      target: { value: '57' },
    })

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Arsenal FC/ })).toHaveClass('favorite-row')
      expect(screen.getByRole('row', { name: /Manchester United FC/ })).not.toHaveClass(
        'favorite-row',
      )
      expect(window.localStorage.getItem('epl.favoriteTeamId')).toBe('57')
    })
  })

  it('distinguishes a valid empty table from an error', async () => {
    mockState(stateResponse({ ...standings, rows: [] }, 'fresh'))

    render(<App />)

    expect(
      await screen.findByText('No standings are available for this season yet.'),
    ).toBeInTheDocument()
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
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
    expect(screen.getByText(/Check due/)).toBeInTheDocument()
  })

  it('explains when the next attempt is not scheduled', async () => {
    const response = stateResponse(standings, 'fresh')
    response.next_refresh_at = null
    mockState(response)

    render(<App />)

    expect(await screen.findByText(/No check scheduled/)).toBeInTheDocument()
  })

  it('polls local refresh state and updates the displayed table', async () => {
    const updatedStandings = {
      ...standings,
      rows: standings.rows.map((row) => (row.team_id === 66 ? { ...row, points: 19 } : row)),
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => stateResponse(standings, 'fresh'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => stateResponse(updatedStandings, 'fresh'),
      })
    vi.stubGlobal('fetch', (url: string) =>
      url === '/api/fixtures' ? Promise.resolve(fixtureResponse) : fetchMock(url),
    )
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
  openMenu()
  fireEvent.click(screen.getByRole('switch', { name: 'Auto-rotate' }))
  expect(screen.getByRole('switch', { name: 'Auto-rotate' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Matchweeks' }))
  openMenu()
  expect(screen.getByRole('switch', { name: 'Auto-rotate' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  expect(screen.getByRole('heading', { name: 'Matchweeks', level: 1 })).toBeInTheDocument()
  expect(window.localStorage.getItem('epl.rotationEnabled')).toBe('false')
  const favoritePicker = await screen.findByRole('combobox', { name: 'Favorite club' })
  fireEvent.change(favoritePicker, { target: { value: '57' } })
  expect(window.localStorage.getItem('epl.favoriteTeamId')).toBe('57')
})

it('shows all twenty ranks in two panels with shared controls and a favorite in the lower half', async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    ...standings.rows[0],
    position: index + 1,
    team_id: 1000 + index,
    team_name: `Club ${index + 1}`,
  })).reverse()
  mockState(stateResponse({ ...standings, rows }, 'fresh'))
  render(<App />)

  const top = await screen.findByRole('table', { name: 'Top' })
  const bottom = screen.getByRole('table', { name: 'Bottom' })
  expect(within(top).getAllByRole('row')).toHaveLength(11)
  expect(within(bottom).getAllByRole('row')).toHaveLength(11)
  expect(
    within(top)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent?.trim()),
  ).toEqual(Array.from({ length: 10 }, (_, i) => `CL Club ${i + 1}`))
  expect(within(bottom).getByRole('row', { name: /Club 20/ })).toBeInTheDocument()
  openMenu()
  fireEvent.change(screen.getByRole('combobox', { name: 'Favorite club' }), {
    target: { value: '1014' },
  })
  expect(within(bottom).getByRole('row', { name: /Club 15/ })).toHaveClass('favorite-row')
  expect(screen.getAllByRole('combobox', { name: 'Favorite club' })).toHaveLength(1)
  expect(screen.getAllByRole('group', { name: 'Standings data freshness' })).toHaveLength(1)
})

it('keeps fixture data mounted between screen changes without refetching', async () => {
  mockState()
  render(<App />)
  await screen.findByRole('table')
  const initialRequests = vi.mocked(fetch).mock.calls.length
  openMenu()
  fireEvent.click(screen.getByRole('button', { name: 'Matchweeks' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  openMenu()
  fireEvent.click(screen.getByRole('button', { name: 'League table' }))
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(vi.mocked(fetch).mock.calls.length).toBe(initialRequests)
})

it('edits the supporter signature across screens and restores it after reload', async () => {
  mockState()
  const first = render(<App />)
  await screen.findByRole('group', { name: 'STUHRING, number 9, following Manchester United FC' })
  openMenu()
  fireEvent.change(screen.getByLabelText('Surname'), { target: { value: "O'Neill" } })
  fireEvent.change(screen.getByLabelText('Shirt number'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('Shirt number'), { target: { value: 'xx' } })
  expect(screen.getByLabelText('Shirt number')).toHaveValue('10')
  fireEvent.click(screen.getByRole('button', { name: 'Matchweeks' }))
  expect(
    screen.getByRole('group', { name: "O'NEILL, number 10, following Manchester United FC" }),
  ).toBeInTheDocument()
  expect(localStorage.getItem('epl.supporterSurname')).toBe("O'Neill")
  expect(localStorage.getItem('epl.supporterNumber')).toBe('10')
  first.unmount()
  render(<App />)
  await screen.findByRole('group', { name: "O'NEILL, number 10, following Manchester United FC" })
  openMenu()
  fireEvent.change(screen.getByLabelText('Surname'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Shirt number'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close dashboard menu' }))
  const signature = screen.getByRole('group', { name: 'following Manchester United FC' })
  expect(within(signature).queryByText("O'NEILL")).not.toBeInTheDocument()
  expect(signature.querySelector('.supporter-number')).toBeNull()
})
