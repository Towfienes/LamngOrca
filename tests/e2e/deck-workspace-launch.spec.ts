import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('folder workspace also asks before opening a terminal', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  const folderPath = mkdtempSync(path.join(os.tmpdir(), 'orca-deck-folder-'))
  registerPostElectronShutdownCleanup(() => rmSync(folderPath, { recursive: true, force: true }))
  await page.evaluate(async (folderPath) => {
    const state = window.__store!.getState()
    const group = await window.api.projectGroups.create({
      name: 'Folders',
      parentPath: folderPath,
      createdFrom: 'folder-scan'
    })
    await state.fetchProjectGroups()
    if (!group) {
      throw new Error('Could not create folder group')
    }
    await state.createFolderWorkspace({ projectGroupId: group.id, name: 'Deck folder', folderPath })
  }, folderPath)
  await page.getByRole('option').filter({ hasText: 'Deck folder' }).click()
  await expect(page.getByRole('menuitem', { name: 'Blank terminal', exact: true })).toBeVisible()
  await expect(page.locator('.pane:visible')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.workspace-tab:visible')).toHaveCount(0)
})

test('empty workspace asks what to launch and cancelling keeps it empty', async ({
  orcaPage: page
}) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  const workspace = page.getByRole('option').filter({ hasText: 'e2e-secondary' })
  await workspace.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Blank terminal', exact: true })).toBeVisible()
  await expect(page.locator('.pane:visible')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(page.locator('.workspace-tab:visible')).toHaveCount(0)
  await workspace.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Blank terminal', exact: true }).click()
  await expect(page.locator('.pane:visible')).toHaveCount(1)
  await expect(page.locator('.workspace-tab:visible')).toHaveCount(1)
  await expect(page.getByRole('menu')).toBeHidden()
  await workspace.click()
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(page.locator('.workspace-tab:visible')).toHaveCount(1)
})
