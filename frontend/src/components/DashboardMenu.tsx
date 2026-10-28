/**
 * Own the modal navigation overlay and its focus/close lifecycle.
 * Controlled preferences remain in App so the signature and screens update together.
 */
import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import type { StandingsRow } from '../types'
import { rotationIntervals, useDashboardNavigation } from '../hooks/useDashboardNavigation'
import type { DashboardView } from '../hooks/useDashboardNavigation'
import { useSupporterSignature } from '../hooks/useSupporterSignature'
import { TeamCrest } from './TeamCrest'

type DashboardMenuProps = {
  open: boolean
  onClose: () => void
  navigation: ReturnType<typeof useDashboardNavigation>
  clubs: StandingsRow[]
  favoriteTeamId: number | null
  onFavoriteChange: (id: number) => void
  signature: ReturnType<typeof useSupporterSignature>
}

/**
 * Render controlled navigation/preferences without owning a second copy of their state.
 * @param props Dialog visibility, close action, navigation, clubs and shared preference actions.
 * @returns Native modal dialog; screen selection pauses rotation before closing it.
 */
export function DashboardMenu({
  open,
  onClose,
  navigation,
  clubs,
  favoriteTeamId,
  onFavoriteChange,
  signature,
}: DashboardMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { view, selectView, isRotating, toggleRotation, intervalSeconds, setIntervalSeconds } =
    navigation
  const { surname, setSurname, number, setNumber } = signature

  useEffect(() => {
    // Native dialog supplies focus trapping, Escape handling and focus restoration.
    const dialog = dialogRef.current
    if (open && !dialog?.open) dialog?.showModal()
    else if (!open && dialog?.open) dialog.close()
  }, [open])

  /**
   * Close only outside the panel, leaving clicks in its padding harmless.
   */
  function dismissBackdrop(event: MouseEvent<HTMLDialogElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const outside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    if (outside) onClose()
  }

  /**
   * Select a screen before dismissing, preserving the deliberate manual pause.
   */
  function chooseView(nextView: DashboardView) {
    selectView(nextView)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="dashboard-drawer"
      aria-labelledby="menu-title"
      onClose={onClose}
      onClick={dismissBackdrop}
    >
      <div className="drawer-heading">
        <h2 id="menu-title">The touchline</h2>
        <button className="menu-button" aria-label="Close dashboard menu" onClick={() => onClose()}>
          ×
        </button>
      </div>
      <p className="drawer-label">Screens</p>
      <nav className="drawer-navigation" aria-label="Dashboard view">
        <button
          aria-label="League table"
          title="League table"
          aria-current={view === 'standings' ? 'page' : undefined}
          onClick={() => chooseView('standings')}
        >
          League table
        </button>
        <button
          aria-label="Matchweeks"
          title="Matchweeks"
          aria-current={view === 'fixtures' ? 'page' : undefined}
          onClick={() => chooseView('fixtures')}
        >
          Matchweeks
        </button>
        <button
          aria-current={view === 'club' ? 'page' : undefined}
          onClick={() => chooseView('club')}
        >
          Your club
        </button>
      </nav>
      <p className="drawer-label">Presentation & your club</p>
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
              onChange={(event) => setIntervalSeconds(Number(event.target.value))}
            >
              {rotationIntervals.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {clubs.length > 0 && (
          <label className="favorite-picker">
            <span>Favorite club</span>
            <select
              aria-label="Favorite club"
              value={favoriteTeamId ?? ''}
              onChange={(event) => onFavoriteChange(Number(event.target.value))}
            >
              <option value="" disabled>
                Select a club
              </option>
              {clubs.map((row) => (
                <option key={row.team_id} value={row.team_id}>
                  {row.team_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <fieldset className="signature-settings">
        <legend>Supporter signature</legend>
        <label>
          Surname
          <input
            type="text"
            value={surname}
            maxLength={24}
            autoComplete="off"
            onChange={(event) => setSurname(event.target.value.slice(0, 24))}
          />
        </label>
        <label>
          Shirt number
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{0,2}"
            maxLength={2}
            value={number}
            onChange={(event) => {
              if (/^\d{0,2}$/.test(event.target.value)) setNumber(event.target.value)
            }}
          />
        </label>
        <p>Saved automatically in this browser. Leave either field blank to hide it.</p>
      </fieldset>
      {clubs
        .filter((row) => row.team_id === favoriteTeamId)
        .map((row) => (
          <div className="following-club" key={row.team_id}>
            <TeamCrest name={row.team_name} url={row.team_crest} />
            <span>
              Following <strong>{row.team_name}</strong>
            </span>
          </div>
        ))}
      <p className="drawer-hint">
        Rotation pauses while this menu is open. Choosing a screen keeps it paused.
      </p>
    </dialog>
  )
}
