import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activateAndRevealFolderWorkspace: vi.fn(),
  activateAndRevealWorktree: vi.fn(),
  getState: vi.fn(),
  ensureWorktreeRootGroup: vi.fn(),
  gate: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/worktree-agent-activation-gate', () => ({ gateWorktreeAgentActivation: mocks.gate }))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: mocks.activateAndRevealFolderWorkspace,
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))

import { activateWorktreeFromSidebar } from './sidebar-worktree-activation'

describe('sidebar worktree activation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.gate.mockResolvedValue('empty')
    mocks.getState.mockReturnValue({
      activeWorktreeId: null,
      reconcileWorktreeTabModel: () => ({ renderableTabCount: 0 }),
      ensureWorktreeRootGroup: mocks.ensureWorktreeRootGroup
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('activates a clicked worktree without sidebar reveal', async () => {
    await activateWorktreeFromSidebar('wt-live')

    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-live', {
      navigationIntent: 'user-open',
      providesInitialSurface: true,
      revealInSidebar: false
    })
    expect(mocks.activateAndRevealFolderWorkspace).not.toHaveBeenCalled()
  })

  it('does not defer non-VM slept worktree selection behind terminal wake work', async () => {
    await activateWorktreeFromSidebar('wt-slept')

    // Why: setActiveWorktree already defers terminal prep where needed. The
    // sidebar click itself must switch app state immediately.
    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledTimes(1)
    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-slept', {
      navigationIntent: 'user-open',
      providesInitialSurface: true,
      revealInSidebar: false
    })
  })

  it('switches immediately while an ephemeral runtime wake is pending', async () => {
    let resolveResume: ((value: null) => void) | undefined
    const resumeWorkspace = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveResume = resolve
        })
    )
    vi.stubGlobal('window', {
      api: { ephemeralVm: { resumeWorkspace } }
    })

    const activation = activateWorktreeFromSidebar('wt-vm')

    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('wt-vm', {
      navigationIntent: 'user-open',
      providesInitialSurface: true,
      revealInSidebar: false
    })
    expect(resumeWorkspace).toHaveBeenCalledWith({ workspaceId: 'wt-vm' })

    resolveResume?.(null)
    await activation
  })

  it('routes folder workspace activation through the guarded folder path', async () => {
    await activateWorktreeFromSidebar('folder:folder-workspace-1')

    expect(mocks.activateAndRevealFolderWorkspace).toHaveBeenCalledWith('folder-workspace-1', {
      navigationIntent: 'user-open',
      providesInitialSurface: true
    })
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
  })

  it.each(['wt-empty', 'folder:folder-workspace-1'])(
    'selects empty workspace %s without opening a launcher',
    async (worktreeId) => {
      const dispatchEvent = vi.fn()
      vi.stubGlobal('window', { dispatchEvent })
      mocks.getState.mockReturnValue({
        activeWorktreeId: worktreeId,
        reconcileWorktreeTabModel: () => ({ renderableTabCount: 0 }),
        ensureWorktreeRootGroup: mocks.ensureWorktreeRootGroup
      })
      await activateWorktreeFromSidebar(worktreeId)
      expect(mocks.ensureWorktreeRootGroup).toHaveBeenCalledWith(worktreeId)
      expect(mocks.gate).toHaveBeenCalledWith(worktreeId)
      await activateWorktreeFromSidebar(worktreeId)
      expect(dispatchEvent).not.toHaveBeenCalled()
    }
  )

  it('keeps existing editor/browser/agent surfaces and declined activations unchanged', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    mocks.getState.mockReturnValue({
      activeWorktreeId: 'wt-existing',
      reconcileWorktreeTabModel: () => ({ renderableTabCount: 1 }),
      ensureWorktreeRootGroup: mocks.ensureWorktreeRootGroup
    })
    await activateWorktreeFromSidebar('wt-existing')
    mocks.activateAndRevealWorktree.mockReturnValue(false)
    await activateWorktreeFromSidebar('wt-existing')
    expect(dispatchEvent).not.toHaveBeenCalled()
    expect(mocks.ensureWorktreeRootGroup).not.toHaveBeenCalled()
  })

  it('does not show a launch menu when the host cannot confirm its inventory or restores an agent', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    mocks.getState.mockReturnValue({
      activeWorktreeId: 'wt-remote',
      reconcileWorktreeTabModel: () => ({ renderableTabCount: 0 }),
      ensureWorktreeRootGroup: mocks.ensureWorktreeRootGroup
    })
    for (const outcome of ['blocked', 'adopted', 'structured', 'resumed']) {
      mocks.gate.mockResolvedValue(outcome)
      await activateWorktreeFromSidebar('wt-remote')
    }
    expect(dispatchEvent).not.toHaveBeenCalled()
  })
})
