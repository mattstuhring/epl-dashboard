/** Exercise polling ownership rather than duplicating rendering details. */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLocalDataset } from './useLocalDataset'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('retains successful data after failure and cancels outstanding work on unmount', async () => {
  vi.useFakeTimers()
  let currentSignal: AbortSignal | undefined
  const load = vi.fn(async (signal: AbortSignal) => {
    currentSignal = signal
    if (load.mock.calls.length > 1) throw new Error('Local service unavailable')
    return { points: 19 }
  })
  const { result, unmount } = renderHook(() => useLocalDataset(load))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(result.current.state).toEqual({ points: 19 })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  expect(result.current.state).toEqual({ points: 19 })
  expect(result.current.error).toBe('Local service unavailable')
  unmount()
  expect(currentSignal?.aborted).toBe(true)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000)
  })
  expect(load).toHaveBeenCalledTimes(2)
})

it('does not overlap slow requests and aborts a request at its deadline', async () => {
  vi.useFakeTimers()
  let currentSignal: AbortSignal | undefined
  const load = vi.fn((signal: AbortSignal) => {
    currentSignal = signal
    return new Promise<never>(() => {})
  })
  const { unmount } = renderHook(() => useLocalDataset(load))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000)
  })
  expect(load).toHaveBeenCalledTimes(1)
  expect(currentSignal?.aborted).toBe(true)
  unmount()
})
