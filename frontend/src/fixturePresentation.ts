/**
 * Group saved season fixtures into chronological Pacific date bands.
 * Pure calculations keep browser time, provider state and UI rendering independent.
 */
import type { Fixture } from './types'

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * Return the Pacific calendar-day identity for an absolute instant.
 */
export function pacificDayKey(date: Date): string {
  return dayKeyFormatter.format(date)
}

/**
 * Return readable Pacific date text with year for full-season browsing.
 */
export function fixtureDateLabel(date: Date): string {
  return dateFormatter.format(date)
}

/**
 * Group and sort fixtures by Pacific date, with undated fixtures last.
 */
export function groupFixturesByDay(matches: readonly Fixture[]) {
  const groups = new Map<string, { key: string; label: string; matches: Fixture[] }>()
  const ordered = [...matches].sort(
    (a, b) => (a.kickoff ?? '9999').localeCompare(b.kickoff ?? '9999') || a.id - b.id,
  )
  for (const match of ordered) {
    const date = match.kickoff ? new Date(match.kickoff) : null
    const key = date ? pacificDayKey(date) : 'date-tbc'
    let group = groups.get(key)
    if (!group) {
      group = { key, label: date ? fixtureDateLabel(date) : 'Date TBC', matches: [] }
      groups.set(key, group)
    }
    group.matches.push(match)
  }
  return [...groups.values()]
}
