import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  split: vi.fn(),
  resolve: vi.fn(() => ({ tabId: 'old-tab' })),
  createTab: vi.fn(() => ({ id: 'new-tab' })),
  active: vi.fn(),
  type: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: {},
      createTab: mocks.createTab,
      setActiveTab: mocks.active,
      setActiveTabType: mocks.type
    })
  }
}))
vi.mock('@/lib/launch-agent-execution-context', () => ({
  resolveAgentLaunchExecutionContext: () => ({
    isRemote: false,
    worktreeSshConnectionId: null,
    resolvedLaunchPlatform: 'linux'
  })
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => null
}))
vi.mock('@/lib/tui-agent-startup', () => ({
  buildAgentStartupPlan: () => ({ launchCommand: 'codex' })
}))
vi.mock('./deck-agent-split', () => ({
  resolveDeckAgentSplitTarget: mocks.resolve,
  launchDeckAgentInPane: mocks.split
}))
import { launchDeckAccountAgent } from './deck-account-agent-launch'
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('opens a separate workspace tab when Quick Launch explicitly requests no split', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Linux' })
  expect(await launchDeckAccountAgent('wt', 'group', 'codex', undefined, undefined, null)).toBe(
    'new-tab'
  )
  expect(mocks.createTab).toHaveBeenCalledOnce()
  expect(mocks.resolve).not.toHaveBeenCalled()
  expect(mocks.split).not.toHaveBeenCalled()
})

it('retains automatic split placement when no placement was provided', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Linux' })
  expect(await launchDeckAccountAgent('wt', 'group', 'codex')).toBe('old-tab')
  expect(mocks.resolve).toHaveBeenCalledOnce()
  expect(mocks.split).toHaveBeenCalledOnce()
  expect(mocks.createTab).not.toHaveBeenCalled()
})
