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

test('each agent in a split tab keeps its own session name in the sidebar and pane header', async ({
  orcaPage: page
}, testInfo) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.evaluate(async () => {
    const state = window.__store!.getState()
    state.setWorktreeCardProperties(['status', 'unread', 'inline-agents'])
    state.setAgentActivityDisplayMode('full')
    await state.updateSettings({ theme: 'dark', tabAutoGenerateTitle: true })
  })
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page)
  await splitActiveTerminalPane(page, 'vertical')
  await waitForPaneCount(page, 2)
  await splitActiveTerminalPane(page, 'horizontal')
  await waitForPaneCount(page, 3)

  // Three Claude sessions share one tab, mirroring the captured user layout.
  const sessions = await page.evaluate(() => {
    const store = window.__store!
    const state = store.getState()
    const tabId = state.activeTabId!
    const panes = window.__paneManagers!.get(tabId)!.getPanes()
    // The tab-wide generated title used to be lent to every pane in the tab.
    state.setGeneratedTabTitleFromAgentPrompt(
      `${tabId}:${panes[0]!.leafId}`,
      'Sao cái fast jev compact nó lại k hoạt'
    )
    const ids = ['session-a', 'session-b', 'session-c']
    panes.forEach((pane, index) => {
      state.setAgentStatus(
        `${tabId}:${pane.leafId}`,
        {
          agentType: 'claude',
          state: 'done',
          prompt: index === 2 ? '--- name: paper-referee description: x' : 'Tiếp tục đi naof',
          lastAssistantMessage: 'Output that must never become a name'
        },
        'claude',
        { updatedAt: Date.now(), stateStartedAt: Date.now() }
      )
      const key = `${tabId}:${pane.leafId}`
      const entry = store.getState().agentStatusByPaneKey[key]!
      store.setState({
        agentStatusByPaneKey: {
          ...store.getState().agentStatusByPaneKey,
          [key]: { ...entry, providerSession: { key: 'session_id', id: ids[index]! } }
        }
      })
    })
    store.getState().setAiVaultSessionTitles([
      { agent: 'claude', sessionId: 'session-a', title: 'Kho skill MCP và plugin' },
      { agent: 'claude', sessionId: 'session-b', title: 'Tối ưu claude9 giống Claude thuần' },
      // A prompt-derived provider title: front matter from an expanded skill.
      { agent: 'claude', sessionId: 'session-c', title: '--- name: paper-referee description: x' }
    ])
    return { tabId, leafIds: panes.map((pane) => pane.leafId) }
  })

  const rowNames = page.locator('[data-deck-agent] .deck-agent-heading > span[title].flex-1')
  const expected = ['Kho skill MCP và plugin', 'Tối ưu claude9 giống Claude thuần', 'Claude']
  await expect
    .poll(async () => (await rowNames.allTextContents()).sort())
    .toEqual([...expected].sort())
  const sidebarText = await page.locator('.deck-sidebar').textContent()
  for (const leaked of ['Sao cái fast jev', '#1', '#2', 'paper-referee', 'Tiếp tục đi naof']) {
    expect(sidebarText).not.toContain(leaked)
  }

  const headerNames = async (): Promise<string[]> =>
    page
      .locator('.deck-pane-identity')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            (
              node.querySelector('.pane-title-text') ?? node.querySelector('span > span > span')
            )?.textContent?.trim() ?? ''
        )
      )
  await expect.poll(async () => (await headerNames()).sort()).toEqual([...expected].sort())

  // Focus changes and a late title for another session must not swap names.
  const before = await rowNames.allTextContents()
  await page.evaluate(({ tabId, leafIds }) => {
    const state = window.__store!.getState()
    for (const leafId of leafIds.toReversed()) {
      state.setTabLayout(tabId, { ...state.terminalLayoutsByTabId[tabId]!, activeLeafId: leafId })
    }
    state.setAiVaultSessionTitles([{ agent: 'claude', sessionId: 'unrelated', title: 'Other' }])
  }, sessions)
  await page.waitForTimeout(500)
  expect(await rowNames.allTextContents()).toEqual(before)

  // The user's pane rename wins in both places.
  await page.evaluate(({ tabId, leafIds }) => {
    const state = window.__store!.getState()
    const layout = state.terminalLayoutsByTabId[tabId]!
    state.setTabLayout(tabId, {
      ...layout,
      titlesByLeafId: { ...layout.titlesByLeafId, [leafIds[1]!]: 'My review' }
    })
  }, sessions)
  await expect.poll(async () => (await rowNames.allTextContents()).includes('My review')).toBe(true)
  await expect.poll(async () => (await headerNames()).includes('My review')).toBe(true)

  await page.screenshot({ path: testInfo.outputPath('deck-agent-session-titles.png') })
})
