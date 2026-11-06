import {
  applied,
  findTerminal,
  refuse,
  updateTab,
  type Applied
} from './workspace-layout-command-steps'
import type { CommandOf } from './workspace-layout-command-types'
import type { WorkspaceLayoutModel } from './workspace-layout-model'
import { removeTabFromWorkspace, withWorkspace } from './workspace-layout-removal'
import { insertLeafBeside, layoutContainsLeafId, removeLayoutLeaf } from './terminal-pane-tree'

export function movePane(model: WorkspaceLayoutModel, command: CommandOf<'movePane'>): Applied {
  if (command.leafId === command.targetLeafId) {
    return refuse('same_pane')
  }
  const tab = findTerminal(model.workspaces[command.workspace]!, command.tabId)
  if (!tab) {
    return refuse('tab_not_found')
  }
  const target = findTerminal(
    model.workspaces[command.workspace]!,
    command.targetTabId ?? command.tabId
  )
  if (!target) {
    return refuse('tab_not_found')
  }
  const { root } = tab.panes
  if (
    !layoutContainsLeafId(root, command.leafId) ||
    !layoutContainsLeafId(target.panes.root, command.targetLeafId)
  ) {
    return refuse('pane_not_found')
  }
  const without = removeLayoutLeaf(root, command.leafId)
  const moved = insertLeafBeside(
    target.id === tab.id ? without! : target.panes.root!,
    command.targetLeafId,
    command.leafId,
    command.side
  )
  if (target.id === tab.id) {
    return updateTab(model, command.workspace, { ...tab, panes: { ...tab.panes, root: moved } })
  }
  const workspace = model.workspaces[command.workspace]!
  const panes = { ...tab.panes, root: without }
  if (panes.chatLeafId === command.leafId) {
    delete panes.chatLeafId
  }
  const source = without ? workspace : removeTabFromWorkspace(workspace, tab.id)
  const tabs = source.tabs.map((entry) =>
    entry.id === target.id
      ? { ...target, panes: { ...target.panes, root: moved } }
      : entry.id === tab.id
        ? { ...tab, panes }
        : entry
  )
  return applied(withWorkspace(model, command.workspace, { ...source, tabs }), {
    tabId: target.id,
    ptyId: workspace.leaves?.[command.leafId]?.ptyId ?? null
  })
}
