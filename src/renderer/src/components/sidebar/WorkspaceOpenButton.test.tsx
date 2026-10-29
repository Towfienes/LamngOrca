// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { selectWorkspaceChromeTarget } from '@/lib/workspace-chrome-target'

const mocks = vi.hoisted(() => ({ open: vi.fn(), folder: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))
const { createTestStore, makeWorktree, seedStore, TEST_REPO } =
  await import('@/store/slices/store-test-helpers')
const store = createTestStore()
vi.mock('@/store', () => ({ useAppStore: store }))
const { WorkspaceOpenButton } = await import('./WorkspaceOpenButton')

function mount(application: 'vscode' | 'file-manager' = 'vscode'): HTMLButtonElement {
  render(
    <TooltipProvider>
      <WorkspaceOpenButton application={application} />
    </TooltipProvider>
  )
  return screen.getByRole('button', {
    name:
      application === 'vscode'
        ? 'Open workspace in VS Code'
        : /Open workspace in (File Manager|Finder|File Explorer)/
  })
}

describe('workspace VS Code action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.open.mockResolvedValue({ ok: true })
    mocks.folder.mockResolvedValue({ ok: true })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { shell: { openInExternalEditor: mocks.open, openInFileManager: mocks.folder } }
    })
    seedStore(store, {
      activeWorktreeId: 'repo1::/repo1/feature',
      activeWorkspaceKey: null,
      activeWorkspaceExecutionHostId: 'local',
      settings: null,
      folderWorkspaces: [],
      projectGroups: [],
      worktreesByRepo: {
        repo1: [
          makeWorktree({
            id: 'repo1::/repo1/feature',
            repoId: 'repo1',
            path: '/repo1/feature',
            displayName: 'Feature',
            hostId: 'local'
          })
        ]
      }
    })
  })
  afterEach(cleanup)

  it('opens the selected checkout, then follows a folder workspace selection', async () => {
    const button = mount()
    fireEvent.click(button)
    await waitFor(() =>
      expect(mocks.open).toHaveBeenCalledWith({
        path: '/repo1/feature',
        command: 'code',
        connectionId: null
      })
    )
    await act(async () => {
      store.setState({
        activeWorkspaceKey: 'folder:notes',
        folderWorkspaces: [
          {
            id: 'notes',
            projectGroupId: 'notes',
            name: 'Notes',
            folderPath: '/notes',
            connectionId: null,
            executionHostId: 'local',
            linkedTask: null,
            comment: '',
            isArchived: false,
            isUnread: false,
            isPinned: false,
            sortOrder: 0,
            lastActivityAt: 0,
            createdAt: 0,
            updatedAt: 0
          }
        ]
      })
    })
    expect(selectWorkspaceChromeTarget(store.getState())?.name).toBe('Notes')
    fireEvent.click(mount('file-manager'))
    await waitFor(() => expect(mocks.folder).toHaveBeenCalledWith('/notes'))
    fireEvent.click(button)
    await waitFor(() =>
      expect(mocks.open).toHaveBeenLastCalledWith({
        path: '/notes',
        command: 'code',
        connectionId: null
      })
    )
  })

  it('routes an SSH workspace through the existing remote editor API', async () => {
    store.setState({
      activeWorkspaceExecutionHostId: 'ssh:host',
      repos: [
        {
          ...TEST_REPO,
          id: 'repo1',
          path: '/repo1',
          displayName: 'Remote',
          addedAt: 0,
          connectionId: 'host',
          executionHostId: 'ssh:host'
        }
      ],
      worktreesByRepo: {
        repo1: [
          makeWorktree({
            id: 'repo1::/repo1/feature',
            repoId: 'repo1',
            path: '/remote/feature',
            hostId: 'ssh:host'
          })
        ]
      }
    })
    expect(mount('file-manager').disabled).toBe(true)
    expect(mocks.folder).not.toHaveBeenCalled()
    fireEvent.click(mount())
    await waitFor(() =>
      expect(mocks.open).toHaveBeenCalledWith({
        path: '/remote/feature',
        command: 'code',
        connectionId: 'host'
      })
    )
  })

  it('opens the selected local folder in the file manager', async () => {
    fireEvent.click(mount('file-manager'))
    await waitFor(() => expect(mocks.folder).toHaveBeenCalledWith('/repo1/feature'))
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('disables unresolved selections instead of opening another folder', () => {
    store.setState({ activeWorktreeId: 'missing' })
    expect(mount().disabled).toBe(true)
    expect(mount('file-manager').disabled).toBe(true)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.folder).not.toHaveBeenCalled()
  })

  it('does not send a runtime-owned path to a local editor', () => {
    store.setState({
      activeWorkspaceExecutionHostId: 'runtime:paired',
      worktreesByRepo: {
        repo1: [
          makeWorktree({
            id: 'repo1::/repo1/feature',
            repoId: 'repo1',
            path: '/remote/feature',
            hostId: 'runtime:paired',
            runtimeOwnerEnvironmentId: 'paired'
          })
        ]
      }
    })
    expect(mount().disabled).toBe(true)
    expect(mount('file-manager').disabled).toBe(true)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.folder).not.toHaveBeenCalled()
  })

  it('blocks duplicate launches and reports a rejected launch', async () => {
    let reject: (error: Error) => void = () => undefined
    mocks.open.mockImplementation(
      () =>
        new Promise((_resolve, onReject) => {
          reject = onReject
        })
    )
    const button = mount()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button.disabled).toBe(true)
    expect(mocks.open).toHaveBeenCalledOnce()
    await act(async () => reject(new Error('editor unavailable')))
    await waitFor(() => expect(button.disabled).toBe(false))
    expect(mocks.error).toHaveBeenCalledOnce()
  })
})
