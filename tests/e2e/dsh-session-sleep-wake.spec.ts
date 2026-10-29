import path from 'node:path'
import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { getTerminalContent } from './helpers/terminal'
import { quoteStartupArg, resolveStartupShell } from '../../src/shared/tui-agent-startup-shell'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('DSH hook identity survives workspace sleep and resumes the same pane', async ({
  orcaPage: page,
  testRepoPath
}, testInfo) => {
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  const launchLog = path.join(testRepoPath, '.dsh-wake-launches.jsonl')
  const launches = (): { sessionId: string; launchToken: string }[] => {
    try {
      return readFileSync(launchLog, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    } catch {
      return []
    }
  }
  const fixture = path.join(process.cwd(), 'tests/e2e/fixtures/dsh-sleep-wake-agent.cjs')
  const command = `node ${quoteStartupArg(fixture, resolveStartupShell(process.platform))}`
  await page.evaluate(
    async ({ worktreeId, command, launchLog }) => {
      const state = window.__store!.getState()
      await state.updateSettings({
        agentCmdOverrides: { dsh: command },
        agentDefaultArgs: { dsh: '' }
      })
      const tab = state.createTab(worktreeId)
      state.queueTabStartupCommand(tab.id, {
        command,
        launchAgent: 'dsh',
        env: { ORCA_DSH_WAKE_LOG: launchLog },
        launchConfig: {
          agentCommand: command,
          agentArgs: '',
          agentEnv: { ORCA_DSH_WAKE_LOG: launchLog }
        }
      })
      state.setActiveTab(tab.id)
    },
    { worktreeId, command, launchLog }
  )
  await expect
    .poll(() => getTerminalContent(page), { timeout: 30000 })
    .toContain('DSH_SLEEP_WAKE_READY:')
  const identity = await page.evaluate(() => {
    const state = window.__store!.getState()
    const entry = Object.values(state.agentStatusByPaneKey).find(
      (entry) => entry.agentType === 'dsh'
    )
    if (!entry?.providerSession) {
      throw new Error('DSH hook identity unavailable')
    }
    return {
      paneKey: entry.paneKey,
      sessionId: entry.providerSession.id,
      tabId: state.activeTabId!
    }
  })
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Sleep workspace', exact: true }).click({ force: true })
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__store!.getState().ptyIdsByTabId[id]?.length ?? 0,
          identity.tabId
        )
      )
      .toBe(0)
    const captured = await page.evaluate(
      (key) => window.__store!.getState().sleepingAgentSessionsByPaneKey[key],
      identity.paneKey
    )
    await testInfo.attach(`sleep-${cycle}`, {
      body: JSON.stringify(captured ?? null),
      contentType: 'application/json'
    })
    expect(captured?.providerSession.id).toBe(identity.sessionId)
    expect(captured?.launchConfig?.agentEnv?.ORCA_DSH_WAKE_LOG).toBe(launchLog)
    if (cycle === 2) {
      await page.reload()
      await waitForSessionReady(page)
    }
    await page.locator(`[data-worktree-id="${worktreeId}"]`).first().click()
    await expect
      .poll(() => getTerminalContent(page), { timeout: 30000 })
      .toContain(`DSH_SLEEP_WAKE_READY:${identity.sessionId}`)
    await expect
      .poll(
        () =>
          page.evaluate(
            (key) => window.__store!.getState().agentStatusByPaneKey[key]?.providerSession?.id,
            identity.paneKey
          ),
        { timeout: 15000 }
      )
      .toBe(identity.sessionId)
    try {
      await expect.poll(() => launches().length, { timeout: 15000 }).toBe(cycle + 2)
    } finally {
      const debug = await page.evaluate(async (key) => {
        const state = window.__store!.getState()
        const tabId = key.split(':')[0]!
        return {
          status: state.agentStatusByPaneKey[key],
          record: state.sleepingAgentSessionsByPaneKey[key],
          ptys: state.ptyIdsByTabId[tabId],
          layout: state.terminalLayoutsByTabId[tabId],
          host: (await window.api.agentStatus.getSnapshot()).filter((e) => e.paneKey === key),
          content: window.__paneManagers?.get(tabId)?.getActivePane()?.terminal.buffer.active.length
        }
      }, identity.paneKey)
      await testInfo.attach(`wake-${cycle}`, {
        body: JSON.stringify(debug),
        contentType: 'application/json'
      })
    }
    expect(launches().every((launch) => launch.sessionId === identity.sessionId)).toBe(true)
  }
})
