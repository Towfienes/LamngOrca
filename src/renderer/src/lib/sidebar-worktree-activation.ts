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

export const WORKSPACE_LAUNCH_PICKER_EVENT = 'orca-workspace-launch-picker'

async function requestEmptyWorkspaceLaunch(worktreeId: string): Promise<void> {
  const state = useAppStore.getState()
  if (
    state.activeWorktreeId !== worktreeId ||
    state.reconcileWorktreeTabModel(worktreeId).renderableTabCount > 0
  ) {
    return
  }
  state.ensureWorktreeRootGroup(worktreeId)
  const outcome = await gateWorktreeAgentActivation(worktreeId)
  const current = useAppStore.getState()
  if (
    outcome !== 'empty' ||
    current.activeWorktreeId !== worktreeId ||
    current.reconcileWorktreeTabModel(worktreeId).renderableTabCount > 0
  ) {
    return
  }
  window.dispatchEvent(new Event(WORKSPACE_LAUNCH_PICKER_EVENT))
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
      void requestEmptyWorkspaceLaunch(worktreeId)
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
  void requestEmptyWorkspaceLaunch(worktreeId)

  if (typeof window !== 'undefined' && window.api?.ephemeralVm?.resumeWorkspace) {
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
}
