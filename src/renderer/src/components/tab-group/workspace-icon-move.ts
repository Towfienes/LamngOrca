import { useAppStore } from '@/store'
import { useWorkspaceLaunchSelection } from '@/store/workspace-launch-selection'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import type { LayoutApplyHandlers } from '@/runtime/layout-apply-send'
import { sendLayoutCommandToOwner } from '@/runtime/layout-owner-command'
import { CLOSE_TERMINAL_PANE_EVENT, type CloseTerminalPaneDetail } from '@/constants/terminal'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../../shared/layout-owner-switch'
import { collectLayoutLeafIdsInOrder } from '../../../../shared/workspace-layout/terminal-pane-tree'
import { retireLeavesFromTerminalLayout } from '../../../../shared/workspace-layout/terminal-layout-leaf-retirement'
import { transferTerminalLayoutLeaf } from '../../../../shared/workspace-layout/terminal-layout-leaf-transfer'
import type { TerminalLeafMoveRequest } from '../../../../shared/workspace-layout/terminal-leaf-move'
import type { LayoutCommandResult } from '../../../../shared/workspace-layout/workspace-layout-command-types'

const moving = new Set<string>()

/** A drop moves the live surface, never its launch command or account. */
export async function moveWorkspaceIcon(
  worktreeId: string,
  groupId: string,
  sourceId: string,
  leafId: string | undefined,
  targetIndex: number,
  targetId?: string
): Promise<boolean> {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= 4096) {
    return false
  }
  const state = useAppStore.getState()
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const source = tabs.find((tab) => tab.id === sourceId && tab.groupId === groupId)
  const target = targetId
    ? tabs.find((tab) => tab.id === targetId && tab.groupId === groupId)
    : null
  if (!source || (targetId && !target) || sourceId === targetId || moving.has(worktreeId)) {
    return false
  }
  const layout = state.terminalLayoutsByTabId[source.entityId]
  const leaves = collectLayoutLeafIdsInOrder(layout?.root ?? null)
  const movedLeaf = leafId ?? leaves[0]
  if (leafId && !leaves.includes(leafId)) {
    return false
  }
  if (!target && (source.contentType !== 'terminal' || leaves.length === 1)) {
    const placed = useWorkspaceLaunchSelection
      .getState()
      .placeTab(worktreeId, groupId, source.id, targetIndex)
    if (placed) {
      useWorkspaceLaunchSelection.getState().dismiss(worktreeId)
      state.activateTab(source.id)
    }
    return placed
  }
  if (
    source.contentType !== 'terminal' ||
    (target && target.contentType !== 'terminal') ||
    !layout ||
    !movedLeaf ||
    !leaves.includes(movedLeaf) ||
    (target && !state.terminalLayoutsByTabId[target.entityId]?.root)
  ) {
    return false
  }
  const ptyId = layout.ptyIdsByLeafId?.[movedLeaf] ?? null
  // A pending spawn still addresses the old pane; let it finish before moving it.
  if (!ptyId) {
    return false
  }
  moving.add(worktreeId)
  try {
    const request: TerminalLeafMoveRequest = {
      worktreeId,
      sourceTabId: source.entityId,
      targetTabId: target?.entityId ?? createBrowserUuid(),
      leafId: movedLeaf,
      ptyId,
      ...(target ? { intoExistingTab: true } : {})
    }
    const answer = ORCA_LAYOUT_OWNER_IS_MAIN
      ? await moveInOwner(
          request,
          groupId,
          target
            ? collectLayoutLeafIdsInOrder(state.terminalLayoutsByTabId[target.entityId]!.root)[0]
            : undefined
        )
      : await window.api.pty.moveLeafToNewTab(request)
    if (answer.status !== 'moved') {
      return false
    }
    const targetTabId = answer.tabId ?? request.targetTabId
    const latest = useAppStore.getState()
    let destination = latest.tabsByWorktree[worktreeId]?.find((tab) => tab.id === targetTabId)
    if (!destination && !target) {
      destination = latest.createTab(worktreeId, groupId, undefined, {
        id: targetTabId,
        initialLeafId: movedLeaf,
        initialPtyId: answer.ptyId ?? ptyId,
        activate: false
      })
    }
    if (!destination) {
      return true
    }
    const remaining = retireLeavesFromTerminalLayout(layout, new Set([movedLeaf]))
    const targetLayout = latest.terminalLayoutsByTabId[targetTabId] ?? null
    latest.syncPaneDetachPtyOwnership({
      sourceTabId: source.entityId,
      targetTabId,
      detachedLeafId: movedLeaf,
      detachedPtyId: answer.ptyId ?? ptyId,
      sourceLayout: remaining ?? { root: null, activeLeafId: null, expandedLeafId: null }
    })
    window.dispatchEvent(
      new CustomEvent<CloseTerminalPaneDetail>(CLOSE_TERMINAL_PANE_EVENT, {
        detail: {
          tabId: source.entityId,
          leafId: movedLeaf,
          preservePty: true,
          lastPaneCloseReason: 'cleanup'
        }
      })
    )
    latest.setTabLayout(source.entityId, remaining)
    latest.setTabLayout(
      targetTabId,
      transferTerminalLayoutLeaf(layout, targetLayout, movedLeaf, answer.ptyId ?? ptyId)
    )
    if (
      !remaining &&
      useAppStore.getState().tabsByWorktree[worktreeId]?.some((tab) => tab.id === source.entityId)
    ) {
      useAppStore.getState().closeTab(source.entityId, {
        reason: 'cleanup',
        recordInteraction: false,
        captureRecentlyClosed: false,
        localPtyTeardownOwnedExternally: true
      })
    }
    const after = useAppStore.getState()
    const unified = after.unifiedTabsByWorktree[worktreeId]?.find(
      (tab) => tab.entityId === targetTabId
    )
    if (!target && unified) {
      useWorkspaceLaunchSelection.getState().placeTab(worktreeId, groupId, unified.id, targetIndex)
    }
    useWorkspaceLaunchSelection.getState().dismiss(worktreeId)
    after.setActiveTab(targetTabId)
    after.setActiveTabType('terminal', worktreeId)
    if (unified) {
      after.activateTab(unified.id)
    }
    focusTerminalTabSurface(targetTabId, movedLeaf)
    return true
  } finally {
    moving.delete(worktreeId)
  }
}

