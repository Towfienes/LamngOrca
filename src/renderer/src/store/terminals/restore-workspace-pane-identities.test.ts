import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreWorkspacePaneIdentities } from './restore-workspace-pane-identities'
import { createTestStore, makeTab } from '../slices/store-test-helpers'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
const leaf = '11111111-1111-4111-8111-111111111111'
const paneKey = `tab:${leaf}`
const read = vi.fn<(id: string) => Promise<string | null>>()
const inventory = vi.fn<() => Promise<{ id: string }[]>>()
beforeEach(() => {
  read.mockReset().mockResolvedValue('codex')
  inventory.mockReset().mockResolvedValue([{ id: 'pty-local' }])
  Object.defineProperty(globalThis, 'window', {
    value: {
      api: {
        pty: {
          getForegroundProcess: read,
          listSessions: inventory
        }
      }
    },
    configurable: true
  })
})
function setup(ptyId = 'pty-local') {
  const store = createTestStore()
  store.setState({
    tabsByWorktree: { folder: [makeTab({ id: 'tab', worktreeId: 'folder' })] },
    ptyIdsByTabId: { tab: [ptyId] },
    terminalLayoutsByTabId: {
      tab: {
        root: { type: 'leaf', leafId: leaf },
        activeLeafId: leaf,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leaf]: ptyId }
      }
    }
  })
  return store
}
describe('restored pane identities before workspace activation', () => {
  it('waits for daemon inventory before reading an unattached saved PTY', async () => {
    const store = setup()
    let settle: (sessions: { id: string }[]) => void = () => {}
    inventory.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve
        })
    )
    const pending = restoreWorkspacePaneIdentities(store.getState, ['folder'])
    expect(read).not.toHaveBeenCalled()
    settle([{ id: 'pty-local' }])
    await pending
    expect(read).toHaveBeenCalledOnce()
  })

  it('bounds concurrent reads and does not repeat confirmed identities', async () => {
    const store = setup()
    const tabs = Array.from({ length: 8 }, (_, i) =>
      makeTab({ id: `tab-${i}`, worktreeId: 'folder' })
    )
    store.setState({
      tabsByWorktree: { folder: tabs },
      ptyIdsByTabId: Object.fromEntries(tabs.map((tab) => [tab.id, [tab.id]])),
      terminalLayoutsByTabId: Object.fromEntries(
        tabs.map((tab) => [
          tab.id,
          {
            root: { type: 'leaf' as const, leafId: leaf },
            activeLeafId: leaf,
            expandedLeafId: null,
            ptyIdsByLeafId: { [leaf]: tab.id }
          }
        ])
      )
    })
    inventory.mockResolvedValue(tabs.map((tab) => ({ id: tab.id })))
    let pendingReads = 0
    let peak = 0
    read.mockImplementation(async () => {
      pendingReads++
      peak = Math.max(peak, pendingReads)
      await new Promise((resolve) => setTimeout(resolve, 5))
      pendingReads--
      return 'claude'
    })
    await restoreWorkspacePaneIdentities(store.getState, ['folder'])
    expect(peak).toBe(4)
    expect(read).toHaveBeenCalledTimes(8)
    await restoreWorkspacePaneIdentities(store.getState, ['folder'])
    expect(read).toHaveBeenCalledTimes(8)
  })

  it('reads the saved PTY once and publishes identity without constructing a terminal', async () => {
    const store = setup()
    await restoreWorkspacePaneIdentities(store.getState, ['folder'])
    expect(read).toHaveBeenCalledExactlyOnceWith('pty-local')
    expect(inventory).toHaveBeenCalledExactlyOnceWith({ connectionId: null })
    expect(store.getState().paneForegroundAgentByPaneKey[paneKey]).toEqual({
      agent: 'codex',
      agentEvidence: 'process-read',
      shellForeground: false
    })
    expect(store.getState().agentStatusByPaneKey).toEqual({})
  })
  it('does not route SSH or paired-runtime PTYs to the local provider', async () => {
    for (const id of ['ssh:host@@pty-remote', 'remote:term_remote']) {
      const store = setup(id)
      await restoreWorkspacePaneIdentities(store.getState, ['folder'])
      expect(store.getState().paneForegroundAgentByPaneKey).toEqual({})
    }
    expect(read).not.toHaveBeenCalled()
  })
  it('discards a result when the pane is replaced while inspection is in flight', async () => {
    const store = setup()
    let settle: (name: string) => void = () => {}
    read.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve
        })
    )
    const pending = restoreWorkspacePaneIdentities(store.getState, ['folder'])
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    const layout = store.getState().terminalLayoutsByTabId.tab
    store.setState({
      terminalLayoutsByTabId: { tab: { ...layout, ptyIdsByLeafId: { [leaf]: 'new-pty' } } }
    })
    settle('claude')
    await pending
    expect(store.getState().paneForegroundAgentByPaneKey).toEqual({})
  })
  it('preserves a newer mounted-pane observation and treats transport loss as unknown', async () => {
    const store = setup()
    let settle: (name: string) => void = () => {}
    read.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve
        })
    )
    const pending = restoreWorkspacePaneIdentities(store.getState, ['folder'])
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
    store.getState().setPaneForegroundAgent(paneKey, { agent: null, shellForeground: true })
    settle('claude')
    await pending
    expect(store.getState().paneForegroundAgentByPaneKey[paneKey]?.shellForeground).toBe(true)
    store.getState().clearPaneForegroundAgent(paneKey)
    read.mockRejectedValue(new Error('Connection lost'))
    await restoreWorkspacePaneIdentities(store.getState, ['folder'])
    expect(store.getState().ptyIdsByTabId.tab).toEqual(['pty-local'])
    expect(store.getState().paneForegroundAgentByPaneKey).toEqual({})
  })
  it('does not inspect aborted restores', async () => {
    const store = setup()
    const controller = new AbortController()
    controller.abort()
    await restoreWorkspacePaneIdentities(store.getState, ['folder'], controller.signal)
    expect(read).not.toHaveBeenCalled()
  })
})
