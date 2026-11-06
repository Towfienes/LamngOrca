// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import type { TerminalLayoutSnapshot } from '../../../../shared/workspace-layout/terminal-tab-types'

const mocks = vi.hoisted(() => ({ move: vi.fn(), focus: vi.fn(), owned: false, send: vi.fn() }))
const leaf = '11111111-1111-4111-8111-111111111111'
const sibling = '22222222-2222-4222-8222-222222222222'
const targetLeaf = '33333333-3333-4333-8333-333333333333'
const layouts: Record<string, TerminalLayoutSnapshot> = {}
const state = {
  unifiedTabsByWorktree: {
    wt: [
      { id: 'a', entityId: 'source', groupId: 'g', contentType: 'terminal' },
      { id: 'b', entityId: 'target', groupId: 'g', contentType: 'terminal' }
    ]
  },
  tabsByWorktree: { wt: [{ id: 'source' }, { id: 'target' }] },
  terminalLayoutsByTabId: layouts,
  setTabLayout: vi.fn((id: string, layout: TerminalLayoutSnapshot | null) => {
    if (layout) {
      layouts[id] = layout
    } else {
      delete layouts[id]
    }
  }),
  syncPaneDetachPtyOwnership: vi.fn(),
  closeTab: vi.fn(),
  createTab: vi.fn(),
  setActiveTab: vi.fn(),
  setActiveTabType: vi.fn(),
  activateTab: vi.fn()
}
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: mocks.focus }))
vi.mock('@/runtime/layout-owner-command', () => ({ sendLayoutCommandToOwner: mocks.send }))
vi.mock('../../../../shared/layout-owner-switch', () => ({
  get ORCA_LAYOUT_OWNER_IS_MAIN() {
    return mocks.owned
  }
}))
const { moveWorkspaceIcon } = await import('./workspace-icon-move')
const { useWorkspaceLaunchSelection } = await import('@/store/workspace-launch-selection')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.owned = false
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { pty: { moveLeafToNewTab: mocks.move } }
  })
  layouts.source = {
    root: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      first: { type: 'leaf', leafId: leaf },
      second: { type: 'leaf', leafId: sibling }
    },
    activeLeafId: leaf,
    expandedLeafId: null,
    ptyIdsByLeafId: { [leaf]: 'same-live-pty', [sibling]: 'sibling-pty' },
    buffersByLeafId: { [leaf]: 'source scrollback' }
  }
  layouts.target = {
    root: { type: 'leaf', leafId: targetLeaf },
    activeLeafId: targetLeaf,
    expandedLeafId: null,
    ptyIdsByLeafId: { [targetLeaf]: 'target-pty' },
    buffersByLeafId: { [targetLeaf]: 'target scrollback' }
  }
  mocks.move.mockResolvedValue({ status: 'moved', ptyId: 'same-live-pty' })
  useWorkspaceLaunchSelection.setState({ workspaceId: null, layouts: {} })
  useWorkspaceLaunchSelection.getState().reconcile('wt', 'g', ['a', 'b'])
})

it('merges the selected icon, preserving both PTYs, scrollback and the source sibling', async () => {
  expect(await moveWorkspaceIcon('wt', 'g', 'a', leaf, 1, 'b')).toBe(true)
  expect(mocks.move).toHaveBeenCalledExactlyOnceWith({
    worktreeId: 'wt',
    sourceTabId: 'source',
    targetTabId: 'target',
    leafId: leaf,
    ptyId: 'same-live-pty',
    intoExistingTab: true
  })
  expect(layouts.source.ptyIdsByLeafId).toEqual({ [sibling]: 'sibling-pty' })
  expect(layouts.target.ptyIdsByLeafId).toEqual({
    [targetLeaf]: 'target-pty',
    [leaf]: 'same-live-pty'
  })
  expect(layouts.target.buffersByLeafId).toEqual({
    [targetLeaf]: 'target scrollback',
    [leaf]: 'source scrollback'
  })
  expect(state.createTab).not.toHaveBeenCalled()
  expect(state.closeTab).not.toHaveBeenCalled()
  expect(mocks.focus).toHaveBeenCalledWith('target', leaf)
})

it('leaves both surfaces untouched when main refuses or persistence fails', async () => {
  const before = structuredClone(layouts)
  mocks.move.mockResolvedValueOnce({ status: 'refused', reason: 'target_tab_exists' })
  expect(await moveWorkspaceIcon('wt', 'g', 'a', leaf, 1, 'b')).toBe(false)
  expect(layouts).toEqual(before)
  mocks.move.mockRejectedValueOnce(new Error('disk full'))
  await expect(moveWorkspaceIcon('wt', 'g', 'a', leaf, 1, 'b')).rejects.toThrow('disk full')
  expect(layouts).toEqual(before)
  expect(state.syncPaneDetachPtyOwnership).not.toHaveBeenCalled()
  expect(state.closeTab).not.toHaveBeenCalled()
})

it('rejects stale or cross-group payloads and a second drop while a move is pending', async () => {
  expect(await moveWorkspaceIcon('wt', 'other-group', 'a', leaf, 1, 'b')).toBe(false)
  expect(await moveWorkspaceIcon('wt', 'g', 'a', 'missing-leaf', 1, 'b')).toBe(false)
  expect(await moveWorkspaceIcon('wt', 'g', 'a', leaf, -1, 'b')).toBe(false)
  let finish!: (value: { status: 'moved'; ptyId: string }) => void
  mocks.move.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const first = moveWorkspaceIcon('wt', 'g', 'a', leaf, 1, 'b')
  expect(await moveWorkspaceIcon('wt', 'g', 'a', sibling, 1, 'b')).toBe(false)
  finish({ status: 'moved', ptyId: 'same-live-pty' })
  expect(await first).toBe(true)
  expect(mocks.move).toHaveBeenCalledTimes(1)
})

it('keeps desktop PTY bindings when a paired owner replies with its server PTY id', async () => {
  mocks.owned = true
  mocks.send.mockImplementation((_workspace, _command, handlers) => {
    handlers.apply(
      { tabId: 'target', ptyId: 'server-only-pty' },
      { routed: true, framesKey: 'remote' }
    )
    return true
  })
  expect(await moveWorkspaceIcon('wt', 'g', 'a', leaf, 1, 'b')).toBe(true)
  expect(layouts.target.ptyIdsByLeafId?.[leaf]).toBe('same-live-pty')
  expect(mocks.move).not.toHaveBeenCalled()
})
