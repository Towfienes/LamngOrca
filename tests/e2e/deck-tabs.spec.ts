import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('Deck tabs stay readable, selectable and closable across themes and overflow', async ({
  orcaPage: page
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await page.evaluate(async (id) => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    state.setSidebarWidth(280)
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark' })
    state.setTabCustomTitle(state.activeTabId!, 'Workspace')
    for (const title of ['Refine the tab system', 'Review terminal layout']) {
      const tab = state.createTab(id, undefined, undefined, { activate: false })
      state.setTabCustomTitle(tab.id, title)
    }
  }, worktreeId)
  for (const button of await page.getByRole('button', { name: 'Got it', exact: true }).all()) {
    await button.click({ force: true })
  }
  const tabs = page.getByTestId('sortable-tab')
  const review = tabs.filter({ hasText: 'Review terminal layout' })
  await review.click()
  await expect(review).toHaveAttribute('data-active', 'true')
  await expect(review).toHaveCSS('border-top-width', '0px')
  await expect(review).toHaveCSS('font-weight', '500')
  await page.mouse.move(600, 500)
  await expect.poll(() => review.evaluate((el) => el.getAnimations().length)).toBe(0)
  const activeBackground = await review.evaluate((el) => getComputedStyle(el).backgroundColor)
  await review.hover()
  await expect(review).toHaveCSS('background-color', activeBackground)
  const height = await review.evaluate((el) => el.getBoundingClientRect().height)
  expect(height).toBeGreaterThanOrEqual(24)
  expect(height).toBeLessThanOrEqual(30)
  await page.mouse.move(600, 500)
  await page.screenshot({ path: testInfo.outputPath('deck-tabs-dark.png') })

  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.screenshot({ path: testInfo.outputPath('deck-tabs-light.png') })
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'dark' }))
  await page.setViewportSize({ width: 900, height: 700 })
  await page.evaluate((id) => {
    const state = window.__store!.getState()
    for (let index = 0; index < 10; index++) {
      const tab = state.createTab(id, undefined, undefined, { activate: false })
      state.setTabCustomTitle(tab.id, `Background task ${index + 1}`)
    }
  }, worktreeId)
  const strip = page.locator('.terminal-tab-strip').first()
  await expect(page.getByRole('button', { name: 'Scroll tabs right', exact: true })).toBeVisible()
  await expect.poll(() => strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await expect
    .poll(() =>
      tabs.evaluateAll((elements) =>
        elements.every((el) => el.getBoundingClientRect().width >= 115)
      )
    )
    .toBe(true)
  await page.getByRole('button', { name: 'Scroll tabs right', exact: true }).click()
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  await expect
    .poll(() =>
      review.evaluate((el) => {
        const bounds = el.getBoundingClientRect()
        const parent = el.closest('.terminal-tab-strip')!.getBoundingClientRect()
        return bounds.left >= parent.left && bounds.right <= parent.right
      })
    )
    .toBe(true)
  await page.mouse.move(600, 500)
  await page.screenshot({ path: testInfo.outputPath('deck-tabs-overflow.png') })

  await review.dblclick()
  const rename = page.getByRole('textbox', { name: 'Rename tab Review terminal layout' })
  await rename.fill('Layout review')
  await rename.press('Enter')
  const renamed = tabs.filter({ hasText: 'Layout review' })
  await expect(renamed).toHaveAttribute('data-active', 'true')
  const close = page.getByRole('button', { name: 'Close tab Layout review', exact: true })
  await close.focus()
  await expect(close).toBeFocused()
  await close.press('Enter')
  await expect(renamed).toHaveCount(0)
  await expect(page.locator('.workspace-tab-active')).toHaveCount(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.workspace-tab-active')).toHaveCSS('transition-duration', '0s')
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await expect(page.getByRole('menu')).toBeVisible()
})

test('compact tab surfaces keep drag reorder and pin controls working', async ({
  orcaPage: page
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.evaluate((id) => {
    const state = window.__store!.getState()
    state.setTabCustomTitle(state.activeTabId!, 'First tab')
    const tab = state.createTab(id)
    state.setTabCustomTitle(tab.id, 'Second tab')
  }, worktreeId)
  const tabs = page.getByTestId('sortable-tab')
  await expect(tabs).toHaveCount(2)
  const first = tabs.filter({ hasText: 'First tab' })
  const second = tabs.filter({ hasText: 'Second tab' })
  const start = (await first.boundingBox())!
  const end = (await second.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width - 6, end.y + end.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(tabs.first()).toHaveAttribute('data-tab-title', 'Second tab')
  await first.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Pin Tab', exact: true }).click()
  await expect(first).toHaveAttribute('data-pinned', 'true')
  await expect(first.getByRole('button', { name: 'Close tab First tab' })).toHaveCount(0)
  await expect(tabs.first()).toHaveAttribute('data-tab-title', 'First tab')
})

test('editor and browser tabs share compact geometry and dirty files retain keyboard controls', async ({
  orcaPage: page,
  seededRepoPath
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  const { fileId, browserId } = await page.evaluate(
    ({ id, filePath }) => {
      const state = window.__store!.getState()
      state.setSidebarWidth(280)
      if (state.rightSidebarOpen) {
        state.toggleRightSidebar()
      }
      const browser = state.createBrowserTab(id, 'about:blank', { activate: false })
      const fileId = state.openFile({
        filePath,
        relativePath: 'package.json',
        worktreeId: id,
        language: 'json',
        mode: 'edit'
      })
      return { fileId, browserId: browser.id }
    },
    { id: worktreeId, filePath: path.join(seededRepoPath, 'package.json') }
  )
  const tabs = page.locator('.terminal-tab-strip .workspace-tab')
  await expect(tabs).toHaveCount(3)
  await expect
    .poll(() =>
      tabs.evaluateAll(
        (elements) => new Set(elements.map((el) => el.getBoundingClientRect().height)).size
      )
    )
    .toBe(1)
  const fileTab = tabs.filter({ hasText: 'package.json' })
  await expect(fileTab).toHaveAttribute('data-active', 'true')
  await expect(fileTab).toHaveCSS('width', '196px')
  const width = await fileTab.evaluate((el) => el.getBoundingClientRect().width)
  await page.evaluate((id) => window.__store!.getState().markFileDirty(id, true), fileId)
  await page.mouse.move(600, 500)
  await fileTab.focus()
  const close = fileTab.getByRole('button', { name: 'Close tab', exact: true })
  await expect(close).toBeVisible()
  await close.focus()
  await expect(close).toBeFocused()
  expect(await fileTab.evaluate((el) => el.getBoundingClientRect().width)).toBe(width)
  await page.evaluate((id) => window.__store!.getState().markFileDirty(id, false), fileId)
  await close.press('Enter')
  await expect(fileTab).toHaveCount(0)
  const browserTab = page.locator(`.workspace-tab[data-tab-id="${browserId}"]`)
  await browserTab.click()
  await expect(browserTab).toHaveAttribute('data-active', 'true')
})
