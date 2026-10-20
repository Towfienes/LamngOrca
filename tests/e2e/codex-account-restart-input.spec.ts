import { chmodSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { FAKE_CODEX_LAUNCH_PROBES_SOURCE } from './helpers/fake-codex-launch-probes'
import {
  buildFakeAgentCommandOverride,
  FAKE_AGENT_WINDOWS_SHELL
} from './helpers/fake-agent-command-override'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

const fixture = mkdtempSync(path.join(os.tmpdir(), 'orca-codex-account-restart-'))
const source = `${FAKE_CODEX_LAUNCH_PROBES_SOURCE}
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdout.write('\\x1b[2J\\x1b[HRESTART_READY:' + process.pid + '\\r\\nACCOUNT_HOME:' + process.env.CODEX_HOME + '\\r\\nCLAUDE_ACCOUNT_HOME:' + process.env.CLAUDE_CONFIG_DIR + '\\r\\n')
process.stdout.write('SESSION_ARGS:' + JSON.stringify(process.argv.slice(2)) + '\\r\\nSESSION_CWD:' + process.cwd() + '\\r\\n')
let input = ''
process.stdin.on('data', chunk => { input += chunk.toString(); process.stdout.write('RESTART_INPUT:' + input + '\\r\\n') })
setInterval(() => {}, 1000)
`
const executable = path.join(fixture, process.platform === 'win32' ? 'codex.cmd' : 'codex')
if (process.platform === 'win32') {
  writeFileSync(path.join(fixture, 'codex.cjs'), source)
  writeFileSync(executable, '@echo off\r\nnode "%~dp0codex.cjs" %*\r\n')
} else {
  writeFileSync(executable, `#!/usr/bin/env node\n${source}`)
  chmodSync(executable, 0o755)
}

const claudeExecutable = path.join(fixture, process.platform === 'win32' ? 'claude.cmd' : 'claude')
const claudeSource = `
if (process.argv.includes('--version')) { console.log('2.1.299 (Claude Code)'); process.exit(0) }
${source}
const fs = require('node:fs')
const path = require('node:path')
const resumeIndex = process.argv.indexOf('--resume')
const sessionId = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : require('node:crypto').randomUUID()
async function postClaudeHook(payload) {
  if (!process.env.CLAUDE_CONFIG_DIR || !process.env.ORCA_AGENT_HOOK_PORT) return
  const settings = JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8'))
  const installed = settings.hooks?.[payload.hook_event_name]?.some(definition => definition.hooks?.some(hook => hook.command?.includes('claude-hook')))
  if (!installed) return
  await fetch('http://127.0.0.1:' + process.env.ORCA_AGENT_HOOK_PORT + '/hook/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Orca-Agent-Hook-Token': process.env.ORCA_AGENT_HOOK_TOKEN },
    body: JSON.stringify({ paneKey: process.env.ORCA_PANE_KEY, tabId: process.env.ORCA_TAB_ID, worktreeId: process.env.ORCA_WORKTREE_ID, launchToken: process.env.ORCA_AGENT_LAUNCH_TOKEN, env: process.env.ORCA_AGENT_HOOK_ENV, payload: { session_id: sessionId, ...payload } })
  })
}
let pendingHooks = ''
let hookQueue = Promise.resolve()
process.stdin.on('data', chunk => {
  pendingHooks += chunk.toString()
  let newline
  while ((newline = pendingHooks.indexOf('\\n')) >= 0) {
    const line = pendingHooks.slice(0, newline)
    pendingHooks = pendingHooks.slice(newline + 1)
    if (line.startsWith('ORCA_TEST_HOOK:')) hookQueue = hookQueue.then(() => postClaudeHook(JSON.parse(line.slice('ORCA_TEST_HOOK:'.length))))
  }
})
hookQueue = hookQueue.then(() => postClaudeHook({ hook_event_name: 'SessionStart', source: resumeIndex >= 0 ? 'resume' : 'startup', model: 'claude-sonnet-4-6' }))
`
if (process.platform === 'win32') {
  writeFileSync(path.join(fixture, 'claude.cjs'), claudeSource)
  writeFileSync(claudeExecutable, '@echo off\r\nnode "%~dp0claude.cjs" %*\r\n')
} else {
  writeFileSync(claudeExecutable, `#!/usr/bin/env node\n${claudeSource}`)
  chmodSync(claudeExecutable, 0o755)
}

test.afterAll(() => rmSync(fixture, { recursive: true, force: true }))

test.use({
  launchEnv: { PATH: `${fixture}${path.delimiter}${process.env.PATH ?? ''}` },
  orcaAppExtraArgs: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : [])
  ]
})

