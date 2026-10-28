import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDashboardNavigation } from './useDashboardNavigation'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.localStorage.clear()
})

it('defaults to paused and gives every view a full interval when playing', () => {
  const { result } = renderHook(useDashboardNavigation)
  expect(result.current.intervalSeconds).toBe(60)
  act(() => vi.advanceTimersByTime(300_000))
  expect(result.current.view).toBe('standings')
  act(() => result.current.toggleRotation())
  act(() => vi.advanceTimersByTime(59_999))
  expect(result.current.view).toBe('standings')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.view).toBe('fixtures')
  act(() => vi.advanceTimersByTime(60_000))
  expect(result.current.view).toBe('standings')
})

it('manual selection pauses indefinitely, including selecting the visible tab', () => {
  const { result } = renderHook(useDashboardNavigation)
  act(() => result.current.toggleRotation())
  act(() => vi.advanceTimersByTime(45_000))
  act(() => result.current.selectView('fixtures'))
  act(() => vi.advanceTimersByTime(600_000))
  expect(result.current.view).toBe('fixtures')
  expect(result.current.isRotating).toBe(false)
  act(() => result.current.toggleRotation())
  act(() => result.current.selectView('fixtures'))
  expect(result.current.isRotating).toBe(false)
})

it('resuming or changing the interval discards the previous deadline', () => {
  const { result } = renderHook(useDashboardNavigation)
  act(() => result.current.toggleRotation())
  act(() => vi.advanceTimersByTime(50_000))
  act(() => result.current.toggleRotation())
  act(() => result.current.toggleRotation())
  act(() => vi.advanceTimersByTime(59_000))
  expect(result.current.view).toBe('standings')
  act(() => result.current.setIntervalSeconds(120))
  act(() => vi.advanceTimersByTime(119_999))
  expect(result.current.view).toBe('standings')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.view).toBe('fixtures')
})

it('restores browser preferences and removes timers on unmount', () => {
  const first = renderHook(useDashboardNavigation)
  act(() => first.result.current.selectView('fixtures'))
  act(() => first.result.current.setIntervalSeconds(30))
  act(() => first.result.current.toggleRotation())
  const clearTimer = vi.spyOn(window, 'clearTimeout')
  first.unmount()
  expect(clearTimer).toHaveBeenCalled()
  clearTimer.mockRestore()
  const second = renderHook(useDashboardNavigation)
  expect(second.result.current.view).toBe('fixtures')
  expect(second.result.current.isRotating).toBe(true)
  expect(second.result.current.intervalSeconds).toBe(30)
  act(() => vi.advanceTimersByTime(30_000))
  expect(second.result.current.view).toBe('standings')
})

it('falls back safely when stored settings are invalid', () => {
  window.localStorage.setItem('epl.view', 'unknown')
  window.localStorage.setItem('epl.rotationEnabled', 'invalid')
  window.localStorage.setItem('epl.rotationIntervalSeconds', '-100')
  const { result } = renderHook(useDashboardNavigation)
  expect(result.current.view).toBe('standings')
  expect(result.current.isRotating).toBe(false)
  expect(result.current.intervalSeconds).toBe(60)
})

it('suspends rotation while the menu is open and resumes with a full interval', () => {
  const { result, rerender } = renderHook(({ open }) => useDashboardNavigation(open), {
    initialProps: { open: false },
  })
  act(() => result.current.toggleRotation())
  act(() => vi.advanceTimersByTime(50_000))
  rerender({ open: true })
  act(() => vi.advanceTimersByTime(120_000))
  expect(result.current.view).toBe('standings')
  expect(result.current.isRotating).toBe(true)
  rerender({ open: false })
  act(() => vi.advanceTimersByTime(59_999))
  expect(result.current.view).toBe('standings')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.view).toBe('fixtures')
})
