import { writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
})

test('workspace icons and empty dots share a compact black capsule', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    if (state.sidebarOpen) {
      state.toggleSidebar()
    }
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark' })
  })
  const strip = page.getByRole('group', { name: 'Workspace tabs', exact: true })
  const pill = strip.locator('[data-workspace-selection-pill]')
  await expect(pill).toBeVisible()
  const slot = strip.locator('button.deck-tab-dot')
  await pill.evaluate((node) => {
    node.setAttribute('data-same-pill', 'true')
  })
  const buttonsBefore = await slot.evaluateAll((nodes) =>
    nodes.map((node) => ({ width: node.clientWidth, height: node.clientHeight }))
  )
  const from = (await pill.boundingBox())!.x
  await slot.nth(2).click()
  await expect(pill).toHaveAttribute('data-same-pill', 'true')
  const movement = await pill.evaluate((node) => {
    const transitions = node.getAnimations()
    const transition = transitions.find(
      (animation) =>
        animation.effect instanceof KeyframeEffect &&
        animation.effect.getKeyframes().some((frame) => 'transform' in frame)
    )
    if (!transition) {
      throw new Error('The selection must slide instead of jumping')
    }
    const timing = transition.effect!.getTiming()
    for (const animation of transitions) {
      animation.pause()
      animation.currentTime = 110
    }
    const x = node.getBoundingClientRect().x
    for (const animation of transitions) {
      animation.finish()
    }
    return { duration: timing.duration, x }
  })
  const selected = (await slot.nth(2).boundingBox())!
  const destination = selected.x + (selected.width - 6) / 2
  expect(movement.duration).toBe(220)
  expect(movement.x).toBeGreaterThan(from)
  expect(movement.x).toBeLessThan(destination)
  await page.mouse.move(0, 300)
  await expect.poll(async () => (await pill.boundingBox())!.x).toBeCloseTo(destination, 0)
  expect(
    await slot.evaluateAll((nodes) =>
      nodes.map((node) => ({ width: node.clientWidth, height: node.clientHeight }))
    )
  ).toEqual(buttonsBefore)
  const style = await pill.evaluate((node) => ({
    background: getComputedStyle(node).backgroundColor,
    radius: getComputedStyle(node).borderRadius,
    shadow: getComputedStyle(node).boxShadow
  }))
  await expect
    .poll(() => pill.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe('rgb(255, 255, 255)')
  expect(style.radius).toBe('9999px')
  expect((await pill.boundingBox())!.height).toBe(6)
  expect((await pill.boundingBox())!.width).toBe(6)
  expect(style.shadow).toBe('none')
  expect(await strip.evaluate((node) => getComputedStyle(node, '::before').backgroundColor)).toBe(
    'rgb(0, 0, 0)'
  )
  expect((await strip.boundingBox())!.width).toBe(72)
  await expect(slot.nth(0).locator('svg,img')).toHaveCount(1)
  await expect(strip.locator('button[data-empty] svg,button[data-empty] img')).toHaveCount(0)
  await expect(page.locator('[data-workspace-quick-launch]')).toBeVisible()
  for (const position of [1, 2, 0]) {
    await slot.nth(position).click()
  }
  await expect(slot.nth(0)).toHaveAttribute('aria-current', 'true')
  await expect
    .poll(async () => (await pill.boundingBox())!.x)
    .toBeCloseTo((await slot.nth(0).boundingBox())!.x, 0)
  await expect(page.locator('[data-workspace-quick-launch]')).toHaveCount(0)

  await page.mouse.move(0, 300)
  await slot.nth(0).hover()
  await expect(strip).toHaveCSS('translate', '0px -1px')
  expect(await strip.evaluate((node) => getComputedStyle(node, '::before').boxShadow)).not.toBe(
    'none'
  )
  const preview = page.locator('[data-workspace-pane-preview]')
  await expect(preview).toBeVisible()
  await preview.click()
  await page.mouse.move(0, 300)

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((theme) => window.__store!.getState().updateSettings({ theme }), theme)
    for (const width of [1440, 768, 390]) {
      await electronApp.evaluate(
        ({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setContentSize(width, 800),
        width
      )
      await page.setViewportSize({ width, height: 800 })
      await expect.poll(async () => (await strip.boundingBox())!.width).toBeGreaterThanOrEqual(32)
      await page.mouse.move(0, 300)
      await expect(pill).toHaveAttribute('data-occupied', 'true')
      expect((await pill.boundingBox())!.height).toBeCloseTo(16, 2)
      expect((await pill.boundingBox())!.width).toBeCloseTo(
        (await slot.nth(0).boundingBox())!.width,
        2
      )
      await expect
        .poll(async () => (await pill.boundingBox())!.x)
        .toBeCloseTo((await slot.nth(0).boundingBox())!.x, 0)
      expect(await slot.nth(0).evaluate((node) => getComputedStyle(node).color)).toBe(
        'rgb(255, 255, 255)'
      )
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
      writeFileSync(testInfo.outputPath(`pill-${theme}-${width}.png`), Buffer.from(image, 'base64'))
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await slot.nth(2).hover()
  await expect(strip).toHaveCSS('translate', 'none')
  expect(await strip.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s')
  await slot.nth(2).click()
  expect(await pill.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s')
  expect(await pill.evaluate((node) => node.getAnimations().length)).toBe(0)
  await expect
    .poll(async () => (await pill.boundingBox())!.x)
    .toBeCloseTo((await slot.nth(2).boundingBox())!.x + 5, 0)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible())
    )
  ).toBe(true)
})
