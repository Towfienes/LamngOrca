import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeSidebarAgentPane } from './close-sidebar-agent-pane'

const fixture = vi.hoisted(
  (): { environmentId: string | null; call: ReturnType<typeof vi.fn> } => ({
    environmentId: null,
    call: vi.fn()
  })
)
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => fixture.environmentId
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.call }))
vi.mock('@/runtime/runtime-environment-revision', () => ({
  captureRuntimeEnvironmentRequestRevision: () => 42
}))

const paneKey = 'tab-1:11111111-1111-4111-8111-111111111111'
describe('sidebar agent pane close', () => {
  beforeEach(() => {
    fixture.environmentId = null
    fixture.call
      .mockReset()
      .mockResolvedValueOnce({ terminal: { handle: 'exact-handle' } })
      .mockResolvedValueOnce({ close: { ptyKilled: true } })
  })
  it('closes the resolved pane rather than just forgetting its status', async () => {
    await closeSidebarAgentPane('wt-1', paneKey)
    expect(fixture.call).toHaveBeenNthCalledWith(
      1,
      { kind: 'local' },
      'terminal.resolvePane',
      { paneKey, worktreeId: 'wt-1' },
      {}
    )
    expect(fixture.call).toHaveBeenNthCalledWith(
      2,
      { kind: 'local' },
      'terminal.close',
      { terminal: 'exact-handle' },
      {}
    )
  })
  it('keeps the remote host and revision for both operations', async () => {
    fixture.environmentId = 'remote-1'
    await closeSidebarAgentPane('wt-1', `web-terminal-${paneKey}`)
    expect(fixture.call).toHaveBeenNthCalledWith(
      2,
      { kind: 'environment', environmentId: 'remote-1' },
      'terminal.close',
      { terminal: 'exact-handle' },
      { expectedEnvironmentPairingRevision: 42 }
    )
  })
  it('reports an unconfirmed remote stop instead of treating it as exited', async () => {
    fixture.call
      .mockReset()
      .mockResolvedValueOnce({ terminal: { handle: 'exact-handle' } })
      .mockResolvedValueOnce({
        close: {
          ptyKilled: false,
          ptyStopVerdict: 'unverifiable',
          ptyStopReason: 'Host unreachable'
        }
      })
    await expect(closeSidebarAgentPane('wt-1', paneKey)).rejects.toThrow('Host unreachable')
  })
  it('does not close another pane when resolution fails', async () => {
    fixture.call.mockReset().mockRejectedValueOnce(new Error('terminal_handle_stale'))
    await expect(closeSidebarAgentPane('wt-1', paneKey)).rejects.toThrow('terminal_handle_stale')
    expect(fixture.call).toHaveBeenCalledTimes(1)
  })
})
