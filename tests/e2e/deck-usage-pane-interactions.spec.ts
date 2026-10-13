import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { splitActiveTerminalPane, waitForPaneCount } from './helpers/terminal'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('Deck Usage, compact commands and pane mouse interactions', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  test.skip(process.platform !== 'linux', 'Linux Deck')
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1600, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  const [claude, codex] = await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    state.setSidebarWidth(280)
    state.setRightSidebarWidth(348)
    if (!state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark', terminalFocusFollowsMouse: true })
    const query = { scope: 'all', range: 'all' } as const
    return Promise.all([
      window.api.claudeUsage.getSnapshot(query),
      window.api.codexUsage.getSnapshot(query)
    ])
  })
  await electronApp.evaluate(
    ({ ipcMain }, { claude, codex }) => {
      ipcMain.removeHandler('claudeUsage:getSnapshot')
      ipcMain.handle(
        'claudeUsage:getSnapshot',
        (_event, { range }: { range: 'all' | '7d' | '30d' | '90d' }) => ({
          ...claude,
          scanState: { ...claude.scanState, enabled: true },
          summary: {
            ...claude.summary,
            range,
            estimatedCostUsd: range === '7d' ? 60 : 600,
            hasAnyClaudeData: true,
            inputTokens: 1_000_000,
            outputTokens: 10_000
          }
        })
      )
      ipcMain.removeHandler('codexUsage:getSnapshot')
      ipcMain.handle(
        'codexUsage:getSnapshot',
        (_event, { range }: { range: 'all' | '7d' | '30d' | '90d' }) => ({
          ...codex,
          scanState: { ...codex.scanState, enabled: true },
          summary: {
            ...codex.summary,
            range,
            estimatedCostUsd: range === '7d' ? 40 : 400,
            hasAnyCodexData: true,
            totalTokens: 2_000_000
          }
        })
      )
    },
    { claude, codex }
  )
  await ensureTerminalVisible(page)
  await expect(page.locator('.deck-status-bar')).toBeHidden()
  await expect(page.locator('.workspace-tab-active .workspace-tab-indicator')).toBeHidden()
  await page.getByRole('button', { name: 'Usage', exact: true }).click()
  const usage = page.getByLabel('Usage panel', { exact: true })
  await expect(usage).toBeVisible()
  await expect(usage.locator('.deck-usage-total')).toHaveText('$1000.00')
  await expect(
    usage.getByRole('meter', { name: 'Claude share of estimated cost' })
  ).toHaveAttribute('aria-valuenow', '60')
  await expect(usage.getByRole('meter', { name: 'Codex share of estimated cost' })).toHaveAttribute(
    'aria-valuenow',
    '40'
  )
  await expect(page.locator('#deck-usage-roster .status-bar-usage-cluster')).toBeVisible()
  await usage.getByText('7 days', { exact: true }).click()
  await expect(usage.locator('.deck-usage-total')).toHaveText('$100.00')
  await usage.getByText('All', { exact: true }).click()
  await expect(usage.locator('.deck-usage-total')).toHaveText('$1000.00')
  await page.mouse.move(700, 400)
  await page.screenshot({ path: testInfo.outputPath('deck-usage.png') })
  await page.getByRole('button', { name: /^Explorer/ }).click()
  const sourceFolder = page
    .locator('.deck-right-sidebar [data-file-explorer-row]')
    .filter({ hasText: /^src$/ })
  await sourceFolder.click()
  await expect.poll(() => page.locator('.deck-file-tree-guides:visible').count()).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('deck-tree-guides.png') })
  await page.getByRole('button', { name: 'Usage', exact: true }).click()
  await expect(page.locator('#deck-usage-roster .status-bar-usage-cluster')).toBeVisible()
  await page.setViewportSize({ width: 1050, height: 700 })
  const command = page.locator('.deck-quick-command:visible').first()
  await expect(command).toBeVisible()
  const bounds = await command.boundingBox()
  const statusBounds = await page
    .getByRole('group', { name: 'System status', exact: true })
    .boundingBox()
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(statusBounds!.x)
  await command.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByRole('button', { name: 'Toggle right sidebar', exact: true }).click()
  await splitActiveTerminalPane(page, 'vertical')
  await waitForPaneCount(page, 2)
  await expect(page.locator('.pane-title-bar:visible')).toHaveCount(2)
  // Simulate the existing in-app focus gate; never focus or reveal a native test window.
  await page.evaluate(() =>
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true })
  )
  const panes = page.locator('.pane:visible')
  const headers = page.locator('.pane-title-bar:visible')
  const sourceLeaf = await panes.first().getAttribute('data-leaf-id')
  await panes.nth(1).hover({ position: { x: 80, y: 100 } })
  await expect(panes.nth(1)).toHaveAttribute('data-active-pane', '')
  await headers.first().hover({ position: { x: 80, y: 16 } })
  await expect(panes.first()).toHaveAttribute('data-active-pane', '')
  const first = await headers.first().boundingBox()
  const second = await panes.nth(1).boundingBox()
  await page.mouse.move(first!.x + 80, first!.y + 16)
  await page.mouse.down()
  await page.mouse.move(second!.x + second!.width * 0.9, second!.y + second!.height / 2, {
    steps: 12
  })
  await page.mouse.up()
  await expect.poll(() => panes.nth(1).getAttribute('data-leaf-id')).toBe(sourceLeaf)
  await expect(panes).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('deck-pane-reordered.png') })
})
