/** Verify match selection and countdown states independently of live API access. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Fixture } from '../types'
import { ClubPage } from './ClubPage'
import { kickoffLabel, selectClubMatches, seasonProgress, matchOutcome } from '../clubPresentation'

const now = Date.parse('2026-10-28T12:00:00Z')
const match: Fixture = {
  id: 1,
  matchday: 10,
  kickoff: '2026-10-30T16:30:00Z',
  status: 'TIMED',
  home: { id: 66, name: 'United', crest: null },
  away: { id: 57, name: 'Arsenal', crest: null },
  home_score: null,
  away_score: null,
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('uses kickoff order across rounds, ignores cancelled fixtures, and prioritizes reported play', () => {
  const later = { ...match, id: 2, matchday: 8, kickoff: '2026-11-01T16:00:00Z' }
  const cancelled = { ...match, id: 3, kickoff: '2026-10-29T12:00:00Z', status: 'CANCELLED' }
  expect(selectClubMatches([later, cancelled, match]).next?.id).toBe(1)
  expect(selectClubMatches([match, { ...later, status: 'IN_PLAY' }]).next?.id).toBe(2)
})

it('handles countdown, unconfirmed kickoff, delayed status, and disruption explicitly', () => {
  expect(kickoffLabel(match, now)).toBe('2d · 4h · 30m')
  expect(kickoffLabel(match, Date.parse(match.kickoff!))).toBe('Awaiting match update')
  expect(kickoffLabel({ ...match, status: 'SCHEDULED' }, now)).toBe('Kickoff TBC')
  expect(kickoffLabel({ ...match, kickoff: null }, now)).toBe('Kickoff TBC')
  expect(kickoffLabel({ ...match, status: 'PAUSED' }, now)).toBe('Half-time')
  expect(kickoffLabel({ ...match, status: 'POSTPONED' }, now)).toBe('Postponed')
})

it('shows latest result and recent form with genuine zero scores', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  const results = [0, 1, 2, 3, 4, 5].map((i) => ({
    ...match,
    id: i + 2,
    kickoff: `2026-10-${10 + i}T12:00:00Z`,
    status: 'FINISHED',
    home_score: 0,
    away_score: i === 5 ? 0 : 2,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fixtures: {
          season_id: 1,
          current_matchday: 10,
          retrieved_at: '2026-10-28T12:00:00Z',
          matches: [match, ...results],
        },
        refresh_status: 'fresh',
        next_refresh_at: '2026-10-28T12:05:00Z',
        refresh_error: null,
      }),
    }),
  )
  render(<ClubPage teamId={66} />)
  expect(await screen.findByLabelText('2d · 4h · 30m')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByLabelText('Draw')).toBeInTheDocument()
  expect(screen.getAllByText('0 – 0')).toHaveLength(1)
  expect(screen.getByRole('progressbar', { name: 'Season games played' })).toHaveAttribute(
    'aria-valuenow',
    '6',
  )
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '38')
  expect(screen.getByText('32')).toBeInTheDocument()
  expect(
    screen.getAllByRole('listitem').every((row) => row.textContent?.includes('Matchweek 10')),
  ).toBe(true)
})

it('keeps undated results behind known dates and ignores incomplete scores', () => {
  const final = { ...match, status: 'FINISHED', home_score: 0, away_score: 1 }
  const undated = { ...final, id: 2, kickoff: null }
  const incomplete = { ...final, id: 3, home_score: null }
  const results = selectClubMatches([undated, incomplete, final]).results
  expect(results.map((result) => result.id)).toEqual([1, 2])
})

it('counts awarded games, leaves postponed and in-play games remaining, and handles away outcomes', () => {
  const final = { ...match, status: 'FINISHED', home_score: 0, away_score: 2 }
  expect(matchOutcome(final, 57)).toEqual({ marker: 'W', label: 'Win' })
  expect(matchOutcome(final, 66)).toEqual({ marker: 'L', label: 'Loss' })
  expect(
    seasonProgress([
      final,
      { ...match, id: 2, status: 'AWARDED' },
      { ...match, id: 3, status: 'POSTPONED' },
      { ...match, id: 4, status: 'IN_PLAY' },
    ]),
  ).toEqual({ played: 2, remaining: 36 })
  expect(seasonProgress([])).toEqual({ played: 0, remaining: 38 })
})
