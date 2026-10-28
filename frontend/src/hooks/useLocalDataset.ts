/**
 * Poll the local FastAPI snapshot endpoints without coupling browser reads to provider I/O.
 * Both screens keep this hook mounted so navigation retains last-known-good display data.
 */
import { useEffect, useState } from 'react'

const LOCAL_POLL_INTERVAL_MS = 60_000
const LOCAL_REQUEST_TIMEOUT_MS = 15_000

/**
 * Serialize local reads, cancel abandoned requests, and retain the prior snapshot on failure.
 * @param load Stable API function accepting a cancellation signal.
 * @returns Latest successful response, initial-loading flag and local connection error.
 */
export function useLocalDataset<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let pollTimer: number | undefined
    let controller: AbortController
    let requestTimeout: number | undefined

    /** Read one local snapshot; retain prior data on failure and schedule the next attempt. */
    async function poll() {
      // Phase 1: Bound each local request; never overlap a slow previous poll.
      controller = new AbortController()
      requestTimeout = window.setTimeout(() => controller.abort(), LOCAL_REQUEST_TIMEOUT_MS)
      try {
        const response = await load(controller.signal)
        if (!disposed) {
          setState(response)
          setError(null)
        }
      } catch (cause) {
        if (!disposed) {
          setError(
            cause instanceof Error ? cause.message : 'Could not reach the dashboard service.',
          )
        }
      } finally {
        window.clearTimeout(requestTimeout)
        // Phase 2: Schedule the next read only after this attempt has settled.
        if (!disposed) {
          setIsLoading(false)
          pollTimer = window.setTimeout(() => void poll(), LOCAL_POLL_INTERVAL_MS)
        }
      }
    }

    void poll()
    return () => {
      // Cancel pending I/O as well as the next timer on unmount/StrictMode restart.
      disposed = true
      controller?.abort()
      window.clearTimeout(requestTimeout)
      window.clearTimeout(pollTimer)
    }
  }, [load])

  return { state, isLoading, error }
}