test('Codex account restart replaces the process and accepts keyboard input', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await orcaPage.setViewportSize({ width: 1400, height: 900 })
  await orcaPage.evaluate(
    async ({ command, windowsShell }) => {
      const state = window.__store!.getState()
      await state.updateSettings({
        agentCmdOverrides: { codex: command },
        terminalWindowsShell: windowsShell,
        ...(navigator.userAgent.includes('Linux') ? { terminalDefaultShell: '/bin/bash' } : {}),
        terminalHiddenViewParking: false,
        terminalGpuAcceleration: 'off'
      })
      const tab = state.createTab(state.activeWorktreeId!, undefined, undefined, {
        launchAgent: 'codex',
        pendingStartup: {
          command,
          launchAgent: 'codex',
          startupCommandDelivery: 'shell-ready'
        }
      })
      state.setActiveTab(tab.id)
      state.setActiveTabType('terminal', state.activeWorktreeId)
    },
    { command: buildFakeAgentCommandOverride(executable), windowsShell: FAKE_AGENT_WINDOWS_SHELL }
  )
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage)
  const previousPtyId = await waitForActivePanePtyId(orcaPage)
  await expect.poll(() => getTerminalContent(orcaPage)).toContain('RESTART_READY:')
  const previousContent = await getTerminalContent(orcaPage)
  const previousPid = /RESTART_READY:(\d+)/.exec(previousContent)?.[1]
  expect(previousPid).toBeTruthy()
  await orcaPage.evaluate((ptyId) => {
    window.__store!.getState().markCodexRestartNotices([
      {
        ptyId,
        previousAccountLabel: 'Exhausted account',
        nextAccountLabel: 'Replacement account'
      }
    ])
  }, previousPtyId)
  await orcaPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Restart', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await expect
    .poll(
      async () => {
        const content = await getTerminalContent(orcaPage)
        const pid = /RESTART_READY:(\d+)/.exec(content)?.[1]
        return Boolean(pid && pid !== previousPid)
      },
      { timeout: 20_000 }
    )
    .toBe(true)
  await expect(orcaPage.getByRole('dialog').filter({ hasText: 'Exhausted account' })).toHaveCount(0)
  await orcaPage.locator('.xterm:visible textarea').first().focus()
  await orcaPage.keyboard.type('restart-input-works')
  await expect
    .poll(() => getTerminalContent(orcaPage))
    .toContain('RESTART_INPUT:restart-input-works')
})

