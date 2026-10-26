import type { StandingsRow } from '../types'
import { TeamCrest } from './TeamCrest'

type StandingsTablesProps = {
  rows: StandingsRow[]
  favoriteTeamId: number | null
}

/** Preserve league ranks in two ten-club panels with one shared set of controls. */
export function StandingsTables({ rows, favoriteTeamId }: StandingsTablesProps) {
  const sortedRows = [...rows].sort((a, b) => a.position - b.position)
  const panels = [
    { label: 'Top', rows: sortedRows.filter(row => row.position <= 10) },
    { label: 'Bottom', rows: sortedRows.filter(row => row.position > 10) },
  ].filter(panel => panel.rows.length > 0)

  return (
    <div className="standings-grid">
      {panels.map(panel => (
        <div className="table-scroll-region table-card" key={panel.label}>
          <table>
            <caption>{panel.label}</caption>
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
              {panel.rows.map((row) => (
                <tr className={row.team_id === favoriteTeamId ? 'favorite-row' : ''} key={row.team_id}>
                  <td className={`rank-cell ${positionZone(row.position)}`} title={positionLabel(row.position)}>{row.position}</td>
                  <th className="team-cell" scope="row">
                    {row.team_id === favoriteTeamId && <span className="favorite-marker" aria-label="Favorite club">★</span>}
                    <TeamCrest name={row.team_name} url={row.team_crest} /> {row.team_name}
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
      ))}
    </div>
  )
}

function positionZone(position: number): string {
  if (position <= 4) return 'champions-zone'
  if (position === 5) return 'europa-zone'
  if (position >= 18) return 'relegation-zone'
  return ''
}

function positionLabel(position: number): string | undefined {
  if (position <= 4) return 'Champions League'
  if (position === 5) return 'Europa League'
  if (position >= 18) return 'Relegation'
  return undefined
}
