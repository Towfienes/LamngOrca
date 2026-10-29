import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  splitActiveTerminalPane,
  waitForActiveTerminalManager,
  waitForPaneCount
} from './helpers/terminal'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
})

test('Deck rail navigates real split panes and keeps tools reachable', async ({
  orcaPage: page
}, testInfo) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await page.evaluate(async () => {
    const store = window.__store!
    const state = store.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    state.setSidebarWidth(280)
    state.setWorktreeCardProperties(['status', 'unread', 'inline-agents'])
    state.setAgentActivityDisplayMode('full')
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({
      theme: 'dark',
      tabAutoGenerateTitle: false,
      compactWorktreeCards: false,
      terminalDividerThicknessPx: 1,
      terminalColorOverrides: { background: '#0c0c0c', foreground: '#d4d4d4' }
    })
  })
  await ensureTerminalVisible(page)
  const canvas = page.locator('.deck-workspace-shell')
  const canvasColor = await canvas.evaluate((element) => getComputedStyle(element).backgroundColor)
  await expect(page.locator('.deck-sidebar')).toHaveCSS('background-color', canvasColor)
  await expect(page.locator('[data-tab-group-strip-id]').first()).toHaveCSS(
    'background-color',
    canvasColor
  )
  const projectBranchSpacing = await page.locator('.deck-sidebar').evaluate((sidebar) => {
    const header = sidebar.querySelector('[data-repo-header-id]')!.getBoundingClientRect()
    const branch = sidebar
      .querySelector('[data-worktree-card-hover-trigger]')!
      .getBoundingClientRect()
    return branch.top - header.bottom
  })
  expect(projectBranchSpacing).toBeGreaterThanOrEqual(0)
  expect(projectBranchSpacing).toBeLessThanOrEqual(6)
  await page.evaluate(() => {
    const state = window.__store!.getState()
    for (const title of ['Review changes', 'Build and verify']) {
      const tab = state.createTab(state.activeWorktreeId!, undefined, undefined, {
        activate: false
      })
      state.setTabCustomTitle(tab.id, title)
    }
  })
  await waitForActiveTerminalManager(page)
  await splitActiveTerminalPane(page, 'vertical')
  await waitForPaneCount(page, 2)
  await page
    .locator('.pane:visible')
    .first()
    .click({ position: { x: 30, y: 60 }, force: true })
  await splitActiveTerminalPane(page, 'horizontal')
  await waitForPaneCount(page, 3)
  await page
    .locator('.pane:visible')
    .filter({ has: page.locator('.xterm') })
    .nth(2)
    .click({ position: { x: 50, y: 80 } })
  await splitActiveTerminalPane(page, 'horizontal')
  await waitForPaneCount(page, 4)
  await expect(
    page.locator('[data-testid="sortable-tab"]').filter({ hasText: 'Workspace · 4 panes' })
  ).toHaveCount(1)
  await expect(page.locator('.pane[data-active-pane]:visible')).toHaveCount(1)
  await expect(page.locator('.pane[data-active-pane]:visible')).toHaveCSS(
    'background-color',
    'rgb(12, 12, 12)'
  )
  await expect(page.locator('.pane-title-bar[data-active-pane]:visible')).toHaveCSS(
    'background-color',
    'rgb(12, 12, 12)'
  )
  await page.evaluate(() => {
    const store = window.__store!
    const state = store.getState()
    const tabId = state.activeTabId!
    const panes = window.__paneManagers!.get(tabId)!.getPanes()
    const specs = [
      {
        agentType: 'claude',
        prompt: 'Refine the sidebar layout',
        message: 'Compact project tree and agent rows'
      },
      {
        agentType: 'codex',
        prompt: 'Verify the terminal layout',
        message: 'Resize and pane navigation checks'
      },
      {
        agentType: 'gemini',
        prompt: 'Check the four-pane workspace',
        message: 'Live terminals, compact chrome'
      },
      {
        agentType: 'opencode',
        prompt: 'Review the interface',
        message: 'Keyboard access and readable contrast'
      }
    ]
    panes.forEach((pane, index) => {
      const spec = specs[index]!
      state.setAgentStatus(
        `${tabId}:${pane.leafId}`,
        {
          agentType: spec.agentType,
          state: index === 0 ? 'waiting' : 'working',
          prompt: spec.prompt,
          lastAssistantMessage: spec.message
        },
        spec.agentType,
        { updatedAt: Date.now(), stateStartedAt: Date.now() }
      )
      // Fixture text is clearly a preview, without launching a paid agent.
      pane.terminal.write(
        `\x1b[2J\x1b[HOrca Deck — layout preview\r\n\r\n${spec.prompt}\r\n${spec.message}\r\n\r\nReady for input.\r\n`
      )
    })
  })
  const rows = page.locator('[data-deck-agent]')
  await expect(rows).toHaveCount(4)
  const waitingRow = rows.filter({ hasText: 'Refine the sidebar layout' })
  await expect(waitingRow.locator('.deck-agent-state-slot')).toHaveAttribute(
    'aria-label',
    'Waiting for input'
  )
  expect(
    await waitingRow
      .locator('.deck-agent-icon-slot > *')
      .evaluate((icon) => getComputedStyle(icon).animationName)
  ).toBe('none')
  // Attention states badge the logo; there is no trailing state dot.
  const waitingBadge = await waitingRow.evaluate((row) => {
    const badge = row.querySelector('.deck-agent-state-slot')!.getBoundingClientRect()
    const icon = row.querySelector('.deck-agent-icon-slot')!.getBoundingClientRect()
    const heading = row.querySelector('.deck-agent-heading')!
    return {
      onIcon: badge.left < icon.right && badge.bottom > icon.top + icon.height / 2,
      trailingDot: getComputedStyle(heading, '::after').content
    }
  })
  expect(waitingBadge.onIcon).toBe(true)
  expect(waitingBadge.trailingDot).toBe('none')
  await expect
    .poll(() =>
      page.locator('[data-worktree-virtual-row-key]').evaluateAll((elements) => {
        const boxes = elements
          .map((element) => element.getBoundingClientRect())
          .sort((a, b) => a.top - b.top)
        return boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1]!.bottom)
      })
    )
    .toBe(true)
  await rows
    .filter({ hasText: 'Refine the sidebar layout' })
    .locator('[title="Refine the sidebar layout"]')
    .click()
  await expect(rows.filter({ hasText: 'Refine the sidebar layout' })).toHaveAttribute(
    'data-focused-agent-pane',
    'true'
  )
  const keyboardRow = rows.filter({ hasText: 'Verify the terminal layout' })
  await keyboardRow.getByRole('button', { name: 'Verify the terminal layout', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(keyboardRow).toHaveAttribute('data-focused-agent-pane', 'true')
  const iconAlignment = await keyboardRow.evaluate((row) => {
    const icon = row.querySelector('.deck-agent-icon-slot')!.getBoundingClientRect()
    const title = row
      .querySelector('.deck-agent-heading > [role="button"]')!
      .getBoundingClientRect()
    return {
      iconBeforeTitle: icon.right <= title.left,
      rowCenter: Math.abs(icon.top + icon.height / 2 - (title.top + title.height / 2)),
      rowHeight: row.getBoundingClientRect().height
    }
  })
  expect(iconAlignment.iconBeforeTitle).toBe(true)
  expect(iconAlignment.rowCenter).toBeLessThan(2)
  expect(iconAlignment.rowHeight).toBeLessThan(43)
  const providerIcon = keyboardRow.locator('.deck-agent-icon-slot > *')
  await expect(providerIcon).toHaveCSS('animation-name', 'none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(providerIcon).toHaveCSS('animation-name', 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.pane[data-active-pane]:visible')).toHaveCount(1)
  const borderColors = await page.locator('.pane:visible').evaluateAll((panes) =>
    panes.map((pane) => ({
      active: pane.hasAttribute('data-active-pane'),
      color: getComputedStyle(pane, '::after').borderColor
    }))
  )
  expect(borderColors.find((pane) => pane.active)?.color).not.toBe(
    borderColors.find((pane) => !pane.active)?.color
  )
  await expect(page.locator('.deck-terminal-surface:visible')).toHaveCSS(
    'background-color',
    canvasColor
  )
  await expect(page.locator('.pane-title-bar:visible').first()).toHaveCSS('height', '32px')
  await expect
    .poll(() =>
      page.locator('.pane-title-bar:visible').evaluateAll((headers) =>
        headers.every((header) => {
          const pane = document.querySelector(`.deck-terminal-surface .pane[data-active-pane]`)
          const box = header.getBoundingClientRect()
          return (
            !header.hasAttribute('data-active-pane') ||
            (pane &&
              Math.abs(box.left - pane.getBoundingClientRect().left) < 1 &&
              Math.abs(box.top - pane.getBoundingClientRect().top) < 1)
          )
        })
      )
    )
    .toBe(true)

  await expect(page.getByRole('button', { name: 'New agent', exact: true })).toBeEnabled()
  for (const button of await page.getByRole('button', { name: 'Got it', exact: true }).all()) {
    await button.click({ force: true })
  }
  await page.getByRole('button', { name: 'Tools and search' }).click()
  await expect(
    page.getByRole('button', { name: 'Search worktrees and browser tabs' })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Search worktrees and browser tabs' })).toBeHidden()
  await page.mouse.move(700, 400)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.setViewportSize({ width: 1600, height: 900 })
  await expect(page.locator('.deck-workspace-breadcrumb')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Lamng', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('deck-workspace.png') })
  await page
    .locator('.deck-sidebar')
    .screenshot({ path: testInfo.outputPath('deck-agent-sidebar.png') })
  await page.setViewportSize({ width: 1050, height: 700 })
  await expect(page.locator('.deck-workspace-breadcrumb')).toHaveCount(0)
  await expect(page.locator('.pane:visible')).toHaveCount(4)
  await expect(rows.first()).toBeVisible()
  await expect
    .poll(() =>
      page.locator('.pane:visible').evaluateAll((elements) =>
        elements.every((element) => {
          const box = element.getBoundingClientRect()
          const terminal = element.querySelector('.xterm-container')?.getBoundingClientRect()
          const screen = element.querySelector('.xterm-screen')?.getBoundingClientRect()
          return (
            box.width > 100 &&
            box.height > 100 &&
            box.right <= innerWidth + 1 &&
            box.bottom <= innerHeight + 1 &&
            terminal &&
            terminal.top >= box.top + 31 &&
            terminal.bottom <= box.bottom + 1 &&
            screen &&
            screen.top >= terminal.top &&
            screen.right <= box.right + 1 &&
            screen.bottom <= box.bottom + 1
          )
        })
      )
    )
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('deck-workspace-small.png')
  })
  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(
    await page
      .locator('.pane[data-active-pane]:visible')
      .evaluate((pane) => getComputedStyle(pane, '::after').borderColor)
  ).toBe(borderColors.find((pane) => pane.active)?.color)
  await page.screenshot({
    path: testInfo.outputPath('deck-workspace-light.png')
  })
  await page.evaluate(() => {
    const state = window.__store!.getState()
    state.setTabCustomTitle(state.activeTabId!, 'Agent team')
  })
  await expect(page.getByTestId('sortable-tab').filter({ hasText: 'Agent team' })).toHaveCount(1)
})