test('quick Codex icon chooses an account for one CLI and preserves the Orca default', async ({
  electronApp,
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await orcaPage.setViewportSize({ width: 1400, height: 900 })
  await orcaPage.evaluate(async () => {
    const state = window.__store!.getState()
    state.setGroupBy('repo')
    state.setSidebarWidth(360)
    await state.updateSettings({ theme: 'dark' })
    const active = Object.values(state.worktreesByRepo)
      .flat()
      .find((worktree) => worktree.id === state.activeWorktreeId)!
    await state.updateRepo(active.repoId, { externalWorktreeVisibility: 'show' })
    await window.__store!.getState().fetchWorktrees(active.repoId)
  })
  await expect(orcaPage.locator('.deck-sidebar [data-repo-worktree-tree="root"]')).toBeVisible()
  await expect(orcaPage.locator('.deck-sidebar [data-repo-worktree-tree="last"]')).toBeVisible()
  const childOffset = await orcaPage
    .locator('.deck-sidebar [data-repo-worktree-tree="last"]')
    .evaluate((element) => getComputedStyle(element).marginInlineStart)
  expect(childOffset).toBe('12px')
  const workspaceActions = orcaPage.locator('[aria-label="Workspace actions"]')
  await expect(workspaceActions.getByRole('button')).toHaveCount(8)
  expect(
    await workspaceActions
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  ).toEqual([
    'New worktree',
    'Add folder',
    'Search workspaces and sessions',
    'New blank terminal',
    'New Claude session',
    'New Codex session',
    'New Antigravity session',
    'New agent'
  ])
  for (const button of await workspaceActions.getByRole('button').all()) {
    const circle = await button.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        width: bounds.width,
        height: bounds.height,
        radius: getComputedStyle(element).borderRadius,
        text: element.textContent?.trim()
      }
    })
    expect(circle.width).toBe(circle.height)
    expect(Number.parseFloat(circle.radius)).toBeGreaterThanOrEqual(circle.width / 2)
    expect(circle.text).toBe('')
  }
  await orcaPage.evaluate(() => window.__store!.getState().setSidebarWidth(240))
  await expect(workspaceActions.locator('.deck-agent-actions')).toHaveCSS(
    'grid-template-columns',
    /^(\S+ ){3}\S+$/
  )
  await orcaPage.evaluate(() => window.__store!.getState().setSidebarWidth(360))
  await expect(workspaceActions.locator('.deck-agent-actions')).toHaveCSS(
    'grid-template-columns',
    /^(\S+ ){7}\S+$/
  )
  await workspaceActions
    .getByRole('button', { name: 'Search workspaces and sessions' })
    .click({ force: true })
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store!.getState().activeModal))
    .toBe('worktree-palette')
  const workspaceSearch = orcaPage.getByRole('dialog', { name: 'Jump to...' })
  await expect(workspaceSearch).toBeVisible()
  await workspaceSearch.locator('input').press('Escape')
  await expect(workspaceSearch).toBeHidden()
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store!.getState().activeModal))
    .toBe('none')
  const blankTabCount = await orcaPage.evaluate(
    () =>
      window.__store!.getState().tabsByWorktree[window.__store!.getState().activeWorktreeId!]
        ?.length ?? 0
  )
  await workspaceActions.getByRole('button', { name: 'New blank terminal' }).click({ force: true })
  await expect
    .poll(() =>
      orcaPage.evaluate(
        () =>
          window.__store!.getState().tabsByWorktree[window.__store!.getState().activeWorktreeId!]
            ?.length ?? 0
      )
    )
    .toBe(blankTabCount + 1)

  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.setBackgroundThrottling(false)
    }
  })
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const accounts = ['first', 'second'].map((id) => {
    const managedHomePath = path.join(userData, 'codex-accounts', id, 'home')
    mkdirSync(managedHomePath, { recursive: true })
    writeFileSync(path.join(managedHomePath, '.orca-managed-home'), `${id}\n`)
    writeFileSync(
      path.join(managedHomePath, 'auth.json'),
      JSON.stringify({ OPENAI_API_KEY: 'e2e-placeholder' })
    )
    return {
      id,
      email: `${id}@example.invalid`,
      managedHomePath,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    }
  })
  const workspacePath = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    return Object.values(state.worktreesByRepo)
      .flat()
      .find((w) => w.id === state.activeWorktreeId)!.path
  })
  const resumeId = '019f0000-1111-7222-8333-444444444444'
  const rolloutName = `rollout-2026-10-14T10-00-00-${resumeId}.jsonl`
  const rolloutDir = path.join(accounts[0]!.managedHomePath, 'sessions', '2026', '10', '14')
  mkdirSync(rolloutDir, { recursive: true })
  writeFileSync(
    path.join(rolloutDir, rolloutName),
    [
      {
        type: 'session_meta',
        timestamp: '2026-10-14T10:00:00Z',
        payload: { id: resumeId, cwd: workspacePath }
      },
      {
        type: 'response_item',
        timestamp: '2026-10-14T10:00:01Z',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'text', text: 'Resume workspace chat' }]
        }
      }
    ]
      .map((record) => JSON.stringify(record))
      .join('\n')
      .concat('\n')
  )
  await orcaPage.evaluate(
    async ({ accounts, command, windowsShell }) => {
      await window.__store!.getState().updateSettings({
        theme: 'dark',
        codexManagedAccounts: accounts,
        activeCodexManagedAccountId: 'first',
        activeCodexManagedAccountIdsByRuntime: { host: 'first', wsl: {} },
        agentCmdOverrides: { codex: command },
        terminalWindowsShell: windowsShell,
        ...(navigator.userAgent.includes('Linux') ? { terminalDefaultShell: '/bin/bash' } : {}),
        terminalHiddenViewParking: false
      })
    },
    {
      accounts,
      command: buildFakeAgentCommandOverride(executable),
      windowsShell: FAKE_AGENT_WINDOWS_SHELL
    }
  )
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage)
  await waitForActivePanePtyId(orcaPage)
  await orcaPage.evaluate(() =>
    window.__store!.setState({ fetchInactiveCodexAccountUsage: async () => {} })
  )
  await orcaPage
    .getByRole('button', { name: 'New Codex session', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await expect(orcaPage.locator('[aria-label="Launch account"] button:focus')).toHaveCount(1)
  await expect(orcaPage.getByRole('button', { name: 'Manage accounts' })).not.toBeFocused()
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    window.__store!.setState({ rateLimits: { ...state.rateLimits, codex: null } })
  })
  await expect(
    orcaPage.getByRole('button', { name: 'first@example.invalid', exact: true })
  ).not.toContainText('Sign in again')
  await orcaPage
    .getByRole('button', { name: 'first@example.invalid', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await orcaPage.getByRole('option', { name: 'New session', exact: true }).evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.click()
    }
  })
  await expect
    .poll(() => getTerminalContent(orcaPage))
    .toContain(`ACCOUNT_HOME:${accounts[0]!.managedHomePath}`)
  const firstTabId = await orcaPage.evaluate(() => window.__store!.getState().activeTabId)
  const firstLeafId = await orcaPage.evaluate(
    () =>
      window.__paneManagers!.get(window.__store!.getState().activeTabId!)!.getActivePane()!.leafId
  )
  const firstPtyId = await waitForActivePanePtyId(orcaPage)
  const tabCount = await orcaPage.locator('[data-testid="sortable-tab"]').count()
  const paneCount = await orcaPage.locator('.pane[data-leaf-id]:visible').count()

  await orcaPage
    .getByRole('button', { name: 'New Codex session', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const quotaWindow = {
      usedPercent: 20,
      windowMinutes: 300,
      resetsAt: Date.now() + 3600000,
      resetDescription: null
    }
    window.__store!.setState({
      rateLimits: {
        ...state.rateLimits,
        inactiveCodexAccounts: [
          {
            accountId: 'second',
            updatedAt: Date.now(),
            isFetching: false,
            rateLimits: {
              provider: 'codex',
              status: 'ok',
              error: null,
              updatedAt: Date.now(),
              session: quotaWindow,
              weekly: { ...quotaWindow, usedPercent: 45, windowMinutes: 10080 }
            }
          }
        ]
      }
    })
  })
  await orcaPage
    .getByRole('button', { name: 'second@example.invalid', exact: true })
    .hover({ force: true })
  const preview = orcaPage.getByRole('complementary', { name: 'Account usage preview' })
  await expect(preview.getByText('80% left', { exact: true })).toBeVisible()
  const positions = await orcaPage.evaluate(() => {
    const row = document
      .querySelector('button[aria-label="second@example.invalid"]')!
      .getBoundingClientRect()
    const usage = document
      .querySelector('[aria-label="Account usage preview"]')!
      .getBoundingClientRect()
    return { rowRight: row.right, usageLeft: usage.left }
  })
  expect(positions.usageLeft).toBeGreaterThanOrEqual(positions.rowRight)
  await expect(orcaPage.getByRole('button', { name: 'Open CLI' })).toHaveCount(0)
  await orcaPage.getByRole('button', { name: 'Add account', exact: true }).hover({ force: true })
  const chosenAccount = orcaPage.getByRole('button', {
    name: 'second@example.invalid',
    exact: true
  })
  await expect(chosenAccount).toHaveAttribute('data-current', 'true')
  await expect(chosenAccount).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(chosenAccount).toHaveCSS('box-shadow', 'none')
  await orcaPage.emulateMedia({ reducedMotion: 'reduce' })
  await expect(chosenAccount).toHaveCSS('transition-property', 'none')
  await orcaPage.emulateMedia({ reducedMotion: 'no-preference' })
  await orcaPage
    .getByRole('button', { name: 'second@example.invalid', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await orcaPage
    .getByRole('option')
    .filter({ hasText: 'Resume workspace chat' })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await expect
    .poll(() => getTerminalContent(orcaPage), { timeout: 20_000 })
    .toContain(`ACCOUNT_HOME:${accounts[1]!.managedHomePath}`)
  await expect.poll(() => getTerminalContent(orcaPage)).toContain(resumeId)
  await expect.poll(() => getTerminalContent(orcaPage)).toContain(`"resume","${resumeId}"`)
  expect(
    readFileSync(
      path.join(accounts[1]!.managedHomePath, 'sessions', '2026', '10', '14', rolloutName),
      'utf8'
    )
  ).toContain('Resume workspace chat')
  await expect(
    orcaPage.locator('.deck-pane-identity[title*="second@example.invalid"]')
  ).toBeVisible()
  await expect(
    orcaPage.locator('.deck-pane-identity[title*="second@example.invalid"]')
  ).toContainText('Resume workspace chat')
  const treeDecoration = await orcaPage
    .locator('.deck-sidebar [data-repo-worktree-tree]')
    .evaluateAll((rows) =>
      rows.map((row) => [
        getComputedStyle(row, '::before').content,
        getComputedStyle(row, '::after').content
      ])
    )
  expect(treeDecoration).toEqual([
    ['none', 'none'],
    ['none', 'none']
  ])
  const sidebarCdp = await orcaPage.context().newCDPSession(orcaPage)
  const sidebarScreenshot = await sidebarCdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: false
  })
  writeFileSync(
    path.join(os.tmpdir(), 'orca-tree-toolbar-preview.png'),
    Buffer.from(sidebarScreenshot.data, 'base64')
  )
  await sidebarCdp.detach()
  await expect(orcaPage.getByRole('dialog').filter({ hasText: 'Account switched' })).toHaveCount(0)
  const defaultId = await orcaPage.evaluate(
    () => window.__store!.getState().settings?.activeCodexManagedAccountId
  )
  expect(defaultId).toBe('first')
  await expect(orcaPage.locator('[data-testid="sortable-tab"]')).toHaveCount(tabCount)
  await expect(orcaPage.locator('.pane[data-leaf-id]:visible')).toHaveCount(paneCount + 1)
  expect(await orcaPage.evaluate(() => window.__store!.getState().activeTabId)).toBe(firstTabId)
  const secondPtyId = await waitForActivePanePtyId(orcaPage)
  const secondLeafId = await orcaPage.evaluate(
    () =>
      window.__paneManagers!.get(window.__store!.getState().activeTabId!)!.getActivePane()!.leafId
  )
  const firstTerminal = orcaPage.locator(`[data-leaf-id="${firstLeafId}"] .xterm`)
  const secondTerminal = orcaPage.locator(`[data-leaf-id="${secondLeafId}"] .xterm`)
  await expect(firstTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '14px')
  await expect(secondTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '14px')
  // Hidden Electron suppresses frames; tick the isolated test's animation clock.
  await orcaPage.evaluate(() => {
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 16)
    window.cancelAnimationFrame = (id) => window.clearTimeout(id)
  })
  await secondTerminal.evaluate((element) => {
    element.dispatchEvent(
      new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })
    )
  })
  await expect(secondTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '15px')
  await expect(firstTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '14px')
  await secondTerminal.evaluate((element) => {
    for (let i = 0; i < 10; i++) {
      element.dispatchEvent(
        new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true })
      )
    }
  })
  await expect(secondTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '16px')
  await secondTerminal.locator('.xterm-helper-textarea').evaluate((element) => element.focus())
  // Native focus stays untouched; exercise the shortcut's existing IPC route.
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('terminal:zoom', 'out')
  )
  await expect(secondTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '15px')
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('terminal:zoom', 'in')
  )
  await expect(secondTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '16px')
  await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('terminal:zoom', 'reset')
  )
  await expect(secondTerminal.locator('.xterm-rows')).toHaveCSS('font-size', '14px')
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const tabId = state.activeTabId!
    const leafId = window.__paneManagers!.get(tabId)!.getActivePane()!.leafId
    const paneKey = `${tabId}:${leafId}`
    window.__store!.setState({
      agentActivityDisplayMode: 'full',
      agentStatusByPaneKey: {
        ...state.agentStatusByPaneKey,
        [paneKey]: {
          paneKey,
          tabId,
          worktreeId: state.activeWorktreeId!,
          connectionId: null,
          state: 'working',
          agentType: 'codex',
          prompt: 'Account B test',
          children: [
            {
              id: 'live-child',
              kind: 'agent',
              name: 'default',
              state: 'working',
              membership: 'live',
              observedAt: Date.now(),
              firstObservedAt: Date.now(),
              stoppable: false,
              invocation: { invocationId: 'fixture-invocation', generation: 1 }
            },
            {
              id: 'done-child',
              kind: 'agent',
              description: 'Review complete',
              state: 'done',
              membership: 'settled',
              outcome: 'succeeded',
              observedAt: Date.now(),
              firstObservedAt: Date.now(),
              settledAt: Date.now(),
              stoppable: false,
              invocation: { invocationId: 'fixture-invocation', generation: 1 }
            }
          ],
          stateHistory: [],
          updatedAt: Date.now(),
          stateStartedAt: Date.now()
        }
      },
      agentStatusEpoch: state.agentStatusEpoch + 1
    })
  })
  const badge = orcaPage.getByRole('button', { name: 'Subagents: 1 active, 1 completed' })
  await expect(badge).toBeVisible()
  await expect(orcaPage.locator('.deck-sidebar').getByText('default', { exact: true })).toHaveCount(
    0
  )
  // The hidden compositor keeps stale hit regions; dispatch the real DOM hover event.
  await badge.evaluate((element) =>
    element.dispatchEvent(new PointerEvent('pointerover', { pointerType: 'mouse', bubbles: true }))
  )
  const childDetails = orcaPage.getByRole('region', { name: 'Subagent details' })
  await expect(childDetails).toBeVisible()
  await expect(childDetails.getByText('default', { exact: true })).toBeVisible()
  await expect(childDetails.getByText('Review complete', { exact: true })).toBeHidden()
  await childDetails.getByText('Completed (1)', { exact: true }).evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.click()
    }
  })
  await expect(childDetails.getByText('Review complete', { exact: true })).toBeVisible()
  await badge.evaluate((element) =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  )
  // Hidden compositor does not finish CSS exit animations.
  await childDetails.evaluate((element) => {
    const content = element.closest('[data-slot="popover-content"]')
    if (content) {
      content.dispatchEvent(
        new AnimationEvent('animationend', {
          animationName: getComputedStyle(content).animationName.split(',')[0]!.trim(),
          bubbles: true
        })
      )
    }
  })
  await expect(childDetails).toBeHidden()
  await orcaPage.evaluate(() => window.__store!.setState({ agentActivityDisplayMode: 'compact' }))
  const compactSummary = orcaPage
    .locator('.deck-sidebar')
    .getByRole('button', { name: /^Expand .*agents/ })
  if (await compactSummary.count()) {
    await compactSummary.evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  }
  await expect(badge).toBeVisible()
  await expect(orcaPage.locator('.deck-sidebar').getByText('default', { exact: true })).toHaveCount(
    0
  )
  await orcaPage.evaluate(() => window.__store!.setState({ agentActivityDisplayMode: 'full' }))
  const close = orcaPage
    .locator('.deck-sidebar [data-deck-agent]')
    .filter({ hasText: 'Account B test' })
    .getByRole('button', { name: 'Dismiss agent' })
  await expect(close).toHaveCount(1)
  await close.evaluate((button) => {
    if (button instanceof HTMLElement) {
      button.click()
    }
  })
  await expect(orcaPage.locator('.pane[data-leaf-id]:visible')).toHaveCount(paneCount)
  expect(
    await orcaPage.evaluate(
      (id) => window.api.pty.writeAccepted(id, 'preserved-session-input', 'driving'),
      firstPtyId
    )
  ).toBe(true)
  await expect
    .poll(() =>
      orcaPage.evaluate(
        ({ tabId, leafId }) => {
          const pane = window
            .__paneManagers!.get(tabId!)
            ?.getPanes()
            .find((p) => p.leafId === leafId)
          return pane?.serializeAddon?.serialize() ?? ''
        },
        { tabId: firstTabId, leafId: firstLeafId }
      )
    )
    .toContain('RESTART_INPUT:preserved-session-input')
  expect(secondPtyId).not.toBe(firstPtyId)
  expect(
    await electronApp.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length
    )
  ).toBe(1)

  await orcaPage
    .getByRole('button', { name: 'New Antigravity session', exact: true })
    .evaluate((button) => {
      if (button instanceof HTMLElement) {
        button.click()
      }
    })
  await expect(
    orcaPage.getByRole('button', { name: 'Current agy account', exact: true })
  ).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'second@example.invalid' })).toHaveCount(0)
})

