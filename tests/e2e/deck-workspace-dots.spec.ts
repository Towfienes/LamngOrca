import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('Deck toolbar dock and centered dots-only workspace strip switch and open workspaces', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  // Real session launches, reload and three viewport passes verify the same durable slot layout.
  test.setTimeout(180_000)
  const shotsDir = process.env.ORCA_DECK_SHOTS_DIR ?? testInfo.outputDir
  mkdirSync(shotsDir, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
    state.setSidebarWidth(280)
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark' })
  })
  for (const button of await page.getByRole('button', { name: 'Got it', exact: true }).all()) {
    await button.click({ force: true })
  }

  // Toolbar: one dock, two labelled groups, no DeepSeek button.
  const toolbar = page.locator('[aria-label="Workspace actions"]')
  await expect(toolbar.locator('.deck-dock-label')).toHaveCount(0)
  await expect(toolbar.getByRole('group')).toHaveCount(2)
  await expect(toolbar.getByRole('button', { name: /DeepSeek/ })).toHaveCount(0)
  await expect(toolbar.getByRole('button')).toHaveCount(7)
  await expect(toolbar.locator('.deck-agent-running-dot')).toHaveCount(0)

  // Compact dock: hugs its icons, ~26px tall, and the + button has no circle or border.
  const dockBox = (await toolbar.locator('.deck-agent-actions').boundingBox())!
  const sidebarBox = (await page.locator('.deck-sidebar').boundingBox())!
  expect(dockBox.width).toBeLessThan(sidebarBox.width - 40)
  expect(dockBox.height).toBeLessThanOrEqual(30)
  const plusBorder = await toolbar
    .getByRole('button', { name: 'New agent', exact: true })
    .evaluate((node) => {
      const style = getComputedStyle(node)
      return {
        width: style.borderTopWidth,
        shadow: style.boxShadow,
        background: style.backgroundColor
      }
    })
  expect(plusBorder.width).toBe('0px')
  expect(plusBorder.shadow).toBe('none')
  expect(plusBorder.background).toBe('rgba(0, 0, 0, 0)')
  const dockClip = { x: 0, y: 0, width: 320, height: Math.ceil(dockBox.y + dockBox.height + 12) }
  const cdp = await page.context().newCDPSession(page)
  // Why: Playwright pins clip screenshots to CSS pixels; CDP's clip scale re-rasterises at 2x density.
  const shootDock = async (name: string): Promise<void> => {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...dockClip, scale: 2 }
    })
    writeFileSync(`${shotsDir}/${name}.png`, Buffer.from(data, 'base64'))
  }
  await page.mouse.move(640, 600)
  await shootDock('dock-b-dark')

  // One tab: a single active pill is always visible.
  const strip = page.getByRole('group', { name: 'Workspace tabs' })
  const dots = strip.locator('button:not([data-empty])')
  const emptySlots = strip.locator('button[data-empty]')
  await expect(dots).toHaveCount(1)
  await expect(emptySlots).toHaveCount(3)
  // Dots-only strip: no text tabs, no titlebar avatar, capsule centered in the strip, path on its left.
  await expect(page.locator('.deck-tab-bar-dots .terminal-tab-strip')).toHaveCount(0)
  await expect(page.locator('.deck-avatar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Application menu', exact: true })).toHaveCount(1)
  const geometry = await page.locator('.deck-tab-bar-dots').evaluate((bar) => {
    const box = bar.getBoundingClientRect()
    const capsule = bar.querySelector('.deck-tab-dots')!.getBoundingClientRect()
    const path = bar.querySelector('.deck-workspace-strip-caption')?.getBoundingClientRect()
    return {
      offCenter: Math.abs(capsule.left + capsule.width / 2 - (box.left + box.width / 2)),
      pathBeforeCapsule: path ? path.right <= capsule.left : null,
      border: getComputedStyle(bar.querySelector('.deck-tab-dots')!).borderTopWidth
    }
  })
  expect(geometry.offCenter).toBeLessThanOrEqual(2)
  expect(geometry.pathBeforeCapsule).toBe(true)
  expect(geometry.border).toBe('0px')
  await expect(dots.first()).toBeVisible()
  await expect(dots.first()).toHaveAttribute('aria-current', 'true')
  const pillBox = (await dots.first().boundingBox())!
  expect(pillBox.width).toBeGreaterThanOrEqual(24)
  await page.mouse.move(640, 600)
  await page.screenshot({
    path: `${shotsDir}/dots-single-tab.png`,
    clip: { x: 0, y: 0, width: 1280, height: 120 }
  })

  await page.evaluate(() => {
    const state = window.__store!.getState()
    if (state.sidebarOpen) {
      state.toggleSidebar()
    }
  })
  for (const width of [1440, 768, 390]) {
    await electronApp.evaluate(
      ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setContentSize(width, 800),
      width
    )
    await page.setViewportSize({ width, height: 800 })
    for (const position of [1, 2, 3, 2, 1]) {
      const slot = strip.locator('button.deck-tab-dot').nth(position)
      const before = await slot.boundingBox()
      await slot.click()
      await expect(slot).toHaveAttribute('aria-current', 'true')
      await expect(strip.locator('[aria-current="true"]')).toHaveCount(1)
      await expect(page.locator('[data-workspace-launch-slot]')).toHaveAttribute(
        'data-workspace-launch-slot',
        String(position + 1)
      )
      await expect(page.locator('[data-workspace-quick-launch]')).toBeVisible()
      await expect(dots).toHaveCount(1)
      await expect(page.locator('.xterm-screen:visible')).toHaveCount(0)
      const after = await slot.boundingBox()
      expect(after?.width).toBe(before?.width)
      const styles = await strip.evaluate((node) => {
        const style = getComputedStyle(node),
          box = node.getBoundingClientRect()
        return {
          border: style.borderTopWidth,
          shadow: style.boxShadow,
          background: style.backgroundColor,
          width: box.width,
          height: box.height,
          inactive: [...node.querySelectorAll('button:not([data-active="true"])')].map(
            (button) => getComputedStyle(button).boxShadow
          ),
          dotShadow: getComputedStyle(node.querySelector('[data-empty]')!, '::before').boxShadow
        }
      })
      expect(styles).toMatchObject({
        border: '0px',
        shadow: 'none',
        background: 'rgba(0, 0, 0, 0)',
        height: 24,
        dotShadow: 'none'
      })
      expect(styles.width).toBeGreaterThanOrEqual(99)
      expect(styles.width).toBeLessThanOrEqual(124)
      expect(styles.inactive.every((shadow) => shadow === 'none')).toBe(true)
    }
    await page.screenshot({
      path: `${shotsDir}/dots-clean-${width}.png`,
      clip: { x: 0, y: 0, width, height: 120 }
    })
    await dots.first().click()
    await expect(page.locator('[data-workspace-quick-launch]')).toHaveCount(0)
  }
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800)
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => {
    const state = window.__store!.getState()
    if (!state.sidebarOpen) {
      state.toggleSidebar()
    }
  })

  const slots = strip.locator('button.deck-tab-dot')
  await slots.nth(2).click()
  await page
    .locator('[data-workspace-quick-launch]')
    .getByRole('button', { name: 'Terminal', exact: true })
    .click()
  await expect(dots).toHaveCount(2)
  await expect(slots.nth(1)).toHaveAttribute('data-empty', 'true')
  await expect(slots.nth(2)).not.toHaveAttribute('data-empty', 'true')
  await expect(slots.nth(2)).toHaveAttribute('aria-current', 'true')
  const slotThreeId = await slots.nth(2).getAttribute('data-workspace-tab-id')
  if (!slotThreeId) {
    throw new Error('Workspace 3 has no session identity')
  }
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ worktreeId, tabId }) =>
            (await window.api.session.get()).unifiedTabs?.[worktreeId]?.some(
              (tab) => tab.id === tabId
            ) ?? false,
          { worktreeId, tabId: slotThreeId }
        ),
      { timeout: 20_000 }
    )
    .toBe(true)
  await page.reload()
  await waitForSessionReady(page)
  await expect(slots.nth(1)).toHaveAttribute('data-empty', 'true')
  await expect(slots.nth(2)).toHaveAttribute('data-workspace-tab-id', slotThreeId)
  await slots.nth(0).click({ button: 'middle' })
  await expect(dots).toHaveCount(1)
  await expect(slots.nth(0)).toHaveAttribute('data-empty', 'true')
  await expect(slots.nth(2)).toHaveAttribute('data-workspace-tab-id', slotThreeId)
  await slots.nth(0).click()
  await page
    .locator('[data-workspace-quick-launch]')
    .getByRole('button', { name: 'Terminal', exact: true })
    .click()
  await expect(dots).toHaveCount(2)
  await expect(slots.nth(0)).toHaveAttribute('aria-current', 'true')
  await expect(slots.nth(2)).toHaveAttribute('data-workspace-tab-id', slotThreeId)
  await slots.nth(2).click({ button: 'middle' })
  await expect(dots).toHaveCount(1)
  await expect(slots.nth(0)).toHaveAttribute('aria-current', 'true')

  const { groupId, sourceTerminalId, newTabId, newTerminalId } = await page.evaluate((id) => {
    const state = window.__store!.getState()
    const groupId = state.activeGroupIdByWorktree[id]
    const sourceTabId = state.groupsByWorktree[id]!.find((g) => g.id === groupId)!.activeTabId!
    const sourceTerminalId = state.unifiedTabsByWorktree[id]!.find(
      (t) => t.id === sourceTabId
    )!.entityId
    state.setTabCustomTitle(sourceTerminalId, 'Review')
    const tab = state.createTab(id, groupId, undefined, { activate: true })
    state.setTabCustomTitle(tab.id, 'Build')
    state.setActiveTab(sourceTerminalId)
    state.activateTab(sourceTabId)
    const newTabId = window
      .__store!.getState()
      .unifiedTabsByWorktree[id]!.find((t) => t.entityId === tab.id)!.id
    return { groupId, sourceTerminalId, newTabId, newTerminalId: tab.id }
  }, worktreeId)

  // Two tabs: two dots, the first (active) is the pill.
  await expect(dots).toHaveCount(2)
  await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true')
  await expect(dots.nth(1)).not.toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.deck-tab-dots')).toHaveCount(1)

  // Agent state: amber ring for waiting, green ring + toolbar dot for running.
  await page.evaluate(
    ({ id, sourceTerminalId, newTerminalId }) => {
      const leafA = '11111111-1111-4111-8111-111111111111'
      const leafB = '22222222-2222-4222-8222-222222222222'
      const entry = (paneKey: string, agentType: string, state: 'working' | 'waiting') => ({
        paneKey,
        agentType,
        state,
        prompt: '',
        updatedAt: Date.now(),
        stateStartedAt: Date.now(),
        stateHistory: [],
        worktreeId: id
      })
      window.__store!.setState({
        agentStatusByPaneKey: {
          [`${sourceTerminalId}:${leafA}`]: entry(
            `${sourceTerminalId}:${leafA}`,
            'claude',
            'waiting'
          ),
          [`${newTerminalId}:${leafB}`]: entry(`${newTerminalId}:${leafB}`, 'codex', 'working')
        }
      })
    },
    { id: worktreeId, sourceTerminalId, newTerminalId }
  )
  await expect(dots.nth(0)).toHaveAttribute('data-attention', 'waiting')
  await expect(dots.nth(1)).toHaveAttribute('data-attention', 'running')
  await expect(toolbar.locator('.deck-agent-running-dot')).toHaveCount(2)
  await expect(
    toolbar.locator('.deck-agent-quick-button[data-running="true"] button').first()
  ).toBeVisible()
  await toolbar.screenshot({ path: `${shotsDir}/toolbar-dark.png` })

  // Hover preview card names the tab and its pane count.
  await dots.nth(1).hover()
  const card = page.locator('.deck-tab-preview')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Build')
  await expect(card).toContainText('1 pane')
  await page.screenshot({
    path: `${shotsDir}/dots-two-tabs-hover.png`,
    clip: { x: 0, y: 0, width: 1280, height: 220 }
  })

  const activeTabId = (): Promise<string | null | undefined> =>
    page.evaluate(
      ({ id, group }) =>
        window.__store!.getState().groupsByWorktree[id]?.find((g) => g.id === group)?.activeTabId,
      { id: worktreeId, group: groupId }
    )

  // Clicking the inactive dot activates that tab without animating the terminal surface.
  await dots.nth(1).click()
  await expect.poll(activeTabId).toBe(newTabId)
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true')
  await expect(dots.nth(0)).not.toHaveAttribute('aria-current', 'true')
  expect(
    await page
      .locator('[data-terminal-workbench-container]')
      .evaluate((node) => node.getAnimations().length)
  ).toBe(0)

  // Keyboard: the dot is a focusable button that activates on Enter.
  await dots.nth(0).focus()
  await page.keyboard.press('Enter')
  await expect.poll(activeTabId).not.toBe(newTabId)
  await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true')

  // An empty slot selects Quick Launch without creating a terminal or closing the old workspace.
  await emptySlots.first().click()
  const quickLaunch = page.locator('[data-workspace-quick-launch]')
  await expect(quickLaunch).toBeVisible()
  await expect(quickLaunch.getByRole('heading', { name: 'Start a session' })).toBeVisible()
  await expect(dots).toHaveCount(2)
  await expect(emptySlots.first()).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.xterm-screen:visible')).toHaveCount(0)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+w' : 'Control+w')
  await expect(quickLaunch).toHaveCount(0)
  await expect(dots).toHaveCount(2)
  await emptySlots.first().click()
  await expect(quickLaunch).toBeVisible()
  await dots.first().click()
  await expect(quickLaunch).toHaveCount(0)
  await expect(page.locator('.xterm-screen:visible').first()).toBeVisible()
  await expect(dots).toHaveCount(2)
  await emptySlots.first().click()
  await quickLaunch.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(quickLaunch).toHaveCount(0)
  await expect(dots).toHaveCount(3)
  await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true')
  await expect(emptySlots).toHaveCount(1)
  await page.mouse.move(640, 600)
  await page.screenshot({
    path: `${shotsDir}/dots-centered-three.png`,
    clip: { x: 0, y: 0, width: 1280, height: 120 }
  })

  await emptySlots.first().click()
  await expect(quickLaunch).toBeVisible()
  await expect(dots).toHaveCount(3)
  await expect(strip.locator('button')).toHaveCount(5)
  await quickLaunch.getByRole('button', { name: 'Terminal', exact: true }).click()
  await expect(dots).toHaveCount(4)
  await expect(emptySlots).toHaveCount(1)
  await expect(strip.locator('button')).toHaveCount(5)
  await dots.nth(3).click({ button: 'middle' })
  await expect(dots).toHaveCount(3)
  await expect(strip.locator('button')).toHaveCount(4)

  // Dots replace the text tabs, so closing lives on them: the hover card's Close, or a middle click.
  await dots.nth(2).hover()
  await page
    .locator('.deck-tab-preview')
    .getByRole('button', { name: /^Close / })
    .click()
  await expect(dots).toHaveCount(2)
  await page.mouse.move(640, 600)
  await dots.nth(1).click({ button: 'middle' })
  await expect(dots).toHaveCount(1)

  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.mouse.move(640, 600)
  await shootDock('dock-b-light')
})
