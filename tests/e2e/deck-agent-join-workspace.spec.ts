import { test, expect } from './helpers/orca-app'
import type { Page } from '@stablyai/playwright-test'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

type Created = { terminal: { handle: string; tabId: string; paneKey?: string } }

async function createViaRuntime(page: Page, params: Record<string, unknown>): Promise<Created> {
  return page.evaluate(async (rpcParams) => {
    const response = await window.api.runtime.call({ method: 'terminal.create', params: rpcParams })
    if (!response.ok) {
      throw new Error(JSON.stringify(response.error))
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: terminal.create resolves to { terminal } on ok.
    return response.result as Created
  }, params)
}

async function workspaceShape(page: Page, worktreeId: string, tabId: string) {
  return page.evaluate(
    ({ id, tab }) => {
      const state = window.__store!.getState()
      const layout = state.terminalLayoutsByTabId[tab]
      const leaves: string[] = []
      type LayoutNode = NonNullable<NonNullable<typeof layout>['root']>
      const walk = (node: LayoutNode | null | undefined): void => {
        if (node?.type === 'leaf') {
          leaves.push(node.leafId)
        } else if (node?.type === 'split') {
          walk(node.first)
          walk(node.second)
        }
      }
      walk(layout?.root)
      return {
        terminalTabs: (state.tabsByWorktree[id] ?? []).length,
        leaves,
        activeLeafId: layout?.activeLeafId ?? null
      }
    },
    { id: worktreeId, tab: tabId }
  )
}

test('agents launched through the runtime join the open workspace as split panes', async ({
  orcaPage: page
}) => {
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  const tabId = await page.evaluate(() => window.__store!.getState().activeTabId!)
  await expect
    .poll(async () => (await workspaceShape(page, worktreeId, tabId)).leaves.length)
    .toBe(1)
  // A live workspace pane is bound to its PTY; an unbound leaf would hand activity to the bound agent pane.
  await expect
    .poll(() =>
      page.evaluate((tab) => {
        const layout = window.__store!.getState().terminalLayoutsByTabId[tab]
        return Boolean(layout?.activeLeafId && layout.ptyIdsByLeafId?.[layout.activeLeafId])
      }, tabId)
    )
    .toBe(true)
  const before = await workspaceShape(page, worktreeId, tabId)

  // Background agent launch (worker-start / `orca terminal create` without --focus): main mints the
  // pane key under the open tab before spawning, so hooks attribute to the joined pane.
  const background = await createViaRuntime(page, {
    worktree: `id:${worktreeId}`,
    command: 'echo orca-join-background && sleep 120',
    launchToken: 'e2e-join-background'
  })
  expect(background.terminal.tabId).toBe(tabId)
  expect(background.terminal.paneKey?.startsWith(`${tabId}:`)).toBe(true)
  await expect
    .poll(async () => (await workspaceShape(page, worktreeId, tabId)).leaves.length)
    .toBe(2)
  const afterBackground = await workspaceShape(page, worktreeId, tabId)
  expect(afterBackground.terminalTabs).toBe(before.terminalTabs)
  // The user's pane keeps focus while a background worker joins.
  expect(afterBackground.activeLeafId).toBe(before.activeLeafId)

  // The workspace dot draws one icon per pane; middle click on an icon closes only that pane.
  const paneIcons = page.locator('.deck-tab-dot[aria-current="true"] [data-dot-pane-leaf]')
  await expect(paneIcons).toHaveCount(2)
  const joinedLeaf = afterBackground.leaves.find((leaf) => !before.leaves.includes(leaf))!
  await page
    .locator(`.deck-tab-dot[aria-current="true"] [data-dot-pane-leaf="${joinedLeaf}"]`)
    .click({ button: 'middle' })
  await expect
    .poll(async () => (await workspaceShape(page, worktreeId, tabId)).leaves)
    .toEqual(before.leaves)
  expect((await workspaceShape(page, worktreeId, tabId)).terminalTabs).toBe(before.terminalTabs)
  await expect(paneIcons).toHaveCount(0)

  // Rejoin so the remaining checks still see a split workspace.
  await createViaRuntime(page, {
    worktree: `id:${worktreeId}`,
    command: 'echo orca-join-again && sleep 120',
    launchToken: 'e2e-join-again'
  })
  await expect
    .poll(async () => (await workspaceShape(page, worktreeId, tabId)).leaves.length)
    .toBe(2)

  // A hidden (background) agent never joins: its pane key would point at a tab that never shows it.
  const hidden = await createViaRuntime(page, {
    worktree: `id:${worktreeId}`,
    command: 'echo orca-join-hidden && sleep 120',
    launchToken: 'e2e-join-hidden',
    presentation: 'background'
  })
  expect(hidden.terminal.tabId).not.toBe(tabId)
  expect((await workspaceShape(page, worktreeId, tabId)).leaves).toHaveLength(2)

  // A plain command is not an agent: it keeps opening its own tab.
  const plain = await createViaRuntime(page, {
    worktree: `id:${worktreeId}`,
    command: 'echo orca-plain-tab'
  })
  expect(plain.terminal.tabId).not.toBe(tabId)
  await expect
    .poll(async () => (await workspaceShape(page, worktreeId, tabId)).terminalTabs)
    .toBe(before.terminalTabs + 1)
  expect((await workspaceShape(page, worktreeId, tabId)).leaves).toHaveLength(2)
})
