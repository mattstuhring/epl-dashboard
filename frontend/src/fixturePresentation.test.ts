import { expect, it } from 'vitest'
import { groupFixturesByDay } from './fixturePresentation'
import type { Fixture } from './types'
const base: Fixture = {
  id: 1,
  matchday: 9,
  kickoff: '2026-11-01T23:00:00Z',
  status: 'TIMED',
  home: { id: 1, name: 'Home', crest: null },
  away: { id: 2, name: 'Away', crest: null },
  home_score: null,
  away_score: null,
}
it('groups UTC instants into Pacific dates across the DST transition', () => {
  const groups = groupFixturesByDay([
    base,
    { ...base, id: 2, kickoff: '2026-11-02T07:59:00Z' },
    { ...base, id: 3, kickoff: '2026-11-02T08:00:00Z' },
  ])
  expect(groups.map((group) => group.matches.map((match) => match.id))).toEqual([[1, 2], [3]])
  expect(groups.map((group) => group.key)).toEqual(['2026-11-01', '2026-11-02'])
})
it('keeps all provider statuses and unknown dates without mutating the saved fixture order', () => {
  const matches = [
    { ...base, id: 3, kickoff: null },
    { ...base, status: 'POSTPONED' },
    { ...base, id: 2, kickoff: '2026-10-31T20:00:00Z', status: 'FINISHED' },
  ]
  const groups = groupFixturesByDay(matches)
  expect(groups.map((group) => group.matches[0].id)).toEqual([2, 1, 3])
  expect(groups.at(-1)?.key).toBe('date-tbc')
  expect(matches.map((match) => match.id)).toEqual([3, 1, 2])
})
