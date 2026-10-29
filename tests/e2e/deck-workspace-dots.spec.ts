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
  orcaPage: page
}, testInfo) => {
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
  expect(geometry.border).toBe('1px')
  await expect(dots.first()).toBeVisible()
  await expect(dots.first()).toHaveAttribute('aria-current', 'true')
  const pillBox = (await dots.first().boundingBox())!
  expect(pillBox.width).toBeGreaterThanOrEqual(24)
  await page.mouse.move(640, 600)
  await page.screenshot({
    path: `${shotsDir}/dots-single-tab.png`,
    clip: { x: 0, y: 0, width: 1280, height: 120 }
  })

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

  // An empty slot opens a new workspace and the strip grows by one dot.
  await emptySlots.first().click()
  await expect(dots).toHaveCount(3)
  await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true')
  await expect(emptySlots).toHaveCount(3)
  await page.mouse.move(640, 600)
  await page.screenshot({
    path: `${shotsDir}/dots-centered-three.png`,
    clip: { x: 0, y: 0, width: 1280, height: 120 }
  })

  // Dots replace the text tabs, so closing lives on them: the hover card's Close, or a middle click.
  await dots.nth(2).hover()
  await page.getByRole('button', { name: /^Close / }).click()
  await expect(dots).toHaveCount(2)
  await page.mouse.move(640, 600)
  await dots.nth(1).click({ button: 'middle' })
  await expect(dots).toHaveCount(1)

  await page.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.mouse.move(640, 600)
  await shootDock('dock-b-light')
})
