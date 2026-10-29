import type { AppState } from '@/store/types'
import { getActiveSidebarWorkspaceId, parseWorkspaceKey } from '../../../shared/workspace-scope'
import { getConnectionIdFromState } from './connection-owner-resolution'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from './worktree-runtime-owner'
import { findIndexedFolderWorkspaceOwner } from './worktree-runtime-owner-index'

export function selectWorkspaceChromeTarget(
  state: AppState,
  workspaceId = getActiveSidebarWorkspaceId(state.activeWorkspaceKey, state.activeWorktreeId)
) {
  if (!workspaceId) {
    return null
  }
  const scope = parseWorkspaceKey(workspaceId)
  const selectedHost =
    workspaceId === getActiveSidebarWorkspaceId(state.activeWorkspaceKey, state.activeWorktreeId)
      ? (state.activeWorkspaceExecutionHostId ?? undefined)
      : undefined
  const folder =
    scope?.type === 'folder'
      ? (findIndexedFolderWorkspaceOwner(
          state.folderWorkspaces,
          scope.folderWorkspaceId,
          selectedHost
        ) ?? findIndexedFolderWorkspaceOwner(state.folderWorkspaces, scope.folderWorkspaceId))
      : null
  const worktree =
    scope?.type === 'folder'
      ? null
      : state.getKnownWorktreeById(
          scope?.type === 'worktree' ? scope.worktreeId : workspaceId,
          selectedHost
        )
  const path = folder?.folderPath ?? worktree?.path
  if (!path) {
    return null
  }
  return {
    name: folder?.name ?? worktree?.displayName ?? path,
    path,
    connectionId: getConnectionIdFromState(state, workspaceId),
    runtimeEnvironmentId: runtimeEnvironmentIdOrLocalUnlessTwin(state, workspaceId)
  }
}
