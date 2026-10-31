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
  // Real pane launches, the 30-second quota tick and screenshots need the full integration budget.
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
  const bell = page.getByRole('button', { name: 'View activity', exact: true })
  const bellSidebar = page.locator('.deck-sidebar')
  expect((await bell.boundingBox())!.x - (await bellSidebar.boundingBox())!.x).toBeLessThan(32)
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
  const scroll = usage.locator('[data-usage-scroll]')
  await scroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  const quota = usage.getByLabel('Account quota', { exact: true })
  await expect(quota).toBeVisible()
  const usageGeometry = await usage.evaluate((node) => {
    const cost = node.querySelector('.deck-usage-cost')!.getBoundingClientRect()
    const top = node.querySelector('.deck-usage-top')!.getBoundingClientRect()
    const quota = node.querySelector('.deck-usage-quota-head')!.getBoundingClientRect()
    const providers = node.querySelectorAll('[data-usage-provider]')
    const lastProvider = providers.item(providers.length - 1).getBoundingClientRect()
    return { reservedGap: top.height - cost.height, headingGap: quota.top - lastProvider.bottom }
  })
  expect(usageGeometry.reservedGap).toBeLessThanOrEqual(1)
  expect(usageGeometry.headingGap).toBeLessThanOrEqual(8)
  expect(
    await usage.locator('.deck-usage-portrait').evaluate((node) => getComputedStyle(node).top)
  ).toBe('8px')
  expect((await quota.boundingBox())!.width).toBeGreaterThan((await cost.boundingBox())!.width)
  await capture('deck-usage-quota.png')
  const quotaSnapshot = await page.evaluate(() => window.__store!.getState().rateLimits)
  await electronApp.evaluate(({ ipcMain }, snapshot) => {
    ipcMain.removeHandler('rateLimits:get')
    let refreshed = false
    ipcMain.handle('rateLimits:get', (_event, options: unknown) => {
      if (
        typeof options === 'object' &&
        options !== null &&
        'refreshQuota' in options &&
        options.refreshQuota === true
      ) {
        refreshed = true
      }
      return {
        ...snapshot,
        codex: {
          provider: 'codex',
          status: 'ok',
          error: null,
          updatedAt: Date.now(),
          weekly: null,
          session: {
            usedPercent: refreshed ? 17 : 0,
            windowMinutes: 300,
            resetsAt: null,
            resetDescription: null
          }
        }
      }
    })
  }, quotaSnapshot)
  // Simulate a visible document for the timer without revealing or focusing the hidden native window.
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  )
  await expect(quota.locator('[data-quota-provider="codex"]').getByRole('meter')).toHaveAttribute(
    'aria-valuenow',
    '83',
    { timeout: 40_000 }
  )

  await scroll.evaluate((node) => {
    node.scrollTop = 0
  })
  const notesTrigger = usage.getByRole('button', { name: 'Open to-do notes' })
  await notesTrigger.click()
  const bubble = page.locator('[data-manga-notes]')
  await expect(bubble).toBeVisible()
  await bubble.getByRole('button', { name: 'Add task' }).click()
  await bubble.getByRole('textbox', { name: 'Task 1' }).fill('Thuyết trình notebook tiếng Việt')
  await bubble.getByRole('checkbox', { name: 'Complete task 1' }).click()
  await page.keyboard.press('Escape')
  await expect(bubble).toBeHidden()
  await notesTrigger.click()
  await expect(bubble.getByRole('textbox', { name: 'Task 1' })).toHaveValue(
    'Thuyết trình notebook tiếng Việt'
  )
  await expect(bubble.getByRole('checkbox', { name: 'Complete task 1' })).toBeChecked()
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((theme) => window.__store!.getState().updateSettings({ theme }), theme)
    const colors = await bubble.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color
    }))
    expect(colors).toEqual({ background: 'rgb(255, 255, 255)', color: 'rgb(0, 0, 0)' })
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('18px "Patrick Hand"', 'Thuyết trình')))
      .toBe(true)
    await capture(`deck-manga-notes-${theme}.png`)
  }
  await bubble.getByRole('button', { name: 'Close notes' }).click()
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'dark' }))
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
  // A narrow dock scales the whole panel down instead of squeezing the cost column.
  const scaleBox = usage.locator('[data-usage-scale]')
  await expect
    .poll(async () => Number(await scaleBox.getAttribute('data-usage-scale')))
    .toBeLessThan(0.9)
  expect(Number(await scaleBox.getAttribute('data-usage-scale'))).toBeGreaterThanOrEqual(0.6)
  expect(
    await usage
      .locator('[data-usage-provider] .truncate')
      .evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth))
  ).toBe(true)
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

test('manga notes stay in the viewport and survive renderer restart', async ({
  orcaPage: page,
  electronApp
}) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.global-notes.v1', '- [ ] Chuẩn bị demo\n- [x] Kiểm tra notebook')
    if (state.sidebarOpen) {
      state.toggleSidebar()
    }
    if (!state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    state.setRightSidebarWidth(348)
    await state.updateSettings({ theme: 'dark' })
  })
  for (const width of [1440, 768, 390]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900),
      width
    )
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'Open to-do notes' }).click()
    const bubble = page.locator('[data-manga-notes]')
    await expect(bubble).toBeVisible()
    const bounds = (await bubble.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900)
    await expect(bubble.getByRole('textbox', { name: 'Task 1' })).toHaveValue('Chuẩn bị demo')
    await expect(bubble.getByRole('checkbox', { name: 'Complete task 2' })).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(bubble).toBeHidden()
  }
  await page.reload()
  await waitForSessionReady(page)
  await page.getByRole('button', { name: 'Open to-do notes' }).click()
  await expect(
    page.locator('[data-manga-notes]').getByRole('textbox', { name: 'Task 1' })
  ).toHaveValue('Chuẩn bị demo')
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible())
    )
  ).toBe(true)
})