test('quick Claude icon scopes a new CLI to its chosen account', async ({
  electronApp,
  orcaPage
}) => {
  test.skip(
    process.platform === 'darwin',
    'macOS account credentials require the isolated keychain fixture'
  )
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.setBackgroundThrottling(false)
    }
  })
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const accounts = ['claude-first', 'claude-second'].map((id) => {
    const managedAuthPath = path.join(userData, 'claude-accounts', id, 'auth')
    mkdirSync(managedAuthPath, { recursive: true })
    writeFileSync(path.join(managedAuthPath, '.orca-managed-claude-auth'), `${id}\n`)
    writeFileSync(
      path.join(managedAuthPath, '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'e2e-placeholder',
          refreshToken: 'e2e-placeholder',
          expiresAt: Date.now() + 3600000
        }
      })
    )
    writeFileSync(
      path.join(managedAuthPath, 'oauth-account.json'),
      JSON.stringify({ accountUuid: id })
    )
    return {
      id,
      email: `${id}@example.invalid`,
      managedAuthPath,
      authMethod: 'subscription-oauth' as const,
      organizationUuid: null,
      organizationName: null,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    }
  })
  const claudeWorkspacePath = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    return Object.values(state.worktreesByRepo)
      .flat()
      .find((w) => w.id === state.activeWorktreeId)!.path
  })
  const claudeResumeId = '119f0000-1111-7222-8333-444444444444'
  const claudeProject = claudeWorkspacePath.replace(/[^a-zA-Z0-9]/g, '-')
  const claudeTranscriptDir = path.join(accounts[0]!.managedAuthPath, 'projects', claudeProject)
  mkdirSync(claudeTranscriptDir, { recursive: true })
  writeFileSync(
    path.join(claudeTranscriptDir, `${claudeResumeId}.jsonl`),
    JSON.stringify({
      type: 'user',
      uuid: 'message-1',
      sessionId: claudeResumeId,
      cwd: claudeWorkspacePath,
      timestamp: '2026-10-14T10:00:00Z',
      message: { role: 'user', content: 'Resume Claude workspace chat' }
    }).concat('\n')
  )
  await orcaPage.evaluate(
    async ({ accounts, command, windowsShell }) => {
      await window.__store!.getState().updateSettings({
        claudeManagedAccounts: accounts,
        activeClaudeManagedAccountId: accounts[0]!.id,
        activeClaudeManagedAccountIdsByRuntime: { host: accounts[0]!.id, wsl: {} },
        agentCmdOverrides: { claude: command },
        terminalWindowsShell: windowsShell,
        ...(navigator.userAgent.includes('Linux') ? { terminalDefaultShell: '/bin/bash' } : {}),
        terminalHiddenViewParking: false
      })
    },
    {
      accounts,
      command: buildFakeAgentCommandOverride(claudeExecutable),
      windowsShell: FAKE_AGENT_WINDOWS_SHELL
    }
  )
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage)
  await waitForActivePanePtyId(orcaPage)
  await orcaPage.evaluate(() =>
    window.__store!.setState({ fetchInactiveClaudeAccountUsage: async () => {} })
  )
  await orcaPage
    .getByRole('button', { name: 'New Claude session', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    window.__store!.setState({ rateLimits: { ...state.rateLimits, inactiveClaudeAccounts: [] } })
  })
  await expect(
    orcaPage.getByRole('button', { name: 'claude-second@example.invalid', exact: true })
  ).not.toContainText('Sign in again')
  await orcaPage
    .getByRole('button', { name: 'claude-second@example.invalid', exact: true })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await orcaPage
    .getByRole('option')
    .filter({ hasText: 'Resume Claude workspace chat' })
    .evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.click()
      }
    })
  await expect
    .poll(() => getTerminalContent(orcaPage), { timeout: 20000 })
    .toContain(`CLAUDE_ACCOUNT_HOME:${accounts[1]!.managedAuthPath}`)
  await expect.poll(() => getTerminalContent(orcaPage)).toContain(claudeResumeId)
  await expect(
    orcaPage.locator('.deck-pane-identity[title*="claude-second@example.invalid"]')
  ).toBeVisible()
  const claudePtyId = await waitForActivePanePtyId(orcaPage)
  const sendHook = async (payload: Record<string, unknown>) => {
    await orcaPage.evaluate(
      ({ ptyId, text }) => window.api.pty.writeAccepted(ptyId, text, 'driving'),
      { ptyId: claudePtyId, text: `ORCA_TEST_HOOK:${JSON.stringify(payload)}\n` }
    )
  }
  await sendHook({ hook_event_name: 'UserPromptSubmit', prompt: 'api-design, backend-patterns' })
  await sendHook({ hook_event_name: 'Stop', last_assistant_message: 'Finished reviewing the API' })
  const accountHeader = orcaPage.locator(
    '.deck-pane-identity[title*="claude-second@example.invalid"]'
  )
  await expect(accountHeader).toBeVisible()
  await expect(accountHeader.locator('[data-pane-account]')).toHaveCount(0)
  await expect(accountHeader.locator('[data-pane-model]')).toHaveCount(0)
  await expect(accountHeader).toHaveAttribute(
    'title',
    'Claude · claude-second@example.invalid · claude-sonnet-4-6\nResume Claude workspace chat'
  )
  await expect(
    orcaPage.locator('.pane-title-bar').getByText('Finished reviewing the API', { exact: true })
  ).toHaveCount(0)
  const sidebarForWaiting = () =>
    orcaPage.locator('.deck-sidebar [data-deck-agent]').filter({
      has: orcaPage.locator('.deck-agent-icon-slot[title*="claude-sonnet-4-6"]')
    })
  await sendHook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash' })
  await expect(sidebarForWaiting()).toHaveAttribute('data-deck-agent-state', 'waiting')
  await expect(orcaPage.locator('.pane[data-agent-waiting]')).toHaveCount(1)
  await sendHook({ hook_event_name: 'UserPromptSubmit', prompt: 'api-design, backend-patterns' })
  await expect(sidebarForWaiting()).toHaveAttribute('data-deck-agent-state', 'working')
  await expect(orcaPage.locator('.pane[data-agent-waiting]')).toHaveCount(0)
  await sendHook({ hook_event_name: 'PostModelSwitch', to_model: 'claude-opus-4-6' })
  await sendHook({ hook_event_name: 'UserPromptSubmit', prompt: 'Continue reviewing the API' })
  await expect(accountHeader).toHaveAttribute(
    'title',
    'Claude · claude-second@example.invalid · claude-opus-4-6\nResume Claude workspace chat'
  )
  await expect(accountHeader.locator('[data-pane-model]')).toHaveCount(0)
  const sidebarAgent = orcaPage
    .locator('.deck-sidebar [data-deck-agent]')
    .filter({ has: orcaPage.locator('.deck-agent-icon-slot[title*="claude-opus-4-6"]') })
  await expect(sidebarAgent).toHaveAttribute('data-deck-agent-state', 'working')
  await expect(sidebarAgent.locator('[data-agent-spinner]')).toBeVisible()
  await expect(sidebarAgent.locator('[data-deck-agent-model]')).toHaveCount(0)
  const label = sidebarAgent.locator('.deck-agent-heading > span[role="button"]')
  const labelBeforeHover = await label.boundingBox()
  await sidebarAgent.hover({ force: true })
  const labelAfterHover = await label.boundingBox()
  expect(labelAfterHover).toEqual(labelBeforeHover)
  const dismissBounds = await sidebarAgent
    .getByRole('button', { name: 'Dismiss agent' })
    .boundingBox()
  expect(dismissBounds).not.toBeNull()
  expect(labelAfterHover).not.toBeNull()
  expect(dismissBounds!.x).toBeGreaterThanOrEqual(labelAfterHover!.x + labelAfterHover!.width)
  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await expect(accountHeader).toBeVisible()
  await expect(accountHeader.locator('[data-pane-account]')).toHaveCount(0)
  await expect(accountHeader).toHaveAttribute('title', /claude-opus-4-6/)
  await expect(accountHeader.locator('[data-pane-model]')).toHaveCount(0)

  await expect(sidebarAgent.locator('.deck-agent-summary')).toBeHidden()
  await expect(sidebarAgent).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
  await expect(
    sidebarAgent.locator('xpath=ancestor::*[@data-worktree-card-surface][1]')
  ).toHaveAttribute('data-worktree-card-active', 'primary')
  expect(
    readFileSync(
      path.join(accounts[1]!.managedAuthPath, 'projects', claudeProject, `${claudeResumeId}.jsonl`),
      'utf8'
    )
  ).toContain('Resume Claude workspace chat')
  expect(
    await orcaPage.evaluate(() => window.__store!.getState().settings?.activeClaudeManagedAccountId)
  ).toBe('claude-first')
})
