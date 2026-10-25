type DatasetFreshnessProps = {
  datasetName: string
  isFresh: boolean
  lastSuccessAt: string
  nextRefreshAt: string | null
}

const localDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Los_Angeles',
})

/**
 * Show when a displayed dataset was last saved successfully and when its next
 * backend refresh attempt is scheduled. This component is shared by dashboard
 * datasets so the freshness language and local-time formatting stay consistent.
 */
export function DatasetFreshness({
  datasetName,
  isFresh,
  lastSuccessAt,
  nextRefreshAt,
}: DatasetFreshnessProps) {
  return (
    <span
      className="dataset-freshness"
      role="group"
      aria-label={`${datasetName} data freshness`}
    >
      <span>
        {isFresh ? 'Up to date · ' : 'Last successful update · '}
        <time dateTime={lastSuccessAt}>{formatLocalDateTime(lastSuccessAt)}</time>
      </span>
      <span>
        Next attempt:{' '}
        {nextRefreshAt ? (
          <time dateTime={nextRefreshAt}>{formatLocalDateTime(nextRefreshAt)}</time>
        ) : (
          'not scheduled'
        )}
      </span>
    </span>
  )
}

function formatLocalDateTime(value: string): string {
  return localDateTimeFormatter.format(new Date(value))
}
