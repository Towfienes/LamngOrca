import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { useAppStore } from '@/store'
import { gateWorktreeAgentActivation } from '@/lib/worktree-agent-activation-gate'

async function restoreEmptyWorkspaceSessions(worktreeId: string): Promise<void> {
  const state = useAppStore.getState()
  if (
    state.activeWorktreeId !== worktreeId ||
    state.reconcileWorktreeTabModel(worktreeId).renderableTabCount > 0
  ) {
    return
  }
  state.ensureWorktreeRootGroup(worktreeId)
  await gateWorktreeAgentActivation(worktreeId)
}

export async function activateWorktreeFromSidebar(
  worktreeId: string,
  executionHostId?: ExecutionHostId
): Promise<void> {
  const workspaceScope = parseWorkspaceKey(worktreeId)
  if (workspaceScope?.type === 'folder') {
    const result = activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId, {
      navigationIntent: 'user-open',
      providesInitialSurface: true,
      ...(executionHostId ? { executionHostId } : {})
    })
    if (result !== false) {
      void restoreEmptyWorkspaceSessions(worktreeId)
    }
    return
  }
  // Keep navigation independent from an optional runtime wake IPC.
  const result = activateAndRevealWorktree(worktreeId, {
    navigationIntent: 'user-open',
    providesInitialSurface: true,
    revealInSidebar: false,
    ...(executionHostId ? { executionHostId } : {})
  })
  if (result === false) {
    return
  }
  void restoreEmptyWorkspaceSessions(worktreeId)

  await resumeEphemeralVmWorkspace(worktreeId)
}

/** Wakes the per-workspace VM behind a worktree, if it has one. */
async function resumeEphemeralVmWorkspace(worktreeId: string): Promise<void> {
  if (typeof window === 'undefined' || !window.api?.ephemeralVm?.resumeWorkspace) {
    return
  }
  try {
    const runtime = await window.api.ephemeralVm.resumeWorkspace({ workspaceId: worktreeId })
    if (runtime?.runtimeEnvironmentId) {
      useAppStore.getState().setRuntimeEnvironments(await window.api.runtimeEnvironments.list())
      await useAppStore.getState().refreshRuntimeEnvironmentStatus(runtime.runtimeEnvironmentId)
    }
  } catch (error) {
    toast.error(
      translate(
        'auto.lib.sidebarWorktreeActivation.wakeEphemeralVmFailed',
        'Failed to wake ephemeral VM workspace'
      ),
      {
        description: error instanceof Error ? error.message : String(error)
      }
    )
  }
}