function moveInOwner(request: TerminalLeafMoveRequest, groupId: string, targetLeafId?: string) {
  return new Promise<
    { status: 'moved'; tabId?: string; ptyId: string | null } | { status: 'refused' }
  >((resolve) => {
    const apply: LayoutApplyHandlers['apply'] = (result: LayoutCommandResult, origin) => {
      if (!result.tabId) {
        resolve({ status: 'refused' })
        return
      }
      const ptyId = origin.routed
        ? (useAppStore.getState().terminalLayoutsByTabId[result.tabId]?.ptyIdsByLeafId?.[
            request.leafId
          ] ?? request.ptyId)
        : (result.ptyId ?? request.ptyId)
      resolve({ status: 'moved', tabId: result.tabId, ptyId })
    }
    const refuse = (): void => resolve({ status: 'refused' })
    const sent = sendLayoutCommandToOwner(
      request.worktreeId,
      targetLeafId
        ? {
            type: 'movePane',
            tabId: request.sourceTabId,
            targetTabId: request.targetTabId,
            leafId: request.leafId,
            targetLeafId,
            side: 'right'
          }
        : {
            type: 'movePaneToNewTab',
            tabId: request.sourceTabId,
            leafId: request.leafId,
            groupId,
            windowDetach: { ptyId: request.ptyId }
          },
      { apply, refused: refuse, asToday: refuse }
    )
    if (!sent) {
      refuse()
    }
  })
}
