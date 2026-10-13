import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchDeckAgentInPane } from './deck-agent-split'

const fixture = vi.hoisted(() => {
  const owner: { environmentId: string | null; activeWorktreeId: string } = {
    environmentId: null,
    activeWorktreeId: 'wt-1'
  }
  return { owner, call: vi.fn(), focus: vi.fn(), plan: vi.fn() }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: {},
      activeWorktreeId: fixture.owner.activeWorktreeId,
      activeTabId: 'tab-1'
    })
  }
}))
vi.mock('@/lib/launch-agent-execution-context', () => ({
  resolveAgentLaunchExecutionContext: () => ({
    resolvedLaunchPlatform: 'linux',
    isRemote: false,
    queuedShell: undefined
  })
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => fixture.owner.environmentId
}))
vi.mock('@/lib/tui-agent-startup', () => ({ buildAgentStartupPlan: fixture.plan }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.call }))
vi.mock('@/runtime/runtime-environment-revision', () => ({
  captureRuntimeEnvironmentRequestRevision: () => 42
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: fixture.focus }))

const pane = {
  tabId: 'tab-1',
  leafId: '11111111-1111-4111-8111-111111111111',
  direction: 'vertical'
} as const

describe('Deck agent pane launch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.owner.environmentId = null
    fixture.owner.activeWorktreeId = 'wt-1'
    fixture.plan.mockReturnValue({
      launchCommand: 'agent --configured',
      env: { AGENT_MODE: 'test' }
    })
    fixture.call.mockReset()
    fixture.call
      .mockResolvedValueOnce({ terminal: { handle: 'source-handle' } })
      .mockResolvedValueOnce({ split: { leafId: 'new-leaf' } })
  })

  it('resolves the exact leaf and asks its host to split with the configured command and environment', async () => {
    await launchDeckAgentInPane('wt-1', pane, 'codex')
    expect(fixture.call).toHaveBeenNthCalledWith(
      1,
      { kind: 'local' },
      'terminal.resolvePane',
      {
        paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
        worktreeId: 'wt-1'
      },
      {}
    )
    expect(fixture.call).toHaveBeenNthCalledWith(
      2,
      { kind: 'local' },
      'terminal.split',
      {
        terminal: 'source-handle',
        direction: 'vertical',
        command: 'agent --configured',
        env: { AGENT_MODE: 'test' },
        telemetrySource: 'context_menu'
      },
      {}
    )
    expect(fixture.focus).toHaveBeenCalledWith('tab-1', 'new-leaf')
  })

  it('keeps paired calls on the same host revision and uses the host tab identity', async () => {
    fixture.owner.environmentId = 'remote-1'
    await launchDeckAgentInPane('wt-1', { ...pane, tabId: 'web-terminal-tab-1' }, 'codex')
    expect(fixture.call).toHaveBeenNthCalledWith(
      1,
      { kind: 'environment', environmentId: 'remote-1' },
      'terminal.resolvePane',
      { paneKey: 'tab-1:11111111-1111-4111-8111-111111111111', worktreeId: 'wt-1' },
      { expectedEnvironmentPairingRevision: 42 }
    )
    expect(fixture.call.mock.calls[1][0]).toEqual({
      kind: 'environment',
      environmentId: 'remote-1'
    })
    expect(fixture.call.mock.calls[1][3]).toEqual({ expectedEnvironmentPairingRevision: 42 })
    expect(fixture.plan).toHaveBeenCalledWith(expect.objectContaining({ isRemote: true }))
  })

  it('does not launch into a different pane if the selected leaf disappeared', async () => {
    fixture.call.mockReset().mockRejectedValueOnce(new Error('terminal_handle_stale'))
    await expect(launchDeckAgentInPane('wt-1', pane, 'codex')).rejects.toThrow(
      'terminal_handle_stale'
    )
    expect(fixture.call).toHaveBeenCalledTimes(1)
    expect(fixture.focus).not.toHaveBeenCalled()
  })

  it('does not take focus back after navigating away during launch', async () => {
    fixture.owner.activeWorktreeId = 'other-workspace'
    await launchDeckAgentInPane('wt-1', pane, 'codex')
    expect(fixture.focus).not.toHaveBeenCalled()
  })
})
