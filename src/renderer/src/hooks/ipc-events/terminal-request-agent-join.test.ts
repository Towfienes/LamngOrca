// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import type { RuntimeTerminalCreateRequestPayload } from '../../../../shared/runtime-terminal-contracts'

const route = vi.hoisted(() => vi.fn())
vi.mock('./terminal-ui-routing-ipc-bridge', () => ({ routeRuntimeTerminalSplitRequest: route }))
const { joinAgentIntoOpenWorkspace, shouldJoinOpenWorkspace } =
  await import('./terminal-request-agent-join')

function store(activeTabId: string | null = 't1') {
  return {
    activeTabId,
    groupsByWorktree: { wt: [{ id: 'g1', activeTabId: 'u1', tabOrder: ['u1'] }] },
    activeGroupIdByWorktree: { wt: 'g1' },
    unifiedTabsByWorktree: {
      wt: [{ id: 'u1', entityId: 't1', groupId: 'g1', contentType: 'terminal' }]
    },
    terminalLayoutsByTabId: {
      t1: { root: { type: 'leaf' as const, leafId: 'leaf-a' }, activeLeafId: 'leaf-a' }
    }
  }
}

const agentLaunch: RuntimeTerminalCreateRequestPayload = {
  requestId: 'r1',
  worktreeId: 'wt',
  command: 'claude --model sonnet',
  env: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'acc' },
  launchToken: 'token-1',
  launchAgent: 'claude',
  startupCommandDelivery: 'shell-ready'
}

beforeEach(() => route.mockClear())

it('joins only agent launches without an explicit placement or shell', () => {
  expect(shouldJoinOpenWorkspace(agentLaunch)).toBe(true)
  expect(shouldJoinOpenWorkspace({ ...agentLaunch, launchAgent: undefined })).toBe(true)
  expect(
    shouldJoinOpenWorkspace({ ...agentLaunch, launchAgent: undefined, launchToken: undefined })
  ).toBe(false)
  expect(shouldJoinOpenWorkspace({ ...agentLaunch, command: undefined })).toBe(false)
  expect(shouldJoinOpenWorkspace({ ...agentLaunch, targetGroupId: 'g2' })).toBe(false)
  expect(shouldJoinOpenWorkspace({ ...agentLaunch, afterTabId: 'u1' })).toBe(false)
  expect(shouldJoinOpenWorkspace({ ...agentLaunch, shellOverride: 'pwsh.exe' })).toBe(false)
  expect(
    shouldJoinOpenWorkspace({ ...agentLaunch, worktreeId: 'wt', source: 'runtime-session' })
  ).toBe(false)
})

it('splits the agent into the open tab carrying its launch token and startup', () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the join reads only the fields seeded in store().
  const joined = joinAgentIntoOpenWorkspace(store() as never, 'wt', agentLaunch, true)
  expect(joined).toEqual({ tabId: 't1', leafId: expect.any(String) })
  expect(route).toHaveBeenCalledWith(
    expect.objectContaining({
      tabId: 't1',
      worktreeId: 'wt',
      sourceLeafId: 'leaf-a',
      direction: 'vertical',
      newLeafId: joined?.leafId,
      startup: {
        command: 'claude --model sonnet',
        env: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'acc' },
        launchToken: 'token-1',
        launchAgent: 'claude',
        startupCommandDelivery: 'shell-ready'
      }
    })
  )
  expect(route.mock.calls[0]?.[0]).not.toHaveProperty('activate')
})

it('splits without taking the active pane for background launches', () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the join reads only the fields seeded in store().
  joinAgentIntoOpenWorkspace(store() as never, 'wt', agentLaunch, false)
  expect(route).toHaveBeenCalledWith(expect.objectContaining({ activate: false }))
})

it('opens a tab as before when the worktree has no terminal tab', () => {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the join reads only the fields seeded below.
  const empty = { ...store(), groupsByWorktree: {} } as never
  expect(joinAgentIntoOpenWorkspace(empty, 'wt', agentLaunch, true)).toBeNull()
  expect(route).not.toHaveBeenCalled()
})
