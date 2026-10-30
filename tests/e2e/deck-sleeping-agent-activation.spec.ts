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
            agentType: 'claude',
            state: 'done',
            prompt: 'Sleeping agent click fixture',
            updatedAt: now,
            stateStartedAt: now,
            stateHistory: []
          },
          worktreeId,
          tab,
          agentType: 'claude',
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
      // Rows show the session or provider name, never the prompt (DECK_AGENT_UX session names).
      const agents = page.getByRole('option').getByRole('group', { name: 'Agents' })
      // Compact rows are buttons; full rows are tree items.
      const row = agents
        .getByRole('button', { name: 'Claude', exact: true })
        .or(agents.getByRole('treeitem'))
        .first()
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
