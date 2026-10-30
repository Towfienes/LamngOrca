import { writeFileSync } from 'node:fs'
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
  const capture = async (name: string) => {
    const session = await page.context().newCDPSession(page)
    try {
      const image = await session.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: false
      })
      writeFileSync(testInfo.outputPath(name), Buffer.from(image.data, 'base64'))
    } finally {
      await session.detach()
    }
  }
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
  await page.evaluate(() => {
    const state = window.__store!.getState()
    const windowOf = (usedPercent: number) => ({
      usedPercent,
      windowMinutes: 300,
      resetsAt: Date.now() + 3_600_000,
      resetDescription: null
    })
    window.__store!.setState({
      detectedAgentIds: ['claude', 'codex', 'antigravity'],
      statusBarItems: [
        ...new Set([...state.statusBarItems, 'claude', 'codex', 'antigravity'] as const)
      ],
      usagePercentageDisplay: 'remaining',
      rateLimits: {
        ...state.rateLimits,
        claude: {
          provider: 'claude',
          session: windowOf(98),
          weekly: null,
          status: 'ok',
          error: null,
          updatedAt: Date.now()
        },
        codex: {
          provider: 'codex',
          session: windowOf(0),
          weekly: null,
          status: 'ok',
          error: null,
          updatedAt: Date.now()
        },
        antigravity: {
          provider: 'antigravity',
          session: null,
          weekly: null,
          status: 'ok',
          error: null,
          updatedAt: Date.now(),
          buckets: [
            { ...windowOf(20), name: 'Gemini Models' },
            { ...windowOf(65), name: 'Claude and GPT models' }
          ]
        }
      }
    })
    state.showRightSidebarFiles()
    state.setUsagePercentageDisplay('remaining')
  })
  await expect(page.locator('.deck-status-bar')).toBeHidden()
  await expect(page.locator('.workspace-tab-active .workspace-tab-indicator')).toBeHidden()
  const usage = page.getByLabel('Usage panel', { exact: true })
  await expect(usage).toBeVisible()
  await expect(usage.locator('[data-usage-chip]')).toHaveCount(0)
  await page
    .getByRole('radiogroup', { name: 'Usage period' })
    .getByText('7 days', { exact: true })
    .click()
  await page
    .getByRole('radiogroup', { name: 'Usage period' })
    .getByText('All', { exact: true })
    .click()
  const cost = page.getByLabel('Estimated API cost', { exact: true })
  await expect(cost.locator('.deck-usage-total')).toHaveText('$1000.00')
  await expect(cost.getByRole('meter', { name: 'Claude share of estimated cost' })).toHaveAttribute(
    'aria-valuenow',
    '60'
  )
  await expect(cost.getByRole('meter', { name: 'Codex share of estimated cost' })).toHaveAttribute(
    'aria-valuenow',
    '40'
  )
  await page
    .getByRole('radiogroup', { name: 'Usage period' })
    .getByText('7 days', { exact: true })
    .click()
  await expect(cost.locator('.deck-usage-total')).toHaveText('$100.00')
  await expect(usage).toContainText('7 days')
  await page
    .getByRole('radiogroup', { name: 'Usage period' })
    .getByText('All', { exact: true })
    .click()
  await expect(cost.locator('.deck-usage-total')).toHaveText('$1000.00')
  await page.mouse.move(700, 400)
  await capture('deck-usage.png')
  await page.keyboard.press('Escape')
  await expect(cost).toBeVisible()
  await page.getByRole('button', { name: /^Explorer/ }).click()
  const sourceFolder = page
    .locator('.deck-right-sidebar [data-file-explorer-row]')
    .filter({ hasText: /^src$/ })
  await sourceFolder.click()
  await expect.poll(() => page.locator('.deck-file-tree-guides:visible').count()).toBeGreaterThan(0)
  await capture('deck-tree-guides.png')
  const sidebar = page.locator('.deck-right-sidebar')
  const dockBounds = await usage.boundingBox()
  const sidebarBounds = await sidebar.boundingBox()
  expect(
    Math.abs(dockBounds!.y + dockBounds!.height - sidebarBounds!.y - sidebarBounds!.height)
  ).toBeLessThan(2)
  await page.getByRole('button', { name: /^Source Control/ }).click()
  await expect(usage).toBeVisible()
  await page.getByRole('button', { name: /^Explorer/ }).click()
  await page.setViewportSize({ width: 1050, height: 700 })
  await page.evaluate(() => window.__store!.getState().setRightSidebarWidth(260))
  await expect(cost).toBeVisible()
  await expect(usage.locator('[data-usage-chip]')).toHaveCount(0)
  expect(await usage.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await capture('deck-usage-docked-narrow.png')
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await capture('deck-usage-docked-light.png')
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'dark' }))
  await page.evaluate(() => window.__store!.getState().setRightSidebarWidth(348))
  // Quick commands live in the bottom sidebar toolbar now.
  const command = page
    .locator('.deck-sidebar-toolbar')
    .getByRole('button', { name: 'Add quick command', exact: true })
  await expect(command).toBeVisible()
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
  await capture('deck-pane-reordered.png')
})
