import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  splitActiveTerminalPane,
  waitForActiveTerminalManager,
  waitForPaneCount
} from './helpers/terminal'

test.use({
  orcaAppExtraArgs: process.platform === 'linux' ? ['--ozone-platform=headless'] : []
})

test('DSH sidebar titles follow each split pane instead of a shared generated prompt', async ({
  orcaPage: page
}, testInfo) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page)
  await splitActiveTerminalPane(page, 'vertical')
  await waitForPaneCount(page, 2)
  await page.evaluate(async () => {
    const store = window.__store!
    const state = store.getState()
    await state.updateSettings({ tabAutoGenerateTitle: true })
    state.setWorktreeCardProperties(['status', 'inline-agents'])
    state.setAgentActivityDisplayMode('full')
    const tabId = state.activeTabId!
    const worktreeId = state.activeWorktreeId!
    store.setState((current) => ({
      tabsByWorktree: {
        ...current.tabsByWorktree,
        [worktreeId]: current.tabsByWorktree[worktreeId].map((tab) =>
          tab.id === tabId
            ? { ...tab, generatedTitle: 'The approval policy changed', customTitle: null }
            : tab
        )
      }
    }))
    const panes = window.__paneManagers!.get(tabId)!.getPanes()
    for (const [index, pane] of panes.entries()) {
      state.setAgentStatus(
        `${tabId}:${pane.leafId}`,
        {
          agentType: 'dsh',
          state: 'working',
          prompt: 'The approval policy changed'
        },
        'dsh',
        { updatedAt: Date.now(), stateStartedAt: Date.now() }
      )
      // Replay the OSC envelope captured in dsh-tui-ready-no-key.txt with distinct names.
      await new Promise<void>((resolve) =>
        pane.terminal.write(
          `\x1b]0;✦ 🐋 ${index === 0 ? 'Paper review' : 'Check citations'}\x07`,
          resolve
        )
      )
    }
  })
  const rows = page.locator('[data-deck-agent]')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Paper review' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Check citations' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'The approval policy changed' })).toHaveCount(0)
  await page.evaluate(async () => {
    const tabId = window.__store!.getState().activeTabId!
    const pane = window.__paneManagers!.get(tabId)!.getPanes()[1]!
    await new Promise<void>((resolve) =>
      pane.terminal.write('\x1b]0;⠂ 🐋 Updated citations\x07', resolve)
    )
  })
  await expect(rows.filter({ hasText: 'Updated citations' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Paper review' })).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('dsh-sidebar-titles.png') })
})
