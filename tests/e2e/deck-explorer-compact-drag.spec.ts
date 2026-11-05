import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { openFileExplorer } from './helpers/file-explorer'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
})

test('compact global prompts and ordinary file drags retain internal ownership', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  const workspace = await page.evaluate(() => {
    const state = window.__store!.getState()
    const entry = Object.values(state.worktreesByRepo)
      .flat()
      .find((item) => item.id === state.activeWorktreeId)
    if (!entry) {
      throw new Error('Missing disposable workspace')
    }
    return { id: entry.id, path: entry.path }
  })
  const filePath = path.join(workspace.path, 'presentation notes #1.md')
  writeFileSync(filePath, 'Keep this prompt file.\n')
  await page.evaluate(
    ({ id, filePath }) => {
      const state = window.__store!.getState()
      state.dismissUsagePercentageDisplayChangeNotice()
      state.markCodexTerminalServerIsolationNoticeSeen()
      state.setRightSidebarTab('source-control')
      localStorage.setItem(
        'orca.global-prompts.v1',
        JSON.stringify([
          {
            filePath,
            relativePath: 'presentation notes #1.md',
            worktreeId: id,
            owner: { kind: 'local' }
          }
        ])
      )
      if (state.sidebarOpen) {
        state.toggleSidebar()
      }
    },
    { id: workspace.id, filePath }
  )
  await expect(page.getByRole('region', { name: 'Global prompts', exact: true })).toHaveCount(0)
  await openFileExplorer(page)
  const prompt = page.locator('[data-pinned-prompt]')
  await expect(prompt).toHaveCount(1)
  expect((await prompt.boundingBox())!.height).toBeLessThanOrEqual(28)
  const open = prompt.getByRole('button', { name: 'Open presentation notes #1.md', exact: true })
  await expect(open).toHaveAttribute('title', 'presentation notes #1.md')
  const copy = prompt.getByRole('button', { name: 'Copy presentation notes #1.md', exact: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(0, 300)
  const finePointer = await page.evaluate(
    () => matchMedia('(hover: hover) and (pointer: fine)').matches
  )
  await expect(copy).toHaveCSS('opacity', finePointer ? '0' : '1')
  await prompt.hover()
  await expect(copy).toHaveCSS('opacity', '1')
  await page.mouse.move(0, 300)
  await open.focus()
  await expect(copy).toHaveCSS('opacity', '1')

  const row = page
    .locator('[data-file-explorer-row]')
    .filter({ has: page.getByText('presentation notes #1.md', { exact: true }) })
  await expect(row).toBeVisible({ timeout: 10_000 })
  // Ozone headless cannot start an OS drag; exercise the row's payload without exporting user files.
  const payload = await row.evaluate((node) => {
    const dataTransfer = new DataTransfer()
    const accepted = node.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer })
    )
    node.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }))
    return {
      accepted,
      download: dataTransfer.getData('DownloadURL'),
      uri: dataTransfer.getData('text/uri-list'),
      internal: dataTransfer.getData('text/x-orca-file-path'),
      source: dataTransfer.getData('application/x-orca-workspace-file-source')
    }
  })
  expect(payload.accepted).toBe(true)
  expect(payload.internal).toBe(filePath)
  expect(JSON.parse(payload.source)).toMatchObject({
    workspaceId: workspace.id,
    executionHostId: 'local'
  })
  expect(payload.uri).toMatch(/^file:/)
  expect(payload.uri).toContain('presentation%20notes%20%231.md')
  expect(payload.download).toBe(`application/octet-stream:presentation notes #1.md:${payload.uri}`)

  for (const width of [1440, 768, 390]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setContentSize(width, 800),
      width
    )
    await page.setViewportSize({ width, height: 800 })
    const bounds = (await prompt.boundingBox())!
    expect(bounds.height).toBeLessThanOrEqual(28)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
    const image = await electronApp.evaluate(async ({ BrowserWindow }) =>
      (
        await BrowserWindow.getAllWindows()[0]!.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true
        })
      )
        .toPNG()
        .toString('base64')
    )
    writeFileSync(testInfo.outputPath(`prompts-${width}.png`), Buffer.from(image, 'base64'))
  }
  await prompt.getByRole('button', { name: 'Unpin presentation notes #1.md', exact: true }).click()
  await expect(prompt).toHaveCount(0)
  expect(existsSync(filePath)).toBe(true)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible())
    )
  ).toBe(true)
})
