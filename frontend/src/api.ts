import type { StandingsStateResponse } from './types'

export async function getStandings(): Promise<StandingsStateResponse> {
  const response = await fetch('/api/standings')

  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? 'Standings are not configured yet. Add the provider token to the backend environment.'
        : 'Standings are temporarily unavailable. Please try again.',
    )
  }

  return response.json() as Promise<StandingsStateResponse>
}
