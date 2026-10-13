import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('Linux Deck keeps status controls at the top and chrome seamless when narrowed', async ({
  orcaPage: page
}, testInfo) => {
  test.skip(process.platform !== 'linux', 'Linux Deck titlebar')
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    if (!state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    state.setSidebarWidth(220)
    for (const item of ['resource-usage', 'ports'] as const) {
      if (!state.statusBarItems.includes(item)) {
        state.toggleStatusBarItem(item)
      }
    }
    await state.updateSettings({ theme: 'dark' })
  })
  await ensureTerminalVisible(page)
  const topStatus = page.getByRole('group', { name: 'System status', exact: true })
  await expect(topStatus).toBeVisible()
  await expect(page.locator('.window-controls')).toHaveCount(0)
  const awake = topStatus.getByRole('button', { name: /^Keep computer awake/ })
  const resources = topStatus.getByRole('button', { name: /^Resource Manager/ })
  const ports = topStatus.getByRole('button', { name: /^Ports,/ })
  for (const control of [awake, resources, ports]) {
    await expect(control).toBeVisible()
  }
  await expect(
    page.locator('.deck-status-bar').getByRole('button', { name: /^Ports,/ })
  ).toHaveCount(0)
  await expect(
    page.locator('.deck-status-bar').getByRole('button', { name: /^Resource Manager/ })
  ).toHaveCount(0)
  await awake.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await resources.click()
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible()
  const popover = await page.locator('[data-slot="popover-content"]').boundingBox()
  expect(popover!.y).toBeGreaterThanOrEqual(0)
  await page.keyboard.press('Escape')
  await ports.click()
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible()
  await page.keyboard.press('Escape')

  for (const zoom of [0, 2.5]) {
    await page.evaluate((zoom) => window.__store!.getState().setUIZoomLevel(zoom), zoom)
    await expect
      .poll(() =>
        page.locator('.deck-create-bar').evaluate((bar) => {
          const area = bar.getBoundingClientRect()
          return [...bar.querySelectorAll('button')].every((button) => {
            const box = button.getBoundingClientRect()
            const text = [...button.childNodes].find(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
            )
            if (!text) {
              return false
            }
            const range = document.createRange()
            range.selectNode(text)
            const label = range.getBoundingClientRect()
            return (
              box.left >= area.left &&
              box.right <= area.right + 1 &&
              label.left >= box.left &&
              label.right <= box.right + 1
            )
          })
        })
      )
      .toBe(true)
    for (const name of ['Worktree', 'Folder', 'New agent']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
  }
  await expect
    .poll(() =>
      page
        .locator(
          [
            '.deck-sidebar',
            '.deck-tab-layout',
            '.deck-sidebar-toolbar',
            '.deck-status-bar',
            '.deck-sidebar [data-worktree-card-surface]',
            '.deck-right-sidebar [class~="border-b"]',
            '.deck-right-sidebar [class~="border-l"]'
          ].join(',')
        )
        .evaluateAll((elements) =>
          elements.every((element) => {
            const style = getComputedStyle(element)
            return [
              [style.borderTopWidth, style.borderTopColor],
              [style.borderRightWidth, style.borderRightColor],
              [style.borderBottomWidth, style.borderBottomColor],
              [style.borderLeftWidth, style.borderLeftColor]
            ].every(([width, color]) => width === '0px' || color === 'rgba(0, 0, 0, 0)')
          })
        )
    )
    .toBe(true)
  await expect(page.locator('.pane:visible')).toHaveCount(1)
  expect(
    await page
      .locator('.pane:visible')
      .evaluate((pane) => getComputedStyle(pane, '::after').borderWidth)
  ).toBe('1px')
  await page.locator('.pane:visible').click({ position: { x: 80, y: 120 } })
  await page.mouse.move(650, 600)
  await page.screenshot({ path: testInfo.outputPath('deck-titlebar-zoomed.png') })
  await page.setViewportSize({ width: 1000, height: 700 })
  await expect(topStatus).toBeVisible()
  await expect(resources).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('deck-titlebar-small.png') })
})
