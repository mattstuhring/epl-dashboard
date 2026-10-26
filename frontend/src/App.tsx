import { useCallback, useEffect, useState } from 'react'
import { getStandings } from './api'
import { DatasetFreshness } from './components/DatasetFreshness'
import type { StandingsStateResponse } from './types'
import { Matchweeks } from './components/Matchweeks'
import { StandingsTables } from './components/StandingsTables'
import { rotationIntervals, useDashboardNavigation } from './hooks/useDashboardNavigation'
import './App.css'

function App() {
  const { view, selectView, isRotating, toggleRotation, intervalSeconds, setIntervalSeconds } = useDashboardNavigation()
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
    <main className={`dashboard-shell ${view === 'fixtures' ? 'fixtures-mode' : ''}`}>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="EPL Ambient home">
          <span className="wordmark-mark" aria-hidden="true">E</span>
          <span className="wordmark-name">EPL Ambient</span>
          <span className="brand-tagline"><span aria-hidden="true">– </span><em>Every point tells a story</em></span>
        </a>
        <span className="season-label">
          The Premier League{standings ? ` ${formatSeason(standings.season_start, standings.season_end)} Season` : ''}
        </span>
      </header>

      <section className="page-heading" aria-labelledby="page-title">
        <h1 id="page-title">{view === 'standings' ? 'League table' : 'Matchweeks'}</h1>
      </section>

      <div className="view-toolbar">
        <nav className="view-switcher" aria-label="Dashboard view">
          <button aria-pressed={view === 'standings'} onClick={() => selectView('standings')}>League table</button>
          <button aria-pressed={view === 'fixtures'} onClick={() => selectView('fixtures')}>Matchweeks</button>
        </nav>
        <div className="dashboard-controls">
        <div className="rotation-controls" role="group" aria-label="Automatic view rotation">
          <button
            className="rotation-toggle"
            role="switch"
            aria-label="Auto-rotate"
            aria-checked={isRotating}
            onClick={toggleRotation}
            title={`Auto-rotate: ${isRotating ? 'On' : 'Off'}`}
          >
            <span aria-hidden="true">⚽</span>
          </button>
          <label className="rotation-interval">
            <span>Every</span>
            <select
              aria-label="Rotation interval"
              value={intervalSeconds}
              onChange={event => setIntervalSeconds(Number(event.target.value))}
            >
              {rotationIntervals.map(seconds => (
                <option key={seconds} value={seconds}>
                  {seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`}
                </option>
              ))}
            </select>
          </label>
        </div>
          {standings && standings.rows.length > 0 && (
            <label className="favorite-picker">
              <span>Favorite club</span>
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
      </div>
      {view === 'fixtures' ? <Matchweeks favoriteTeamId={favoriteTeamId} /> : <section className="standings-section" aria-label="Premier League standings">
        <div className="table-toolbar standings-toolbar">
          {standings && standings.rows.length > 0 && (
    <ul className="standings-key" aria-label="Standings position key">
      <li><span className="key-swatch champions-zone" aria-hidden="true" />Champions League: 1st–4th</li>
      <li><span className="key-swatch europa-zone" aria-hidden="true" />Europa League: 5th</li>
      <li><span className="key-swatch relegation-zone" aria-hidden="true" />Relegation: 18th–20th</li>
    </ul>
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
          <StandingsTables rows={standings.rows} favoriteTeamId={favoriteTeamId} />
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
      </section>}
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
  return `${startYear}/${String(endYear).slice(-2)}`
}

export default App
