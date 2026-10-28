/**
 * Present compact dataset age and planned attempt times in a consistent footer.
 * The local timer updates relative labels; it never fetches data or changes refresh policy.
 */
import { useEffect, useState } from 'react'

type DatasetFreshnessProps = {
  datasetName: string
  isFresh: boolean
  hasError?: boolean
  lastSuccessAt: string
  nextRefreshAt: string | null
}
const formatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Los_Angeles',
})

/**
 * Keep relative age current and expose exact Pacific times on hover or keyboard focus.
 * @param props Dataset label, freshness/failure state and last-success/next-attempt UTC strings.
 * @returns A compact summary; overdue normal checks are distinct from failure retries.
 */
export function DatasetFreshness({
  datasetName,
  isFresh,
  hasError = false,
  lastSuccessAt,
  nextRefreshAt,
}: DatasetFreshnessProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const remaining = nextRefreshAt ? Date.parse(nextRefreshAt) - now : null
  const details = `Last successful update: ${formatter.format(new Date(lastSuccessAt))} Pacific. Next attempt: ${nextRefreshAt ? formatter.format(new Date(nextRefreshAt)) + ' Pacific' : 'not scheduled'}.`
  return (
    <span className="dataset-freshness" role="group" aria-label={`${datasetName} data freshness`}>
      <span className="freshness-summary" tabIndex={0}>
        <span>
          {!isFresh && 'Update delayed · '}Updated{' '}
          <time dateTime={lastSuccessAt}>
            {duration(Math.max(0, now - Date.parse(lastSuccessAt)))} ago
          </time>
        </span>
        <span>
          {' '}
          ·{' '}
          {remaining === null
            ? 'No check scheduled'
            : remaining <= 0
              ? 'Check due'
              : `${hasError ? 'Retrying' : 'Next check'} in ${duration(remaining)}`}
        </span>
        <span className="freshness-details">{details}</span>
      </span>
    </span>
  )
}
/**
 * Format elapsed milliseconds into a compact minute/hour/day label.
 */
function duration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  if (minutes < 1) return 'less than 1m'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}
