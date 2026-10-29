import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('clicking a retained sleeping agent selects its workspace in both sidebar modes', async ({
  orcaPage: page
}, testInfo) => {
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  const paneKey = await page.evaluate((worktreeId) => {
    const store = window.__store!
    const state = store.getState()
    const tab = state.tabsByWorktree[worktreeId]?.[0] ?? state.createTab(worktreeId)
    const paneKey = `${tab.id}:11111111-1111-4111-8111-111111111111`
    const now = Date.now()
    store.setState({
      retainedAgentsByPaneKey: {
        ...store.getState().retainedAgentsByPaneKey,
        [paneKey]: {
          entry: {
            paneKey,
            tabId: tab.id,
            worktreeId,
            agentType: 'dsh',
            state: 'done',
            prompt: 'Sleeping DSH click fixture',
            updatedAt: now,
            stateStartedAt: now,
            stateHistory: []
          },
          worktreeId,
          tab,
          agentType: 'dsh',
          startedAt: now
        }
      }
    })
    state.setSidebarWidth(280)
    return paneKey
  }, worktreeId)

  for (const mode of ['compact', 'full'] as const) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const tabIds = await page.evaluate(
        ({ worktreeId, mode }) => {
          const store = window.__store!
          store.setState({ agentActivityDisplayMode: mode })
          store.getState().setActiveWorktree(null)
          return store.getState().tabsByWorktree[worktreeId]?.map((tab) => tab.id)
        },
        { worktreeId, mode }
      )
      const row = page.getByText('Sleeping DSH click fixture', { exact: true }).first()
      await expect(row).toBeVisible()
      await row.click()
      await expect
        .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
        .toBe(worktreeId)
      expect(
        await page.evaluate(
          (id) => window.__store!.getState().tabsByWorktree[id]?.map((tab) => tab.id),
          worktreeId
        )
      ).toEqual(tabIds)
    }
  }
  expect(
    await page.evaluate(
      (key) => Boolean(window.__store!.getState().retainedAgentsByPaneKey[key]),
      paneKey
    )
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('sleeping-agent-workspace-selected.png') })
})
