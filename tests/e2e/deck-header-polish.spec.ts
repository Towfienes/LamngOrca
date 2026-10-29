import type { AiVaultSession } from '../../src/shared/ai-vault-types'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

// DeepSeek Harness left the quick toolbar; its history is still reachable from the + menu.
async function openDshHistoryFromAgentMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New agent', exact: true }).click()
  await page.getByRole('menuitem', { name: /DeepSeek Harness/ }).click()
  // Why: paging before the menu finishes closing dismisses the picker it just opened.
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.waitForTimeout(300)
}

test('Deck header keeps the signature readable and its compact controls actionable', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  const workspacePath = await page.evaluate(
    (id) =>
      Object.values(window.__store!.getState().worktreesByRepo)
        .flat()
        .find((wt) => wt.id === id)!.path,
    worktreeId
  )
  const sessions: AiVaultSession[] = Array.from({ length: 45 }, (_, index) => ({
    id: `dsh-ui-${index}`,
    agent: 'dsh',
    sessionId: `ui-${index}`,
    executionHostId: 'local',
    title: `UI session ${index}`,
    cwd: index === 44 ? `${workspacePath}-other` : workspacePath,
    branch: 'main',
    model: 'reported-model',
    filePath: '/fixture/dsh-session.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: new Date(Date.UTC(2026, 9, 22) - index * 1000).toISOString(),
    messageCount: 2,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `dsh-tui --resume ui-${index}`,
    subagent: null
  }))
  sessions.unshift(
    ...Array.from({ length: 45 }, (_, index) => ({
      ...sessions[0],
      id: `dsh-child-${index}`,
      sessionId: `child-${index}`,
      title: 'Child agent fixture',
      isSubagent: true
    }))
  )
  await electronApp.evaluate(({ ipcMain }, sessions) => {
    ipcMain.removeHandler('aiVault:listSessions')
    ipcMain.handle('aiVault:listSessions', () => ({
      sessions,
      issues: [],
      scannedAt: new Date().toISOString()
    }))
  }, sessions)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    state.setSidebarWidth(320)
    state.setUIZoomLevel(0)
    window.api.ui.setZoomLevel(0)
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark' })
  })
  await ensureTerminalVisible(page)
  const signature = page.getByRole('img', { name: 'Lamng', exact: true })
  await expect(signature).toBeVisible()
  await expect(page.locator('.deck-workspace-breadcrumb')).toHaveCount(0)
  await openDshHistoryFromAgentMenu(page)
  await expect(page.locator('[aria-label="DeepSeek Harness session history"]')).toBeVisible()
  const history = page.locator('[aria-label="DeepSeek Harness session history"]')
  await expect(history.getByText('1–40 of 44', { exact: true })).toBeVisible()
  await expect(history.getByText('Child agent fixture', { exact: true })).toHaveCount(0)
  await expect(history.getByText('UI session 0', { exact: true })).toBeVisible()
  await history.getByRole('button', { name: 'Next sessions', exact: true }).click()
  await expect(history.getByText('UI session 40', { exact: true })).toBeVisible()
  const search = history.getByRole('combobox', { name: 'Search sessions' })
  await search.fill('UI session 44')
  await expect(history.getByText('UI session 44', { exact: true })).toHaveCount(0)
  await history.getByRole('button', { name: 'View all sessions', exact: true }).click()
  await expect(history.getByText('UI session 44', { exact: true })).toBeVisible()
  await search.fill('')
  await history.getByRole('button', { name: 'This workspace', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('dsh-history-dark.png') })
  await page.keyboard.press('Escape')
  const command = page.getByRole('button', { name: 'Add quick command', exact: true })
  await expect(command).toHaveText('')
  await expect(
    page
      .locator('[data-tab-group-strip-id]')
      .getByRole('button', { name: 'Add quick command', exact: true })
  ).toHaveCount(0)
  await expect(
    page
      .locator('.deck-sidebar-toolbar')
      .getByRole('button', { name: 'Add quick command', exact: true })
  ).toBeVisible()
  // The avatar is gone; the signature itself opens the application menu.
  await expect(page.locator('.deck-avatar')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Application menu', exact: true }).locator('.deck-signature')
  ).toBeVisible()
  await expect(page.locator('.deck-workspace-strip-caption').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Application menu', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Go back', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Go forward', exact: true })).toHaveCount(0)
  const caption = page.locator('.deck-workspace-strip-caption:visible').first()
  const captionInset = await caption.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const slot = node.parentElement!.getBoundingClientRect()
    return rect.left - slot.left
  })
  expect(captionInset).toBeCloseTo(8, 0)
  const originalCaptionX = (await caption.boundingBox())!.x
  expect(
    await page
      .locator('.deck-agent-actions button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  ).toEqual([
    'New worktree',
    'Add folder',
    'New blank terminal',
    'New Claude session',
    'New Codex session',
    'New Antigravity session',
    'New agent'
  ])
  await page.evaluate(() => {
    const workbench = document.querySelector<HTMLElement>('[data-terminal-workbench-container]')!
    const animate = workbench.animate.bind(workbench)
    workbench.setAttribute('data-motion-count', '0')
    workbench.animate = (...args) => {
      workbench.setAttribute(
        'data-motion-count',
        String(Number(workbench.getAttribute('data-motion-count')) + 1)
      )
      return animate(...args)
    }
  })
  await page.getByRole('button', { name: 'New blank terminal', exact: true }).click()
  await expect(caption).toBeVisible()
  // Dots-only strip: the path is pinned at the start, so a new workspace never shifts it.
  expect(Math.abs((await caption.boundingBox())!.x - originalCaptionX)).toBeLessThanOrEqual(1)
  const workbench = page.locator('[data-terminal-workbench-container]')
  // Why: the surface holding every xterm canvas must not animate on a new tab — an
  // opacity fade there re-composites the terminal and reads as a hitch on CLI startup.
  await page.waitForTimeout(300)
  await expect(workbench).toHaveAttribute('data-motion-count', '0')
  const previousTabId = await page.evaluate(() => window.__store!.getState().activeTabId)
  await page.getByRole('button', { name: 'New blank terminal', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeTabId))
    .not.toBe(previousTabId)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(workbench).toHaveAttribute('data-motion-count', '0')
  const pane = page.locator('.pane:visible').first()
  await expect(pane).toHaveAttribute('data-pty-id', /.+/)
  const ptyId = (await pane.getAttribute('data-pty-id'))!
  const beforeStreaming = await workbench.boundingBox()
  const streamMotionCount = await workbench.getAttribute('data-motion-count')
  await page.evaluate(
    (id) =>
      window.api.pty.write(
        id,
        `node -e "let n=0;const timer=setInterval(()=>{console.log('frame '+n);if(++n===60){clearInterval(timer);console.log(['ORCA','STREAM','DONE'].join('_'))}},20)"\r`,
        'driving'
      ),
    ptyId
  )
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const snapshot = await window.api.pty.getMainBufferSnapshot(id, { scrollbackRows: 200 })
        return snapshot?.data.includes('ORCA_STREAM_DONE') ?? false
      }, ptyId)
    )
    .toBe(true)
  await expect(workbench).toHaveAttribute('data-motion-count', streamMotionCount!)
  expect(await workbench.boundingBox()).toEqual(beforeStreaming)
  await command.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const sidebar = page.getByRole('button', { name: 'Toggle right sidebar', exact: true })
  await sidebar.click()
  const portrait = page.getByRole('img', { name: 'David Laid', exact: true })
  await expect(portrait).toBeVisible()
  await expect(page.getByRole('button', { name: 'Usage settings', exact: true })).toBeVisible()
  const portraitRect = await portrait.boundingBox()
  const usageRect = await page.locator('.deck-usage-panel').boundingBox()
  expect(portraitRect!.y + portraitRect!.height).toBeLessThanOrEqual(
    usageRect!.y + usageRect!.height
  )
  const brand = page.locator('.deck-david-brand')
  const outside = page.getByRole('img', { name: 'outside', exact: true })
  await expect(outside).toHaveCount(0)
  const brandRect = (await brand.boundingBox())!
  expect(usageRect!.x + usageRect!.width - brandRect.x - brandRect.width).toBeCloseTo(8, 0)
  expect(usageRect!.y + usageRect!.height - brandRect.y - brandRect.height).toBeCloseTo(8, 0)
  expect(
    await brand.evaluate((node) => {
      const style = getComputedStyle(node)
      const content = node.parentElement!.querySelector('[data-usage-scroll]')!
      return (
        style.pointerEvents === 'none' &&
        Number(style.zIndex) > Number(getComputedStyle(content).zIndex)
      )
    })
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('header-with-portrait-dark.png') })
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
  for (const zoom of [1.5, 2.5]) {
    await page.evaluate((zoom) => {
      window.__store!.getState().setUIZoomLevel(zoom)
      window.api.ui.setZoomLevel(zoom)
    }, zoom)
    await expect
      .poll(() =>
        command.evaluate((button) => {
          const rect = button.getBoundingClientRect()
          for (let parent = button.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent)
            if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) {
              const bounds = parent.getBoundingClientRect()
              if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
                return false
              }
            }
          }
          return rect.left >= 0 && rect.right <= innerWidth
        })
      )
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`header-zoom-${zoom}.png`) })
  }
  await page.evaluate(() => {
    window.__store!.getState().setUIZoomLevel(0)
    window.api.ui.setZoomLevel(0)
  })
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.screenshot({ path: testInfo.outputPath('header-light-narrow.png') })
  await page.setViewportSize({ width: 1400, height: 900 })
  await sidebar.click()
  await expect(portrait).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('header-with-portrait-light.png') })
  await page.evaluate(async () => {
    await window.__store!.getState().upsertTerminalQuickCommand('local', {
      id: 'ui-check-command',
      label: 'UI check',
      action: 'terminal-command',
      command: 'echo ui-check',
      appendEnter: true,
      scope: { type: 'global' }
    })
  })
  const savedCommands = page
    .locator('.deck-sidebar-toolbar')
    .getByRole('button', { name: 'More quick commands', exact: true })
  await expect(savedCommands).toHaveText('')
  await savedCommands.click()
  await expect(page.getByText('UI check', { exact: true }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.__store!.getState().setSidebarWidth(220))
    const newAgent = page.getByRole('button', { name: 'New agent', exact: true })
    await expect(newAgent).toBeVisible()
    const rect = (await newAgent.boundingBox())!
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(width)
    await openDshHistoryFromAgentMenu(page)
    await expect(history).toBeVisible()
    const pickerBounds = (await history.boundingBox())!
    expect(pickerBounds.x).toBeGreaterThanOrEqual(0)
    expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(width)
    expect(pickerBounds.y).toBeGreaterThanOrEqual(0)
    expect(pickerBounds.y + pickerBounds.height).toBeLessThanOrEqual(900)
    await page.screenshot({ path: testInfo.outputPath(`dsh-history-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.screenshot({ path: testInfo.outputPath(`dsh-toolbar-${width}.png`) })
  }
})

test('workspace frame follows selection and workspace actions follow the selected checkout', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    state.setSidebarWidth(320)
    state.setUIZoomLevel(0)
    window.api.ui.setZoomLevel(0)
    await state.updateSettings({ theme: 'dark' })
    const output = document.createElement('output')
    output.id = 'editor-open-result'
    document.body.appendChild(output)
  })
  // Capture the real IPC call without opening an external window on the user's desktop.
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('shell:openInExternalEditor')
    ipcMain.handle('shell:openInExternalEditor', (event, request) => {
      void event.sender.executeJavaScript(
        `document.getElementById('editor-open-result').textContent = ${JSON.stringify(JSON.stringify(request))}`
      )
      return { ok: true }
    })
  })
  const frame = page.locator('.deck-workspace-selection-frame')
  await expect(frame).toBeVisible()
  const before = await frame.boundingBox()
  const secondary = page.getByRole('option').filter({ hasText: 'e2e-secondary' }).first()
  const explorer = page.locator('[data-explorer-file-surface]')
  await explorer.evaluate((node) => {
    const animate = node.animate.bind(node)
    node.setAttribute('data-motion-count', '0')
    node.animate = (...args) => {
      node.setAttribute(
        'data-motion-count',
        String(Number(node.getAttribute('data-motion-count')) + 1)
      )
      return animate(...args)
    }
  })
  const notes = page.getByRole('textbox', { name: 'Global notes' })
  await expect(notes).toBeVisible()
  await notes.fill('Global draft: finish UI, then review API')
  const originalFontSize = await notes.evaluate((node) => getComputedStyle(node).fontSize)
  await page.getByRole('button', { name: 'Zoom notes in', exact: true }).click()
  expect(await notes.evaluate((node) => getComputedStyle(node).fontSize)).not.toBe(originalFontSize)
  await page.getByRole('button', { name: 'Reset note zoom', exact: true }).click()
  await secondary.click()
  await expect(notes).toHaveValue('Global draft: finish UI, then review API')
  await expect.poll(() => explorer.getAttribute('data-motion-count')).not.toBe('0')
  await expect(secondary).toHaveAttribute('aria-current', 'page')
  const selected = secondary.locator('[data-worktree-card-surface]').first()
  await expect
    .poll(async () => {
      const a = await frame.boundingBox()
      const b = await selected.boundingBox()
      return a && b ? Math.abs(a.y - b.y) + Math.abs(a.height - b.height) : 999
    })
    .toBeLessThan(2)
  expect((await frame.boundingBox())!.y).not.toBe(before!.y)
  await expect(page.locator('.deck-workspace-strip-caption:visible').first()).toContainText(
    'e2e-secondary'
  )
  await page.getByRole('button', { name: 'Open workspace in VS Code', exact: true }).click()
  await expect(page.locator('#editor-open-result')).toContainText('code')
  const expectedPath = await selected.evaluate((surface) =>
    surface
      .closest('[data-worktree-id]')
      ?.getAttribute('data-worktree-id')
      ?.split('::')
      .slice(1)
      .join('::')
  )
  await expect(page.locator('#editor-open-result')).toContainText(expectedPath!)
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('shell:openInFileManager')
    ipcMain.handle('shell:openInFileManager', (event, path) => {
      void event.sender.executeJavaScript(
        `document.getElementById('editor-open-result').textContent = ${JSON.stringify(path)}`
      )
      return { ok: true }
    })
  })
  await page.locator('#editor-open-result').evaluate((node) => {
    node.textContent = ''
  })
  await page
    .getByRole('button', { name: /Open workspace in (File Manager|Finder|File Explorer)/ })
    .click()
  await expect(page.locator('#editor-open-result')).toHaveText(expectedPath!)
  await electronApp.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('claudeUsage:getSnapshot')
    ipcMain.handle('claudeUsage:getSnapshot', () => ({
      scanState: { enabled: true, isScanning: false },
      summary: {
        estimatedCostUsd: 1000,
        inputTokens: 800000,
        outputTokens: 100000,
        cacheReadTokens: 100000,
        cacheWriteTokens: 0,
        hasAnyClaudeData: true
      },
      daily: []
    }))
    ipcMain.removeHandler('codexUsage:getSnapshot')
    ipcMain.handle('codexUsage:getSnapshot', () => ({
      scanState: { enabled: true, isScanning: false },
      summary: {
        estimatedCostUsd: 400,
        inputTokens: 100000,
        cachedInputTokens: 10000,
        outputTokens: 10000,
        totalTokens: 110000,
        hasAnyCodexData: true
      },
      daily: []
    }))
  })
  await page.reload()
  await waitForSessionReady(page)
  await page.evaluate(() => {
    window.__store!.getState().setUIZoomLevel(0)
    window.api.ui.setZoomLevel(0)
  })
  await expect(page.locator('.deck-usage-total')).toHaveText('$1400.00')
  await expect(page.getByRole('textbox', { name: 'Global notes' })).toHaveValue(
    'Global draft: finish UI, then review API'
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await frame.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s')
  await page.setViewportSize({ width: 900, height: 700 })
  const remainingWidth = await page
    .locator('.deck-workspace-strip-label:visible')
    .first()
    .evaluate((node) => node.clientWidth)
  await expect(page.locator('.deck-workspace-strip-caption:visible')).toHaveCount(
    remainingWidth >= 140 ? 1 : 0
  )
  await expect(
    page.getByRole('button', { name: 'Open workspace in VS Code', exact: true })
  ).toBeVisible()
  await expect(page.locator('.deck-david-brand')).toBeVisible()
  const portrait = (await page.locator('.deck-david-brand').boundingBox())!
  for (const provider of ['claude', 'codex']) {
    const row = page.locator(`[data-usage-provider='${provider}']`)
    const track = (await row.getByRole('meter').boundingBox())!
    const amount = (await row.locator('.tabular-nums').boundingBox())!
    expect(track.x + track.width).toBeLessThanOrEqual(portrait.x)
    expect(amount.x + amount.width).toBeLessThanOrEqual(portrait.x)
  }
  await expect(page.getByRole('img', { name: 'outside', exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('workspace-selected-narrow.png') })
})
