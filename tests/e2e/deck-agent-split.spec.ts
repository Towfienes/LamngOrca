import { expect, test } from './helpers/orca-app'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  GOLDEN_STUB_READY_MARKER
} from './helpers/golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForPaneCount } from './helpers/terminal'

test.use({
  launchEnv: getGoldenStubAgentLaunchEnv(),
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('sidebar Agent tiles into the last hovered pane without adding tabs', async ({
  orcaPage: page
}, testInfo) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  await configureGoldenStubAgent(page)
  await page.evaluate(() => {
    const state = window.__store!.getState()
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    localStorage.setItem('orca.workspaceBoardMovedHintSeen.v1', 'true')
  })
  const tabCount = (): Promise<number> =>
    page.evaluate(() => {
      const state = window.__store!.getState()
      return (state.tabsByWorktree[state.activeWorktreeId!] ?? []).length
    })
  const initialTabs = await tabCount()
  // Clicks through the DOM so the pointer never leaves the hovered pane.
  const press = (locator: ReturnType<typeof page.locator>): Promise<void> =>
    locator.evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  const original = page.locator('.pane:visible').first()
  const originalLeaf = await original.getAttribute('data-leaf-id')
  await original.hover()
  for (let count = 2; count <= 4; count++) {
    // Keep choosing the original leaf even though each new agent takes keyboard focus.
    await page.locator(`.pane[data-leaf-id="${originalLeaf}"]`).hover()
    await page.getByRole('button', { name: 'New agent', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Codex(?:\s|$)/i }).click()
    // Agent → Account → Session (DECK_AGENT_UX).
    await press(page.locator('[aria-label="Launch account"] button').first())
    await press(page.getByRole('option', { name: 'New session', exact: true }))
    await waitForPaneCount(page, count)
    expect(await tabCount()).toBe(initialTabs)
    await expect
      .poll(
        () =>
          page.evaluate((marker) => {
            const state = window.__store!.getState()
            const panes = window.__paneManagers!.get(state.activeTabId!)!.getPanes()
            return panes.filter(({ terminal }) => {
              const buffer = terminal.buffer.active
              return Array.from(
                { length: buffer.length },
                (_, i) => buffer.getLine(i)?.translateToString() ?? ''
              )
                .join('\n')
                .includes(marker)
            }).length
          }, GOLDEN_STUB_READY_MARKER),
        { timeout: 20_000 }
      )
      .toBe(count - 1)
    await expect(page.getByRole('button', { name: 'New agent', exact: true })).toBeEnabled()
  }
  const panes = await page.locator('.pane:visible').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        leaf: element.getAttribute('data-leaf-id'),
        width: rect.width,
        height: rect.height,
        left: rect.left
      }
    })
  )
  const source = panes.find((pane) => pane.leaf === originalLeaf)!
  // First split makes columns; the next divides the left column, leaving the right untouched.
  expect(panes.some((pane) => pane.left > source.left && pane.height > source.height * 1.5)).toBe(
    true
  )
  await page.mouse.move(10, 10)
  await page.screenshot({ path: testInfo.outputPath('deck-agent-tiling.png') })
})
