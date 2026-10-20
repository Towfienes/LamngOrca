import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('Deck header keeps the signature readable and its compact controls actionable', async ({
  orcaPage: page
}, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    state.setSidebarWidth(320)
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark' })
  })
  await ensureTerminalVisible(page)
  const signature = page.getByRole('img', { name: 'Lamng', exact: true })
  await expect(signature).toBeVisible()
  await expect(page.locator('.deck-workspace-breadcrumb')).toHaveCount(0)
  const command = page.getByRole('button', { name: 'Add quick command', exact: true })
  await expect(command).toHaveText('Command')
  await command.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const sidebar = page.getByRole('button', { name: 'Toggle right sidebar', exact: true })
  await sidebar.click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().rightSidebarOpen))
    .toBe(true)
  await sidebar.click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().rightSidebarOpen))
    .toBe(false)
  await page.mouse.move(700, 400)
  await page.screenshot({ path: testInfo.outputPath('header-dark.png') })
  await page.setViewportSize({ width: 1000, height: 700 })
  await page.evaluate(() => window.__store!.getState().setSidebarWidth(220))
  await expect(signature).toBeVisible()
  const bounds = await signature.boundingBox()
  expect(bounds!.width).toBeGreaterThan(40)
  await expect(command).toBeVisible()
  await expect(sidebar).toBeVisible()
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.screenshot({ path: testInfo.outputPath('header-light-narrow.png') })
})
