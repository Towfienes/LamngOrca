import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test.use({ orcaAppExtraArgs: process.platform === 'linux' ? ['--ozone-platform=headless'] : [] })

test('Quick Launch stays paintable, saves shortcuts and opens only an explicit terminal', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await waitForSessionReady(page)
  const id = await waitForActiveWorktree(page)
  await page.evaluate(async (id) => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    await state.updateSettingsOrThrow({
      theme: 'dark',
      workspaceQuickLaunch: {
        agents: ['claude', 'codex', 'opencode', 'antigravity', 'gemini', 'droid'],
        tools: ['terminal', 'browser', 'emulator']
      }
    })
    for (const tab of state.unifiedTabsByWorktree[id] ?? []) {
      state.closeUnifiedTab(tab.id)
    }
    state.setActiveWorktree(id)
    state.setActiveView('terminal')
    if (state.sidebarOpen) {
      state.toggleSidebar()
    }
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
  }, id)
  const launch = page.locator('[data-workspace-quick-launch]')
  await expect(launch).toBeVisible()
  await expect(launch.getByRole('button', { name: 'Terminal', exact: true })).toBeEnabled()
  for (const width of [390, 768, 1440]) {
    await electronApp.evaluate(({ BrowserWindow }, width) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900)
    }, width)
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(launch.getByRole('heading', { name: 'Start a session' })).toBeVisible()
    const geometry = await launch.evaluate((node) => ({
      overflow: node.scrollWidth > node.clientWidth,
      background: getComputedStyle(node).backgroundColor,
      opacity: getComputedStyle(node).opacity
    }))
    expect(geometry).toEqual({ overflow: false, background: 'rgb(0, 0, 0)', opacity: '1' })
    await page.screenshot({ path: testInfo.outputPath(`quick-launch-${width}.png`) })
  }
  expect(
    await page.evaluate((id) => window.__store!.getState().tabsByWorktree[id]?.length ?? 0, id)
  ).toBe(0)
  await launch.getByRole('button', { name: 'Customize', exact: true }).click()
  await page.getByRole('button', { name: 'Move claude down', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__store!.getState().settings?.workspaceQuickLaunch?.agents[0])
    )
    .toBe('codex')
  await page.getByRole('button', { name: 'Remove', exact: true }).first().click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__store!.getState().settings?.workspaceQuickLaunch?.agents.includes('codex')
      )
    )
    .toBe(false)
  await page.keyboard.press('Escape')
  await launch.getByRole('button', { name: 'Add agent', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search agents' }).fill('Codex')
  await page.getByRole('button', { name: 'Codex', exact: true }).last().click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__store!.getState().settings?.workspaceQuickLaunch?.agents.at(-1))
    )
    .toBe('codex')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(launch).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => window.__store!.getState().settings?.workspaceQuickLaunch?.agents.at(-1))
    )
    .toBe('codex')
  await launch.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(launch).toHaveCount(0)
  await expect(page.locator('.xterm-screen').first()).toBeVisible()
  await page.locator('.xterm-screen').first().click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+w' : 'Control+w')
  await expect(launch).toBeVisible()
  expect(errors).toEqual([])
})

test('empty folder workspace uses the same saved shortcuts without creating a shell', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}) => {
  const folderPath = mkdtempSync(join(tmpdir(), 'orca-quick-launch-folder-'))
  registerPostElectronShutdownCleanup(async () =>
    rmSync(folderPath, { recursive: true, force: true })
  )
  await waitForSessionReady(page)
  const previousId = await waitForActiveWorktree(page)
  const folderId = await page.evaluate(async (folderPath) => {
    const state = window.__store!.getState()
    const group = await state.createProjectGroup('Quick Launch', 'local')
    if (!group) {
      throw new Error('Project group was not created')
    }
    const folder = await state.createFolderWorkspace(
      { projectGroupId: group.id, folderPath },
      { runtimeEnvironmentId: null }
    )
    if (!folder) {
      throw new Error('Folder was not created')
    }
    await state.updateSettingsOrThrow({ workspaceQuickLaunch: { agents: ['codex'], tools: [] } })
    state.setActiveFolderWorkspace(folder.id)
    state.setActiveView('terminal')
    return folder.id
  }, folderPath)
  const launch = page.locator('[data-workspace-quick-launch]')
  await expect(launch).toBeVisible()
  await expect(launch.getByRole('button', { name: 'Codex', exact: true })).toHaveCount(1)
  await expect(launch.getByRole('button', { name: 'Terminal', exact: true })).toHaveCount(0)
  await page.evaluate((id) => window.__store!.getState().setActiveWorktree(id), previousId)
  await page.evaluate((id) => window.__store!.getState().setActiveFolderWorkspace(id), folderId)
  await expect(launch).toBeVisible()
  expect(
    await page.evaluate(
      (id) => window.__store!.getState().tabsByWorktree[`folder:${id}`]?.length ?? 0,
      folderId
    )
  ).toBe(0)
  await page.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ theme: 'light' })
  })
  await expect
    .poll(() => launch.evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe('rgb(0, 0, 0)')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(launch.getByRole('heading', { name: 'Start a session' })).toBeVisible()
  await page.evaluate(async () => {
    await window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
  })
})
