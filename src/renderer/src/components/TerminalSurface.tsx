import EditorAutosaveController from './editor/EditorAutosaveController'
import { useEffect, useLayoutEffect } from 'react'
import {
  useWorkspaceLaunchSelection,
  workspaceSlotLayoutKey
} from '@/store/workspace-launch-selection'
import { useAnyBrowserGuestNeedsPaint } from './browser-pane/host-guest/browser-guest-paint-retention'
import { TerminalTitlebarTabs } from './TerminalTitlebarTabs'
import { TerminalSplitWorkspaceSurfaces } from './TerminalSplitWorkspaceSurfaces'
import { TerminalLegacyWorkspaceSurface } from './TerminalLegacyWorkspaceSurface'
import { TerminalWorkspaceDialogs } from './TerminalWorkspaceDialogs'
import type { TerminalController } from './use-terminal-controller'
import { useAppStore } from '@/store'
import { useWorktreeMap } from '@/store/selectors'
import { WorkspaceQuickLaunch } from './workspace-quick-launch/WorkspaceQuickLaunch'
import { findPendingWorktreeCreationId } from '@/lib/pending-worktree-creation'
import { VSCodeEditorOverlayLayer } from './editor/VSCodeEditorOverlayLayer'

export function TerminalSurface({
  controller
}: {
  controller: TerminalController
}): React.JSX.Element {
  const { renderedActiveWorktreeId } = controller
  useLayoutEffect(() => {
    if (
      !controller.workspaceSessionReady ||
      !controller.terminalStartupRestorationReady ||
      !controller.hydrationSucceeded
    ) {
      return
    }
    const synchronize = (
      state: ReturnType<typeof useAppStore.getState>,
      previous?: ReturnType<typeof useAppStore.getState>
    ) => {
      if (
        previous &&
        state.unifiedTabsByWorktree === previous.unifiedTabsByWorktree &&
        state.groupsByWorktree === previous.groupsByWorktree
      ) {
        return
      }
      const workspaces = new Set([
        ...Object.keys(state.groupsByWorktree),
        ...Object.keys(previous?.groupsByWorktree ?? {})
      ])
      for (const workspaceId of workspaces) {
        if (
          previous &&
          state.unifiedTabsByWorktree[workspaceId] ===
            previous.unifiedTabsByWorktree[workspaceId] &&
          state.groupsByWorktree[workspaceId] === previous.groupsByWorktree[workspaceId]
        ) {
          continue
        }
        const groups = state.groupsByWorktree[workspaceId] ?? []
        const selection = useWorkspaceLaunchSelection.getState()
        for (const group of groups) {
          if (
            workspaceId !== renderedActiveWorktreeId &&
            workspaceId !== selection.workspaceId &&
            !selection.layouts[workspaceSlotLayoutKey(workspaceId, group.id)]
          ) {
            continue
          }
          const remaining = new Set(
            (state.unifiedTabsByWorktree[workspaceId] ?? [])
              .filter((tab) => tab.groupId === group.id)
              .map((tab) => tab.id)
          )
          const ordered = group.tabOrder.filter((id) => remaining.delete(id))
          selection.reconcile(workspaceId, group.id, [...ordered, ...remaining])
        }
        for (const group of previous?.groupsByWorktree[workspaceId] ?? []) {
          if (
            !groups.some((next) => next.id === group.id) &&
            selection.layouts[workspaceSlotLayoutKey(workspaceId, group.id)]
          ) {
            selection.reconcile(workspaceId, group.id, [])
          }
        }
      }
    }
    synchronize(useAppStore.getState())
    return useAppStore.subscribe(synchronize)
  }, [
    controller.workspaceSessionReady,
    controller.terminalStartupRestorationReady,
    controller.hydrationSucceeded,
    renderedActiveWorktreeId
  ])
  const tabCount = useAppStore((state) =>
    renderedActiveWorktreeId
      ? (state.unifiedTabsByWorktree[renderedActiveWorktreeId]?.length ?? 0) +
        (state.tabsByWorktree[renderedActiveWorktreeId]?.length ?? 0)
      : 0
  )
  const worktrees = useWorktreeMap()
  const draftWorkspace = useWorkspaceLaunchSelection((state) => state.workspaceId)
  const draftSlot = useWorkspaceLaunchSelection((state) => state.slotIndex)
  const draftTabCount = useWorkspaceLaunchSelection((state) => state.tabCount)
  const unifiedTabCount = useAppStore((state) =>
    renderedActiveWorktreeId
      ? (state.unifiedTabsByWorktree[renderedActiveWorktreeId]?.length ?? 0)
      : 0
  )
  const draftSelected =
    draftWorkspace !== null &&
    draftWorkspace === renderedActiveWorktreeId &&
    unifiedTabCount === draftTabCount
  useEffect(() => {
    if (
      draftWorkspace &&
      draftWorkspace === renderedActiveWorktreeId &&
      unifiedTabCount !== draftTabCount
    ) {
      useWorkspaceLaunchSelection.getState().dismiss(draftWorkspace)
    }
  }, [draftWorkspace, renderedActiveWorktreeId, unifiedTabCount, draftTabCount])
  const creationPending = useAppStore(
    (state) =>
      findPendingWorktreeCreationId(state.pendingWorktreeCreations, renderedActiveWorktreeId) !==
      null
  )
  const showQuickLaunch =
    renderedActiveWorktreeId &&
    controller.workspaceSessionReady &&
    controller.terminalStartupRestorationReady &&
    controller.hydrationSucceeded &&
    !creationPending &&
    (draftSelected ||
      (tabCount === 0 &&
        controller.worktreeFiles.length === 0 &&
        controller.worktreeBrowserTabs.length === 0))
  const surface = controller.workspaceSurfaces.find((item) => item.id === renderedActiveWorktreeId)
  const retainBrowserGuestPaint = useAnyBrowserGuestNeedsPaint(!renderedActiveWorktreeId)
  return (
    <div
      // The workbench already removes hidden content from flow; only keep this ancestor paintable.
      className={`flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden${
        renderedActiveWorktreeId
          ? ''
          : retainBrowserGuestPaint
            ? ' opacity-0 pointer-events-none'
            : ' hidden'
      }`}
      data-rendered-active-worktree-id={renderedActiveWorktreeId ?? undefined}
    >
      <EditorAutosaveController />
      <TerminalTitlebarTabs controller={controller} />
      <div className="relative flex flex-1 min-h-0 min-w-0">
        <div
          className="relative flex flex-1 min-h-0 min-w-0"
          data-workspace-launch-draft={draftSelected ? '' : undefined}
          data-workspace-launch-slot={draftSelected ? draftSlot + 1 : undefined}
        >
          <TerminalSplitWorkspaceSurfaces controller={controller} />
          <TerminalLegacyWorkspaceSurface controller={controller} />
          <VSCodeEditorOverlayLayer
            activeWorkspace={draftSelected ? null : renderedActiveWorktreeId}
          />
        </div>
        {showQuickLaunch && surface ? (
          <WorkspaceQuickLaunch
            key={`${renderedActiveWorktreeId}:${draftSelected ? draftSlot : 'empty'}`}
            worktreeId={renderedActiveWorktreeId}
            path={surface.path}
            branch={worktrees.get(renderedActiveWorktreeId)?.branch}
            newWorkspace={draftSelected}
          />
        ) : null}
      </div>
      <TerminalWorkspaceDialogs controller={controller} />
    </div>
  )
}
