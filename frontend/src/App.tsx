import { useCallback, useEffect, useState } from 'react'
import { getStandings } from './api'
import { DatasetFreshness } from './components/DatasetFreshness'
import type { StandingsStateResponse } from './types'
import './App.css'

function App() {
  const [refreshState, setRefreshState] = useState<StandingsStateResponse | null>(null)
  const standings = refreshState?.standings ?? null
  const [favoriteTeamId, setFavoriteTeamId] = useState<number | null>(() => {
    const storedFavoriteId = window.localStorage.getItem('epl.favoriteTeamId')
    return storedFavoriteId ? Number(storedFavoriteId) : null
  })
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const loadStandings = useCallback(async () => {
    try {
      const response = await getStandings()
      setRefreshState(response)

      const favorite = response.standings?.rows.find((row) =>
        row.team_name.toLocaleLowerCase().startsWith('manchester united'),
      )
      setFavoriteTeamId((currentFavoriteId) =>
        currentFavoriteId !== null && response.standings?.rows.some((row) => row.team_id === currentFavoriteId)
          ? currentFavoriteId
          : favorite?.team_id ?? null,
      )
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Standings could not be loaded right now.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // The request awaits the local API; polling reads SQLite state and does not contact the provider.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadStandings()
    const pollId = window.setInterval(() => void loadStandings(), 60_000)

    return () => window.clearInterval(pollId)
  }, [loadStandings])

  useEffect(() => {
    if (favoriteTeamId === null) {
      window.localStorage.removeItem('epl.favoriteTeamId')
    } else {
      window.localStorage.setItem('epl.favoriteTeamId', String(favoriteTeamId))
    }
  }, [favoriteTeamId])

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="EPL Ambient home">
          <span className="wordmark-mark" aria-hidden="true">E</span>
          <span>EPL <span className="wordmark-light">AMBIENT</span></span>
        </a>
        <span className="season-label">
          {standings ? `${formatSeason(standings.season_start, standings.season_end)} SEASON` : 'CURRENT SEASON'}
        </span>
      </header>

      <section className="page-heading" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">THE PREMIER LEAGUE</p>
          <h1 id="page-title">League table</h1>
          <p className="page-description">Every point tells part of the story.</p>
        </div>
        <div className="table-context">
          <span className="live-indicator" aria-hidden="true" />
          <span>{standings?.current_matchday ? `MATCHWEEK ${standings.current_matchday}` : 'CURRENT STANDINGS'}</span>
        </div>
      </section>

      <section className="table-card" aria-label="Premier League standings">
        <div className="table-toolbar">
          <div>
            <h2>{standings?.competition_name ?? 'Premier League'}</h2>
            <p>{standings ? `${standings.rows.length} clubs · ${standings.season_start.slice(0, 4)}–${standings.season_end.slice(0, 4)}` : 'Season standings'}</p>
          </div>
          {standings && standings.rows.length > 0 && (
            <label className="favorite-picker">
              <span>FAVORITE CLUB</span>
              <select
                aria-label="Favorite club"
                value={favoriteTeamId ?? ''}
                onChange={(event) => setFavoriteTeamId(Number(event.target.value))}
              >
                <option value="" disabled>Select a club</option>
                {standings.rows.map((row) => (
                  <option key={row.team_id} value={row.team_id}>{row.team_name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {isLoading && !standings && refreshState?.refresh_status !== 'error' && refreshState?.refresh_status !== 'refreshing' && !errorMessage && (
          <div className="message-panel" role="status">Loading the latest league table…</div>
        )}

        {refreshState?.refresh_status === 'refreshing' && (
          <div className="refresh-message" role="status">Updating standings in the background…</div>
        )}

        {!standings && (errorMessage || refreshState?.refresh_status === 'error') && (
          <div className="message-panel error-panel" role="alert">
            <span>{errorMessage ?? refreshState?.refresh_error ?? 'Standings are not available yet.'}</span>
          </div>
        )}

        {!standings && !isLoading && !errorMessage && refreshState?.refresh_status === 'pending' && (
          <div className="message-panel" role="status">Waiting for the first standings update…</div>
        )}

        {!isLoading && !errorMessage && standings?.rows.length === 0 && (
          <div className="message-panel" role="status">No standings are available for this season yet.</div>
        )}

        {standings && (errorMessage || refreshState?.refresh_status === 'stale') && (
          <div className="stale-message" role="status">
            {errorMessage ?? refreshState?.refresh_error ?? 'Standings are out of date.'}{' '}
            {refreshState?.refresh_status === 'stale'
              ? 'Showing the last successful standings.'
              : ''}
          </div>
        )}

        {standings && standings.rows.length > 0 && (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th className="rank-column" scope="col">#</th>
                  <th className="club-column" scope="col">Club</th>
                  <th scope="col" title="Played">P</th>
                  <th scope="col" title="Won">W</th>
                  <th scope="col" title="Drawn">D</th>
                  <th scope="col" title="Lost">L</th>
                  <th className="optional-column" scope="col" title="Goals for">GF</th>
                  <th className="optional-column" scope="col" title="Goals against">GA</th>
                  <th className="optional-column" scope="col" title="Goal difference">GD</th>
                  <th className="points-column" scope="col">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.rows.map((row) => (
                  <tr className={row.team_id === favoriteTeamId ? 'favorite-row' : ''} key={row.team_id}>
                    <td className="rank-cell">{row.position}</td>
                    <th className="team-cell" scope="row">
                      {row.team_id === favoriteTeamId && <span className="favorite-marker" aria-label="Favorite club">★</span>}
                      {row.team_name}
                    </th>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td className="optional-column">{row.goals_for}</td>
                    <td className="optional-column">{row.goals_against}</td>
                    <td className="optional-column">{row.goal_difference > 0 ? `+${row.goal_difference}` : row.goal_difference}</td>
                    <td className="points-cell">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {standings && standings.rows.length > 0 && (
          <footer className="table-footer">
            <span><span className="favorite-marker" aria-hidden="true">★</span> Your favorite club</span>
            <DatasetFreshness
              datasetName="Standings"
              isFresh={refreshState?.refresh_status === 'fresh'}
              lastSuccessAt={standings.retrieved_at}
              nextRefreshAt={refreshState?.next_refresh_at ?? null}
            />
          </footer>
        )}
      </section>
      <footer className="page-footer">
        <span>BUILT FOR THE LOVE OF THE GAME</span>
        <span>DATA PROVIDED BY FOOTBALL-DATA.ORG</span>
      </footer>
    </main>
  )
}

function formatSeason(start: string, end: string): string {
  const startYear = new Date(`${start}T00:00:00`).getFullYear()
  const endYear = new Date(`${end}T00:00:00`).getFullYear()
  return `${startYear} / ${String(endYear).slice(-2)}`
}

export default App
