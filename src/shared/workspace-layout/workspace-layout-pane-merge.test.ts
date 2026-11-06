import { expect, it } from 'vitest'
import { applyLayoutCommand } from './workspace-layout-commands'
import { build, terminalTab, testContext, WS } from './workspace-layout-command.test-fixture'
import { collectLayoutLeafIdsInOrder } from './terminal-pane-tree'
import { checkWorkspaceLayoutModelRules } from './workspace-layout-model-rules'

function setup(split = true) {
  const ctx = testContext()
  const created = build(ctx, [
    { type: 'createTerminalTab', workspace: WS },
    { type: 'createTerminalTab', workspace: WS }
  ])
  const [source, target] = created.results
  const sourceId = source!.tabId!
  const targetId = target!.tabId!
  const leafId = source!.leafId!
  const targetLeafId = target!.leafId!
  const model = split
    ? build(
        ctx,
        [{ type: 'splitPane', workspace: WS, tabId: sourceId, leafId, direction: 'vertical' }],
        created.model
      ).model
    : created.model
  model.workspaces[WS]!.leaves = {
    [leafId]: { ptyId: 'live-pty', title: 'Running Codex' },
    [targetLeafId]: { ptyId: 'target-pty' }
  }
  const command = {
    type: 'movePane' as const,
    workspace: WS,
    tabId: sourceId,
    targetTabId: targetId,
    leafId,
    targetLeafId,
    side: 'right' as const
  }
  return { ctx, model, command, sourceId, targetId, leafId, targetLeafId }
}

it('merges one live pane into an occupied tab without starting or stopping terminals', () => {
  const { ctx, model, command, sourceId, targetId, leafId, targetLeafId } = setup()
  const result = applyLayoutCommand(model, command, ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(result.code)
  }
  expect(result.effects).toEqual({ startPaneKeys: [], stopPtyIds: [] })
  expect(collectLayoutLeafIdsInOrder(terminalTab(result.model, sourceId).panes.root)).not.toContain(
    leafId
  )
  expect(collectLayoutLeafIdsInOrder(terminalTab(result.model, targetId).panes.root)).toEqual([
    targetLeafId,
    leafId
  ])
  expect(result.model.workspaces[WS]!.leaves).toEqual(model.workspaces[WS]!.leaves)
  expect(checkWorkspaceLayoutModelRules(result.model)).toEqual([])
  expect(collectLayoutLeafIdsInOrder(terminalTab(model, sourceId).panes.root)).toContain(leafId)
})

it('removes an emptied source tab and retains its live leaf and the target', () => {
  const { ctx, model, command, sourceId, targetId, leafId } = setup(false)
  const result = applyLayoutCommand(model, command, ctx)
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(result.code)
  }
  expect(result.model.workspaces[WS]!.tabs.map((tab) => tab.id)).toEqual([targetId])
  expect(result.model.workspaces[WS]!.groups[0]!.tabOrder).toEqual([targetId])
  expect(result.model.workspaces[WS]!.leaves?.[leafId]?.ptyId).toBe('live-pty')
  expect(result.effects.stopPtyIds).toEqual([])
  expect(result.model.workspaces[WS]!.tabs.some((tab) => tab.id === sourceId)).toBe(false)
})

it('refuses a missing destination before changing either tab', () => {
  const { ctx, model, command } = setup()
  expect(applyLayoutCommand(model, { ...command, targetTabId: 'missing' }, ctx)).toEqual({
    ok: false,
    code: 'tab_not_found'
  })
})
