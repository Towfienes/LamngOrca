// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enableDeckUsageTrackingOnce } from './deck-usage-tracking'

const store = vi.hoisted(() => ({
  state: {} as Record<string, unknown>
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => store.state } }))

const claudeScan = vi.fn()
const codexScan = vi.fn()
const setClaude = vi.fn()
const setCodex = vi.fn()

function setup(claude: boolean | undefined, codex: boolean | undefined): void {
  claudeScan.mockResolvedValue(claude === undefined ? undefined : { enabled: claude })
  codexScan.mockResolvedValue(codex === undefined ? undefined : { enabled: codex })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  setClaude.mockImplementation(async (enabled: boolean) => {
    store.state.claudeUsageScanState = { enabled }
  })
  setCodex.mockImplementation(async (enabled: boolean) => {
    store.state.codexUsageScanState = { enabled }
  })
  store.state = {
    claudeUsageScanState: null,
    codexUsageScanState: null,
    setClaudeUsageEnabled: setClaude,
    setCodexUsageEnabled: setCodex
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      claudeUsage: { getScanState: claudeScan },
      codexUsage: { getScanState: codexScan }
    }
  })
})

describe('enableDeckUsageTrackingOnce', () => {
  it('turns on both providers when tracking was never enabled', async () => {
    setup(false, false)
    await expect(enableDeckUsageTrackingOnce()).resolves.toBe(true)
    expect(setClaude).toHaveBeenCalledWith(true)
    expect(setCodex).toHaveBeenCalledWith(true)
  })

  it('does not turn tracking back on after the user disables it later', async () => {
    setup(false, false)
    await enableDeckUsageTrackingOnce()
    vi.clearAllMocks()
    await expect(enableDeckUsageTrackingOnce()).resolves.toBe(false)
    expect(claudeScan).not.toHaveBeenCalled()
    expect(setClaude).not.toHaveBeenCalled()
    expect(setCodex).not.toHaveBeenCalled()
  })

  it('keeps an existing per-provider choice', async () => {
    setup(true, false)
    await expect(enableDeckUsageTrackingOnce()).resolves.toBe(false)
    expect(setClaude).not.toHaveBeenCalled()
    expect(setCodex).not.toHaveBeenCalled()
  })

  it('retries on the next open when enabling failed', async () => {
    setup(false, false)
    setClaude.mockResolvedValueOnce(undefined)
    await expect(enableDeckUsageTrackingOnce()).resolves.toBe(false)
    await expect(enableDeckUsageTrackingOnce()).resolves.toBe(true)
    expect(setClaude).toHaveBeenCalledTimes(2)
  })

  it('does nothing in clients without desktop usage APIs', async () => {
    setup(undefined, undefined)
    await expect(enableDeckUsageTrackingOnce()).resolves.toBe(false)
    expect(setClaude).not.toHaveBeenCalled()
  })

  it('starts one enable when two panels ask at once', async () => {
    setup(false, false)
    await Promise.all([enableDeckUsageTrackingOnce(), enableDeckUsageTrackingOnce()])
    expect(setClaude).toHaveBeenCalledTimes(1)
  })
})
