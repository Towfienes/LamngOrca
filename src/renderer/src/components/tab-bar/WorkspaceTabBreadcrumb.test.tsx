import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceTabBreadcrumb } from './WorkspaceTabBreadcrumb'

const { state } = vi.hoisted(() => ({
  state: {
    activeWorktreeId: 'workspace',
    activeWorkspaceExecutionHostId: 'ssh:dev',
    repos: [
      { id: 'repo', displayName: 'Local project', executionHostId: 'local' },
      { id: 'repo', displayName: 'Remote project', executionHostId: 'ssh:dev' }
    ],
    getKnownWorktreeById: vi.fn()
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

describe('WorkspaceTabBreadcrumb', () => {
  it.each(['ssh:dev', undefined])(
    'uses the workspace host (%s) and shows its project and branch',
    (hostId) => {
      state.getKnownWorktreeById.mockReturnValue({
        repoId: 'repo',
        hostId,
        path: '/repo/feature',
        branch: 'refs/heads/feature',
        displayName: 'Feature'
      })
      const markup = renderToStaticMarkup(<WorkspaceTabBreadcrumb worktreeId="workspace" />)
      expect(state.getKnownWorktreeById).toHaveBeenCalledWith('workspace', 'ssh:dev')
      expect(markup).toContain('Remote project')
      expect(markup).toContain('>feature</span>')
      expect(markup).not.toContain('Local project')
    }
  )

  it('shows a folder workspace without inventing a Git branch', () => {
    state.getKnownWorktreeById.mockReturnValue({
      repoId: 'folder',
      path: 'C:\\Projects\\Notes',
      branch: '',
      displayName: 'Notes'
    })
    const markup = renderToStaticMarkup(<WorkspaceTabBreadcrumb worktreeId="workspace" />)
    expect(markup).toContain('Notes</span>')
    expect(markup).not.toContain('<svg')
  })

  it('omits unresolved workspace context', () => {
    state.getKnownWorktreeById.mockReturnValue(undefined)
    expect(renderToStaticMarkup(<WorkspaceTabBreadcrumb worktreeId="missing" />)).toBe('')
  })
})
