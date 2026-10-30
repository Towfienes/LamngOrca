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

// DECK_AGENT_UX: selecting a workspace only selects it; agents start from the toolbar.
test('selecting a folder workspace opens nothing', async ({
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
    await state.fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
    if (!group) {
      throw new Error('Could not create folder group')
    }
    await state.createFolderWorkspace(
      { projectGroupId: group.id, name: 'Deck folder', folderPath },
      { runtimeEnvironmentId: null }
    )
  }, folderPath)
  await page.getByRole('option').filter({ hasText: 'Deck folder' }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.locator('.pane:visible')).toHaveCount(0)
})

test('selecting an empty worktree opens nothing until the toolbar launches a terminal', async ({
  orcaPage: page
}) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  const workspace = page.getByRole('option').filter({ hasText: 'e2e-secondary' })
  await workspace.click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.locator('.pane:visible')).toHaveCount(0)
  await page.getByRole('button', { name: 'New blank terminal', exact: true }).click()
  await expect(page.locator('.pane:visible')).toHaveCount(1)
  await workspace.click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.locator('.pane:visible')).toHaveCount(1)
})
