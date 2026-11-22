import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { commandLine: { hasSwitch: () => false, appendSwitch: vi.fn() } }
}))

import { waitForUnlockedCollection } from './select-linux-keyring-backend'

describe('waitForUnlockedCollection', () => {
  it('waits for a keyring the lock screen unlocks during startup', () => {
    const states = ['locked', 'locked', 'unlocked'] as const
    let i = 0
    const sleep = vi.fn()
    expect(waitForUnlockedCollection(() => states[i++], Date.now() + 10_000, sleep)).toBe(
      'unlocked'
    )
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('gives up at the deadline and returns immediately when not locked', () => {
    const sleep = vi.fn()
    expect(waitForUnlockedCollection(() => 'locked', Date.now() - 1, sleep)).toBe('locked')
    expect(waitForUnlockedCollection(() => 'unavailable', Date.now() + 10_000, sleep)).toBe(
      'unavailable'
    )
    expect(sleep).not.toHaveBeenCalled()
  })
})
