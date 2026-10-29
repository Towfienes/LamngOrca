import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({ orcaAppExtraArgs: process.platform === 'linux' ? ['--ozone-platform=headless'] : [] })

test('pinned prompts read fresh files, preserve notes and survive reload', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isVisible() || window.isFocused()) {
        throw new Error('Test window must stay hidden')
      }
    }
    // Keep this test's copied prompt out of the user's desktop clipboard.
    ipcMain.removeHandler('clipboard:writeText')
    ipcMain.handle('clipboard:writeText', (_event, content: string) => {
      process.env.ORCA_TEST_PROMPT_CLIPBOARD = content
    })
  })
  const root = await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    state.setRightSidebarTab('explorer')
    state.setRightSidebarOpen(true)
    state.setRightSidebarWidth(320)
    localStorage.setItem('orca.global-notes.v1', 'Keep my notes')
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    await state.updateSettings({ theme: 'dark' })
    return state.getKnownWorktreeById(state.activeWorktreeId!)!.path
  })
  const md = path.join(root, 'review-prompt.md')
  const txt = path.join(root, 'paper-prompt.txt')
  writeFileSync(md, 'Review carefully\nTiếng Việt — exact text\n')
  writeFileSync(txt, 'Review the paper\n')
  const panel = page.getByRole('region', { name: 'Global prompts', exact: true })
  await page.evaluate(
    ({ filePath }) => {
      const state = window.__store!.getState()
      const worktree = state.getKnownWorktreeById(state.activeWorktreeId!)!
      localStorage.removeItem('orca.global-prompts.v1')
      localStorage.setItem(
        `orca.pinned-prompts.v1:${JSON.stringify([worktree.repoId, JSON.stringify({ kind: 'local' })])}`,
        JSON.stringify([{ filePath, relativePath: 'review-prompt.md', worktreeId: worktree.id }])
      )
    },
    { filePath: md }
  )
  await page.reload()
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(1)
  for (const filename of ['paper-prompt.txt']) {
    await panel.getByRole('button', { name: 'Pin prompt file' }).click()
    await page.getByPlaceholder('Find .md or .txt files…').fill(filename)
    await page.getByRole('option').filter({ hasText: filename }).first().click()
  }
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(2)
  await panel.getByRole('button', { name: 'Copy review-prompt.md' }).click()
  await expect
    .poll(() => electronApp.evaluate(() => process.env.ORCA_TEST_PROMPT_CLIPBOARD))
    .toBe('Review carefully\nTiếng Việt — exact text\n')
  writeFileSync(md, 'Updated on disk\n')
  await panel.getByRole('button', { name: 'Copy review-prompt.md' }).click()
  await expect
    .poll(() => electronApp.evaluate(() => process.env.ORCA_TEST_PROMPT_CLIPBOARD))
    .toBe('Updated on disk\n')
  await panel.getByRole('button', { name: 'Toggle notes' }).click()
  await expect(page.getByRole('textbox', { name: 'Global notes' })).toHaveValue('Keep my notes')
  await panel.getByRole('button', { name: 'Toggle notes' }).click()
  await panel.getByRole('button', { name: 'Open paper-prompt.txt' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move up' }).click()
  await expect(panel.locator('[data-pinned-prompt]').first()).toHaveAttribute(
    'data-pinned-prompt',
    txt
  )
  await page.reload()
  await expect(panel.locator('[data-pinned-prompt]').first()).toHaveAttribute(
    'data-pinned-prompt',
    txt
  )
  await panel.getByRole('button', { name: 'Open paper-prompt.txt' }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window
          .__store!.getState()
          .openFiles.some((file) => file.filePath.endsWith('paper-prompt.txt'))
      )
    )
    .toBe(true)
  unlinkSync(md)
  await panel.getByRole('button', { name: 'Copy review-prompt.md' }).click()
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible()
  expect(await electronApp.evaluate(() => process.env.ORCA_TEST_PROMPT_CLIPBOARD)).toBe(
    'Updated on disk\n'
  )
  await panel.getByRole('button', { name: 'Open review-prompt.md' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Unpin', exact: true }).click()
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(1)
  const activeId = await page.evaluate(() => window.__store!.getState().activeWorktreeId)
  await page.evaluate(() => window.__store!.getState().setActiveWorktree(null))
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(1)
  await panel.getByRole('button', { name: 'Copy paper-prompt.txt' }).click()
  await expect
    .poll(() => electronApp.evaluate(() => process.env.ORCA_TEST_PROMPT_CLIPBOARD))
    .toBe('Review the paper\n')
  await panel.getByRole('button', { name: 'Create blank Markdown prompt' }).click()
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(2)
  const blankPath = await panel
    .locator('[data-pinned-prompt]')
    .last()
    .getAttribute('data-pinned-prompt')
  expect(blankPath).toBeTruthy()
  expect(blankPath!.startsWith(root)).toBe(false)
  expect(readFileSync(blankPath!, 'utf8')).toBe('')
  await expect
    .poll(() =>
      page.evaluate(
        (filePath) =>
          window.__store!.getState().openFiles.some((file) => file.filePath === filePath),
        blankPath
      )
    )
    .toBe(true)
  await page.evaluate((id) => window.__store!.getState().setActiveWorktree(id), activeId)
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(2)
  await panel
    .locator('[data-pinned-prompt]')
    .last()
    .getByRole('button', { name: /^Unpin / })
    .click()
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(1)
  expect(existsSync(blankPath!)).toBe(true)
  await page.reload()
  await expect(panel.locator('[data-pinned-prompt]')).toHaveCount(1)
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const row = panel.locator('[data-pinned-prompt]').first()
    await expect(row).toBeVisible()
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(
      testInfo.outputPath(`pinned-prompts-${width}.png`),
      Buffer.from(shot.data, 'base64')
    )
    await cdp.detach()
  }
})
