import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchDeckAgentInPane } from './deck-agent-split'

const fixture = vi.hoisted(() => {
  const owner: { environmentId: string | null; activeWorktreeId: string } = {
    environmentId: null,
    activeWorktreeId: 'wt-1'
  }
  return { setLayout: vi.fn(), owner, call: vi.fn(), focus: vi.fn(), plan: vi.fn() }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      settings: {},
      activeWorktreeId: fixture.owner.activeWorktreeId,
      activeTabId: 'tab-1',
      terminalLayoutsByTabId: { 'tab-1': { root: { type: 'leaf', leafId: 'new-leaf' } } },
      setTabLayout: fixture.setLayout
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
        launchAgent: 'codex',
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

  it('passes only the chosen account into the new split and declares its CLI', async () => {
    fixture.plan.mockImplementation((args) => ({ launchCommand: 'custom-cli', env: args.agentEnv }))
    await launchDeckAgentInPane('wt-1', pane, 'codex', { accountId: 'account-b' })
    expect(fixture.call.mock.calls[1][2]).toMatchObject({
      command: 'custom-cli',
      launchAgent: 'codex',
      env: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'account-b' }
    })
  })

  it('refuses to send a local account to a paired host', async () => {
    fixture.owner.environmentId = 'remote-1'
    await expect(
      launchDeckAgentInPane('wt-1', pane, 'codex', { accountId: 'account-b' })
    ).rejects.toThrow('host')
    expect(fixture.call).not.toHaveBeenCalled()
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

it('keeps the chosen history title on the new pane, without renaming its sibling', async () => {
  fixture.call
    .mockReset()
    .mockResolvedValueOnce({ terminal: { handle: 'source' } })
    .mockResolvedValueOnce({ split: { leafId: 'new-leaf' } })
  fixture.owner.environmentId = null
  await launchDeckAgentInPane('wt-1', pane, 'claude', {
    startup: { command: 'claude --resume saved' },
    sessionTitle: 'Yesterday review'
  })
  expect(fixture.setLayout).toHaveBeenCalledWith(
    'tab-1',
    expect.objectContaining({ titlesByLeafId: { 'new-leaf': 'Yesterday review' } })
  )
})
