import { afterEach, expect, it, vi } from 'vitest'
import { setRuntimeDesktopSurface } from './runtime-desktop-surface'
import { createDesktopTerminal } from './orca-runtime-create-terminal-desktop'
import { wireHeadlessServeRuntime } from './orca-runtime-test-scenario-builders.spec'

function fakeRuntime(reply: { tabId: string; leafId?: string }) {
  const handlers = new Map<string, (event: unknown, response: unknown) => void>()
  const webContents = {
    send: (channel: string, payload: { requestId: string }) => {
      if (channel === 'terminal:requestTabCreate') {
        handlers.get('terminal:tabCreateReply')?.(
          { sender: webContents },
          { requestId: payload.requestId, ...reply }
        )
      }
    }
  }
  setRuntimeDesktopSurface({
    showNotification: () => false,
    findWindowById: () => null,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the tab-create reply channel is registered on this path.
    onIpc: (channel, listener) => handlers.set(channel, listener as never),
    removeIpcListener: (channel) => handlers.delete(channel)
  })
  return {
    assertGraphReady: () => {},
    getAuthoritativeWindow: () => ({ webContents }),
    resolveTerminalWorkspaceLaunchScope: async () => ({ id: 'wt', path: '/wt' }),
    resolveAgentTerminalCreateOptions: async (_workspace: unknown, opts: unknown) => opts,
    resolveWorkspaceTerminalStartupCwd: () => '/wt',
    waitForTerminalHandle: vi.fn(async () => 'handle-first-pane'),
    waitForLeafInTab: vi.fn(async () => 'handle-joined-pane'),
    getPtyExecutionHostMetadata: () => ({}),
    handles: new Map()
  }
}

afterEach(() => setRuntimeDesktopSurface(null))

it('returns the joined pane when the renderer split the agent into an open tab', async () => {
  const runtime = fakeRuntime({ tabId: 'tab-1', leafId: 'leaf-new' })
  const created = await createDesktopTerminal(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the desktop create path reads only the members faked above.
    runtime as never,
    { command: 'claude' },
    undefined
  )
  expect(runtime.waitForLeafInTab).toHaveBeenCalledWith('tab-1', 'leaf-new')
  expect(runtime.waitForTerminalHandle).not.toHaveBeenCalled()
  expect(created).toMatchObject({ handle: 'handle-joined-pane', tabId: 'tab-1' })
})

it('keeps resolving the new tab handle when the renderer opened a tab', async () => {
  const runtime = fakeRuntime({ tabId: 'tab-2' })
  const created = await createDesktopTerminal(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the desktop create path reads only the members faked above.
    runtime as never,
    { command: 'bash' },
    undefined
  )
  expect(runtime.waitForTerminalHandle).toHaveBeenCalledWith('tab-2')
  expect(runtime.waitForLeafInTab).not.toHaveBeenCalled()
  expect(created.handle).toBe('handle-first-pane')
})

it('tells a workspace-less create on a windowless host to pass --worktree', async () => {
  const runtime = wireHeadlessServeRuntime()

  await expect(runtime.createTerminal(undefined, { title: 'probe' })).rejects.toThrow(
    /No workspace was given or found.*Pass --worktree.*No terminal was created\./
  )
})
