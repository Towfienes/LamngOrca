import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
})

test('dragging icons keeps sparse slots and merges live terminals without relaunching them', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 800)
  )
  await page.setViewportSize({ width: 1440, height: 800 })
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.evaluate(async () => {
    const s = window.__store!.getState()
    s.dismissUsagePercentageDisplayChangeNotice()
    s.markCodexTerminalServerIsolationNoticeSeen()
    if (s.sidebarOpen) {
      s.toggleSidebar()
    }
    if (s.rightSidebarOpen) {
      s.toggleRightSidebar()
    }
    await s.updateSettings({ theme: 'dark' })
  })
  const strip = page.getByRole('group', { name: 'Workspace tabs', exact: true })
  const slots = strip.locator('button.deck-tab-dot')
  const sourceId = (await slots.nth(0).getAttribute('data-workspace-tab-id'))!
  await slots.nth(1).click()
  await page
    .locator('[data-workspace-quick-launch]')
    .getByRole('button', { name: 'Terminal', exact: true })
    .click()
  const targetId = (await slots.nth(1).getAttribute('data-workspace-tab-id'))!
  const bindings = () =>
    page.evaluate((worktreeId) => {
      const s = window.__store!.getState()
      return (s.tabsByWorktree[worktreeId] ?? [])
        .flatMap((tab) => Object.values(s.terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {}))
        .sort()
    }, worktreeId)
  await expect.poll(bindings).toHaveLength(2)
  const originalPtys = await bindings()
  await slots.nth(0).dragTo(slots.nth(3))
  await expect(slots.nth(0)).toHaveAttribute('data-empty', 'true')
  await expect(slots.nth(3)).toHaveAttribute('data-workspace-tab-id', sourceId)
  await expect(slots.nth(2)).toHaveAttribute('data-empty', 'true')
  await expect(slots).toHaveCount(5)
  await slots.nth(3).dragTo(slots.nth(1))
  await expect(slots.nth(1)).toHaveAttribute('data-workspace-tab-id', targetId)
  await expect(slots.nth(1).locator('[data-dot-pane-leaf]')).toHaveCount(2)
  await expect(strip.locator('button[data-workspace-tab-id]')).toHaveCount(1)
  await expect.poll(bindings).toEqual(originalPtys)
  expect(
    await page.evaluate(
      async (ids) => Promise.all(ids.map((id) => window.api.pty.hasPty(id))),
      originalPtys
    )
  ).toEqual([true, true])

  // Pull one of the grouped icons back out into the exact third slot.
  await slots.nth(1).locator('[data-dot-pane-leaf]').last().dragTo(slots.nth(2))
  await expect(strip.locator('button[data-workspace-tab-id]')).toHaveCount(2)
  await expect(slots.nth(0)).toHaveAttribute('data-empty', 'true')
  await expect(slots.nth(2)).toHaveAttribute('data-workspace-tab-id', /.+/)
  await expect.poll(bindings).toEqual(originalPtys)
  expect(
    await page.evaluate(
      async (ids) => Promise.all(ids.map((id) => window.api.pty.hasPty(id))),
      originalPtys
    )
  ).toEqual([true, true])
  for (const width of [390, 768, 1440]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 800),
      width
    )
    await page.setViewportSize({ width, height: 800 })
    await expect(strip).toBeVisible()
    const bounds = (await strip.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  }
  await page.screenshot({ path: testInfo.outputPath('workspace-icon-drag.png') })
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.isVisible())
    )
  ).toBe(false)
})
