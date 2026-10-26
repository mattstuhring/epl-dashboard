import { useCallback, useEffect, useState } from 'react'

export type DashboardView = 'standings' | 'fixtures'
export const rotationIntervals = [30, 60, 120, 300] as const

/**
 * Own manual selection and optional automatic rotation for the dashboard.
 * Selecting any tab pauses indefinitely. Starting rotation, changing its
 * interval, or advancing a view gives the visible view a full new interval.
 * Browser preferences survive reloads; data refresh schedules are independent.
 */
export function useDashboardNavigation() {
  const [view, setView] = useState<DashboardView>(() =>
    window.localStorage.getItem('epl.view') === 'fixtures' ? 'fixtures' : 'standings',
  )
  const [isRotating, setIsRotating] = useState(() =>
    window.localStorage.getItem('epl.rotationEnabled') === 'true',
  )
  const [intervalSeconds, setIntervalSeconds] = useState(() => {
    const saved = Number(window.localStorage.getItem('epl.rotationIntervalSeconds'))
    return rotationIntervals.some(value => value === saved) ? saved : 60
  })

  useEffect(() => {
    window.localStorage.setItem('epl.view', view)
    window.localStorage.setItem('epl.rotationEnabled', String(isRotating))
    window.localStorage.setItem('epl.rotationIntervalSeconds', String(intervalSeconds))
  }, [view, isRotating, intervalSeconds])

  useEffect(() => {
    if (!isRotating) return

    const timer = window.setTimeout(() => {
      setView(current => current === 'standings' ? 'fixtures' : 'standings')
    }, intervalSeconds * 1000)

    return () => window.clearTimeout(timer)
  }, [view, isRotating, intervalSeconds])

  const selectView = useCallback((nextView: DashboardView) => {
    setIsRotating(false)
    setView(nextView)
  }, [])

  const toggleRotation = useCallback(() => setIsRotating(current => !current), [])

  return { view, selectView, isRotating, toggleRotation, intervalSeconds, setIntervalSeconds }
}
