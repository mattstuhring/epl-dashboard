/**
 * Own carousel timing and manual selection, independently of backend data refresh schedules.
 */
import { useCallback, useEffect, useState } from 'react'
import { readPreference, savePreference } from '../preferences'

export type DashboardView = 'standings' | 'fixtures'
export const rotationIntervals = [30, 60, 120, 300] as const

/**
 * Own manual selection and optional automatic rotation for the dashboard.
 * Selecting any screen pauses indefinitely. Starting rotation, changing its
 * interval, or advancing a view gives the visible view a full new interval.
 * @param suspended Temporarily hold the timer while the menu is open.
 * @returns Current view, rotation state and explicit preference actions.
 * Browser preferences survive reloads; data refresh schedules are independent.
 */
export function useDashboardNavigation(suspended = false) {
  const [view, setView] = useState<DashboardView>(() =>
    readPreference('epl.view', 'standings') === 'fixtures' ? 'fixtures' : 'standings',
  )
  const [isRotating, setIsRotating] = useState(
    () => readPreference('epl.rotationEnabled', 'false') === 'true',
  )
  const [intervalSeconds, setIntervalSeconds] = useState(() => {
    const saved = Number(readPreference('epl.rotationIntervalSeconds', '60'))
    return rotationIntervals.some((value) => value === saved) ? saved : 60
  })

  useEffect(() => {
    savePreference('epl.view', view)
    savePreference('epl.rotationEnabled', String(isRotating))
    savePreference('epl.rotationIntervalSeconds', String(intervalSeconds))
  }, [view, isRotating, intervalSeconds, suspended])

  useEffect(() => {
    if (!isRotating || suspended) return

    const timer = window.setTimeout(() => {
      setView((current) => (current === 'standings' ? 'fixtures' : 'standings'))
    }, intervalSeconds * 1000)

    return () => window.clearTimeout(timer)
  }, [view, isRotating, intervalSeconds, suspended])

  const selectView = useCallback((nextView: DashboardView) => {
    setIsRotating(false)
    setView(nextView)
  }, [])

  const toggleRotation = useCallback(() => setIsRotating((current) => !current), [])

  return { view, selectView, isRotating, toggleRotation, intervalSeconds, setIntervalSeconds }
}
