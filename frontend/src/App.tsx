/**
 * Compose the persistent dashboard screens, shared preferences and title area.
 * Dataset hooks own local polling; the menu owns dialog lifecycle and navigation controls.
 */
import { useEffect, useState } from 'react'
import { getStandings } from './api'
import { DatasetFreshness } from './components/DatasetFreshness'
import { Matchweeks } from './components/Matchweeks'
import { TeamCrest } from './components/TeamCrest'
import { StandingsTables } from './components/StandingsTables'
import { useDashboardNavigation } from './hooks/useDashboardNavigation'
import { useSupporterSignature } from './hooks/useSupporterSignature'
import { ClubPage } from './components/ClubPage'
import { DashboardMenu } from './components/DashboardMenu'
import { useLocalDataset } from './hooks/useLocalDataset'
import { readPreference, savePreference } from './preferences'
import './App.css'

// Shared title copy stays explicit as navigation grows beyond two screens.
const viewCopy = {
  standings: { title: 'League table', subtitle: 'Every place earned. Every point matters.' },
  fixtures: { title: 'Matchweeks', subtitle: 'One match at a time. Watch the story unfold.' },
  club: { title: 'Your club', subtitle: 'The badge. The belief. The next whistle.' },
} as const

/**
 * Connect saved preferences to the shared shell without remounting dataset screens.
 * @returns Shared brand/title/menu chrome and both persistent dataset screens.
 */
