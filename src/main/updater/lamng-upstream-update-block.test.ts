import { afterEach, describe, expect, it } from 'vitest'
import { isLamngUpstreamUpdateBlocked } from './lamng-upstream-update-block'

const flagHost = globalThis as { ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES?: boolean }

describe('isLamngUpstreamUpdateBlocked', () => {
  afterEach(() => {
    delete flagHost.ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES
  })

  it('keeps upstream updater behaviour when the build define is absent', () => {
    expect(isLamngUpstreamUpdateBlocked()).toBe(false)
  })

  it('blocks the upstream feed when the Lamng build flag is set', () => {
    flagHost.ORCA_LAMNG_BLOCK_UPSTREAM_UPDATES = true
    expect(isLamngUpstreamUpdateBlocked()).toBe(true)
  })
})
