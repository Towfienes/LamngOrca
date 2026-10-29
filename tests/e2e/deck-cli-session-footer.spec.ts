import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('Codex account/context footer keeps its launch account and leaves the CLI its own space', async ({
  orcaPage: page
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.dismissUsagePercentageDisplayChangeNotice()
    state.markCodexTerminalServerIsolationNoticeSeen()
    state.setUIZoomLevel(0)
    window.api.ui.setZoomLevel(0)
    if (state.rightSidebarOpen) {
      state.toggleRightSidebar()
    }
    await state.updateSettings({ theme: 'dark' })
    const tabId = state.activeTabId!
    const pane = window.__paneManagers!.get(tabId)!.getActivePane()!
    const paneKey = `${tabId}:${pane.leafId}`
    const now = Date.now()
    const account = (id: string) => ({
      id,
      email: `${id}@example.invalid`,
      managedHomePath: `/fixture/${id}`,
      createdAt: now,
      updatedAt: now,
      lastAuthenticatedAt: now
    })
    window.__store!.setState({
      settings: {
        ...window.__store!.getState().settings,
        codexManagedAccounts: [account('launch'), account('global')],
        activeCodexManagedAccountId: 'global'
      },
      paneForegroundAgentByPaneKey: {
        ...state.paneForegroundAgentByPaneKey,
        [paneKey]: { agent: 'codex', shellForeground: false }
      },
      agentStatusByPaneKey: {
        ...state.agentStatusByPaneKey,
        [paneKey]: {
          paneKey,
          agentType: 'codex',
          state: 'working',
          prompt: 'Footer fixture',
          updatedAt: now,
          stateStartedAt: now,
          stateHistory: []
        }
      },
      agentLaunchConfigByPaneKey: {
        ...state.agentLaunchConfigByPaneKey,
        [paneKey]: {
          registeredAt: now,
          identity: { agentType: 'codex' },
          launchConfig: { agentArgs: '', agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'launch' } }
        }
      }
    })
    const paintFooter = () =>
      pane.terminal.write(
        '\x1b[2J\x1b[16;1H› Ask Codex to do anything\x1b[18;1HGPT-6.1-Sol high · Context 37% used\x1b[16;3H'
      )
    paintFooter()
    // Simulate CLI redraw after the real shell receives resize notifications.
    const repaint = setInterval(paintFooter, 250)
    setTimeout(() => clearInterval(repaint), 30000)
  })
  const footer = page.getByRole('status', { name: 'Codex session account and context' })
  await expect(footer).toContainText('launch@example.invalid')
  await expect(footer).toContainText('ctx 37%')
  await expect(footer).not.toContainText('global@example.invalid')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    if (width === 390) {
      await page.evaluate(() => {
        const state = window.__store!.getState()
        if (state.sidebarOpen) {
          state.toggleSidebar()
        }
      })
    }
    await expect(footer).toBeVisible()
    await expect
      .poll(() =>
        footer.evaluate((node) => {
          const grid = node.parentElement!.querySelector('.xterm-container')!
          return grid.getBoundingClientRect().bottom <= node.getBoundingClientRect().top + 1
        })
      )
      .toBe(true)
    expect(await footer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    expect(
      await footer.getByText('ctx 37%', { exact: true }).evaluate((node) => {
        const rect = node.getBoundingClientRect()
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return top === node || (top !== null && node.contains(top))
      })
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`codex-footer-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(async () => window.__store!.getState().updateSettings({ theme: 'light' }))
  await expect(footer).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('codex-footer-light.png') })
})
