/**
 * Read application-owned snapshots from the local backend, never the upstream provider.
 * JSON contracts are defined in types.ts and validated by FastAPI on the server boundary.
 */
import type { FixturesState, StandingsStateResponse } from './types'

/**
 * Read saved standings and refresh metadata from FastAPI.
 * @param signal Optional cancellation signal owned by the polling hook.
 * @returns The validated server snapshot envelope; HTTP failures reject with safe UI text.
 */
export async function getStandings(signal?: AbortSignal): Promise<StandingsStateResponse> {
  const response = await fetch('/api/standings', { signal })
  if (!response.ok) throw new Error('Standings are temporarily unavailable. Please try again.')
  return response.json() as Promise<StandingsStateResponse>
}

/**
 * Read the saved current/next matchweeks from FastAPI.
 * @param signal Optional cancellation signal owned by the polling hook.
 * @returns The fixture snapshot envelope; rejection leaves the caller's prior data intact.
 */
export async function getFixtures(signal?: AbortSignal): Promise<FixturesState> {
  const response = await fetch('/api/fixtures', { signal })
  if (!response.ok) throw new Error('Matchweeks are temporarily unavailable.')
  return response.json() as Promise<FixturesState>
}
