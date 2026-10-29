import { afterEach, beforeEach } from 'vitest'

/** Pins process.platform for every test in the calling suite and restores the real one afterwards. */
export function pinProcessPlatform(platform: NodeJS.Platform): void {
  const original = process.platform
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  })
}
