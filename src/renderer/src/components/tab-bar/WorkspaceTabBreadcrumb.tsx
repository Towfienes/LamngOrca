import { ChevronRight } from 'lucide-react'
import { useAppStore } from '@/store'
import { basename } from '@/lib/path'
import { branchName } from '@/lib/git-utils'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'

export function WorkspaceTabBreadcrumb({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element | null {
  const worktree = useAppStore((state) =>
    state.getKnownWorktreeById(
      worktreeId,
      state.activeWorktreeId === worktreeId
        ? (state.activeWorkspaceExecutionHostId ?? undefined)
        : undefined
    )
  )
  const repoName = useAppStore((state) => {
    const hostId =
      worktree?.hostId ??
      (state.activeWorktreeId === worktreeId ? state.activeWorkspaceExecutionHostId : undefined)
    return state.repos.find(
      (repo) => repo.id === worktree?.repoId && (!hostId || getRepoExecutionHostId(repo) === hostId)
    )?.displayName
  })
  if (!worktree) {
    return null
  }

  return (
    <div className="deck-workspace-breadcrumb" title={worktree.path}>
      <span className="truncate">
        {repoName || worktree.displayName || basename(worktree.path)}
      </span>
      {worktree.branch && (
        <>
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{branchName(worktree.branch)}</span>
        </>
      )}
    </div>
  )
}