function App() {
  const { surname, setSurname, number, setNumber } = useSupporterSignature()
  const displaySurname = surname.trim().toLocaleUpperCase()
  const [menuOpen, setMenuOpen] = useState(false)
  const { view, selectView, isRotating, toggleRotation, intervalSeconds, setIntervalSeconds } =
    useDashboardNavigation(menuOpen)
  const { state: refreshState, isLoading, error: errorMessage } = useLocalDataset(getStandings)
  const standings = refreshState?.standings ?? null
  const [preferredTeamId, setFavoriteTeamId] = useState<number | null>(() => {
    const storedFavoriteId = readPreference('epl.favoriteTeamId', '')
    const id = Number(storedFavoriteId)
    return Number.isInteger(id) && id > 0 ? id : null
  })
  // Derive a usable club from current data without erasing a saved preference on empty polls.
  const defaultClub = standings?.rows.find((row) =>
    row.team_name.toLowerCase().startsWith('manchester united'),
  )
  const favoriteTeam = standings?.rows.find((row) => row.team_id === preferredTeamId) ?? defaultClub
  const favoriteTeamId = favoriteTeam?.team_id ?? preferredTeamId

  useEffect(() => {
    savePreference('epl.favoriteTeamId', preferredTeamId === null ? null : String(preferredTeamId))
  }, [preferredTeamId])

  return (
    <main className={`dashboard-shell ${view === 'fixtures' ? 'fixtures-mode' : ''}`}>
      <header className="topbar">
        <div className="brand-controls">
          <button
            className="menu-button"
            aria-label="Open dashboard menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
          <a className="wordmark" href="/" aria-label="EPL Ambient home">
            <span className="wordmark-mark" aria-hidden="true">
              E
            </span>
            <span className="wordmark-name">EPL Ambient</span>
            <span className="brand-tagline">
              <span aria-hidden="true">– </span>
              <em>Every point tells a story</em>
            </span>
          </a>
        </div>
        <span className="season-label">
          The Premier League
          {standings ? ` ${formatSeason(standings.season_start, standings.season_end)} Season` : ''}
        </span>
      </header>

      <section className="view-toolbar" aria-labelledby="page-title">
        <div className="title-navigation">
          <div className="title-line">
            <h1 id="page-title">{viewCopy[view].title}</h1>
          </div>
          <p className="view-subtitle">{viewCopy[view].subtitle}</p>
        </div>
        {favoriteTeam && (
          <div
            className="supporter-signature"
            role="group"
            aria-label={`${displaySurname ? displaySurname + ', ' : ''}${number ? 'number ' + number + ', ' : ''}following ${favoriteTeam.team_name}`}
          >
            <TeamCrest name={favoriteTeam.team_name} url={favoriteTeam.team_crest} />
            <div className="supporter-details">
              {displaySurname && <span className="supporter-name">{displaySurname}</span>}
              <span className="supporter-club">{favoriteTeam.team_name}</span>
            </div>
            {number && <span className="supporter-number">{number}</span>}
          </div>
        )}
      </section>
      <div className="screen-panel" hidden={view !== 'fixtures'}>
        <Matchweeks favoriteTeamId={favoriteTeamId} />
      </div>
      <div className="screen-panel" hidden={view !== 'standings'}>
        <section className="standings-section" aria-label="Premier League standings">
          <div className="table-toolbar standings-toolbar">
            {standings && standings.rows.length > 0 && (
              <ul className="standings-key" aria-label="Standings position key">
                <li>
                  <span className="key-swatch champions-zone" aria-hidden="true" />
                  Champions League: 1st–4th
                </li>
                <li>
                  <span className="key-swatch europa-zone" aria-hidden="true" />
                  Europa League: 5th
                </li>
                <li>
                  <span className="key-swatch relegation-zone" aria-hidden="true" />
                  Relegation: 18th–20th
                </li>
              </ul>
            )}
          </div>

          {isLoading &&
            !standings &&
            refreshState?.refresh_status !== 'error' &&
            refreshState?.refresh_status !== 'refreshing' &&
            !errorMessage && (
              <div className="message-panel" role="status">
                Loading the latest league table…
              </div>
            )}

          {!standings && refreshState?.refresh_status === 'refreshing' && (
            <div className="refresh-message" role="status">
              Updating standings in the background…
            </div>
          )}

          {!standings && (errorMessage || refreshState?.refresh_status === 'error') && (
            <div className="message-panel error-panel" role="alert">
              <span>
                {errorMessage ?? refreshState?.refresh_error ?? 'Standings are not available yet.'}
              </span>
            </div>
          )}

          {!standings &&
            !isLoading &&
            !errorMessage &&
            refreshState?.refresh_status === 'pending' && (
              <div className="message-panel" role="status">
                Waiting for the first standings update…
              </div>
            )}

          {!isLoading && !errorMessage && standings?.rows.length === 0 && (
            <div className="message-panel" role="status">
              No standings are available for this season yet.
            </div>
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
              <span />
              <DatasetFreshness
                datasetName="Standings"
                isFresh={
                  !errorMessage &&
                  (refreshState?.refresh_status === 'fresh' ||
                    refreshState?.refresh_status === 'refreshing')
                }
                hasError={Boolean(errorMessage || refreshState?.refresh_error)}
                lastSuccessAt={standings.retrieved_at}
                nextRefreshAt={refreshState?.next_refresh_at ?? null}
              />
            </footer>
          )}
        </section>
      </div>
      <div className="screen-panel" hidden={view !== 'club'}>
        {favoriteTeamId ? (
          <ClubPage key={favoriteTeamId} teamId={favoriteTeamId} />
        ) : (
          <p className="message-panel">Choose your club in the menu once club data is available.</p>
        )}
      </div>
      <DashboardMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={{
          view,
          selectView,
          isRotating,
          toggleRotation,
          intervalSeconds,
          setIntervalSeconds,
        }}
        clubs={standings?.rows ?? []}
        favoriteTeamId={favoriteTeamId}
        onFavoriteChange={setFavoriteTeamId}
        signature={{ surname, setSurname, number, setNumber }}
      />
      <footer className="page-footer">
        <span>BUILT FOR THE LOVE OF THE GAME</span>
        <span>DATA PROVIDED BY FOOTBALL-DATA.ORG</span>
      </footer>
    </main>
  )
}

/**
 * Format date-only season boundaries without applying a timezone conversion.
 */
function formatSeason(start: string, end: string): string {
  const startYear = new Date(`${start}T00:00:00`).getFullYear()
  const endYear = new Date(`${end}T00:00:00`).getFullYear()
  return `${startYear}/${String(endYear).slice(-2)}`
}

export default App
