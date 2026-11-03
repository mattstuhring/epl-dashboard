/**
 * Share one cancellable local fixture poll between the persistent day and week screens.
 * Both views follow the provider-selected round and retain their shared freshness state.
 */
import type { ReactNode } from 'react'
import { getFixtures } from '../api'
import { useLocalDataset } from '../hooks/useLocalDataset'
import type { DashboardView } from '../hooks/useDashboardNavigation'
import type { FixturesState } from '../types'
import { DatasetFreshness } from './DatasetFreshness'
import { Matchday } from './Matchday'
import { MatchdaySideArt } from './MatchdaySideArt'
import { Matchweeks } from './Matchweeks'
import { MatchweekSideArt } from './MatchweekSideArt'

/**
 * Own shared data and keep both views mounted while navigation changes.
 */
export function FixturePages({
  favoriteTeamId,
  view,
}: {
  favoriteTeamId: number | null
  view: DashboardView
}) {
  const { state, error } = useLocalDataset(getFixtures)
  return (
    <>
      <div className="screen-panel matchday-stage" hidden={view !== 'matchday'}>
        <MatchdaySideArt />
        <FixtureState state={state} error={error}>
          {state?.fixtures && <Matchday data={state.fixtures} favoriteTeamId={favoriteTeamId} />}
        </FixtureState>
      </div>
      <div className="screen-panel matchweek-stage" hidden={view !== 'fixtures'}>
        <MatchweekSideArt />
        <FixtureState state={state} error={error}>
          {state?.fixtures && <Matchweeks data={state.fixtures} favoriteTeamId={favoriteTeamId} />}
        </FixtureState>
      </div>
    </>
  )
}

/**
 * Preserve shared last-good/error/freshness semantics around either fixture view.
 */
function FixtureState({
  state,
  error,
  children,
}: {
  state: FixturesState | null
  error: string | null
  children: ReactNode
}) {
  const data = state?.fixtures
  return (
    <div className="fixture-view-frame">
      {(error || state?.refresh_error) && (
        <p className="stale-message" role="status">
          {error ?? state?.refresh_error} {data ? 'Showing the last successful fixture data.' : ''}
        </p>
      )}
      {!data && (
        <div className="message-panel" role="status">
          {state?.refresh_status === 'error'
            ? 'Fixture data is not available yet.'
            : 'Waiting for fixtures…'}
        </div>
      )}
      {children}
      {data && state && (
        <footer className="table-footer">
          <span>Kickoffs in Pacific time · Scores update periodically</span>
          <DatasetFreshness
            datasetName="Fixtures"
            isFresh={!error && ['fresh', 'refreshing'].includes(state.refresh_status)}
            hasError={Boolean(error || state.refresh_error)}
            lastSuccessAt={data.retrieved_at}
            nextRefreshAt={state.next_refresh_at}
          />
        </footer>
      )}
    </div>
  )
}
