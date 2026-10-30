import { existsSync, readFileSync } from 'node:fs'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { TEST_REPO_PATH_FILE } from './global-setup'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  splitActiveTerminalPane,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'

test('restores both tabs, split panes and working terminal input', async (// oxlint-disable-next-line no-empty-pattern -- This test owns both Electron launches.
{}, testInfo) => {
  const repoPath = readFileSync(TEST_REPO_PATH_FILE, 'utf8').trim()
  expect(existsSync(repoPath)).toBe(true)
  const session = createRestartSession(testInfo)
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null
  try {
    const first = await session.launch()
    firstApp = first.app
    await first.page.setViewportSize({ width: 1400, height: 900 })
    await waitForSessionReady(first.page)
    const worktreeId = await attachRepoAndOpenTerminal(first.page, repoPath)
    await ensureTerminalVisible(first.page)
    await waitForActiveTerminalManager(first.page)
    await waitForActivePanePtyId(first.page)
    await first.page.evaluate((worktreeId) => {
      const state = window.__store!.getState()
      const tab = state.createTab(worktreeId)
      state.setActiveTab(tab.id)
      state.setActiveTabType('terminal', worktreeId)
    }, worktreeId)
    await ensureTerminalVisible(first.page)
    await waitForActiveTerminalManager(first.page)
    await waitForActivePanePtyId(first.page)
    await splitActiveTerminalPane(first.page, 'horizontal')
    const ptyId = await waitForActivePanePtyId(first.page)
    const marker = `DECK_RESTORE_${Date.now()}`
    await execInTerminal(first.page, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(first.page, marker)
    const tabsBefore = await first.page.locator('.deck-tab-dot:not([data-empty]):visible').count()
    expect(tabsBefore).toBe(2)
    await expect(first.page.locator('.pane[data-leaf-id]:visible')).toHaveCount(2)

    await session.close(firstApp)
    firstApp = null
    const second = await session.launch()
    secondApp = second.app
    await second.page.setViewportSize({ width: 1400, height: 900 })
    await waitForSessionReady(second.page)
    await expect(second.page.locator('.deck-tab-dot:not([data-empty]):visible')).toHaveCount(
      tabsBefore
    )
    await expect(second.page.locator('.pane[data-leaf-id]:visible')).toHaveCount(2)
    // Upstream v1.4.244 restores the tab's first pane as active after a split, so look in every pane.
    await expect
      .poll(
        () =>
          second.page.evaluate((marker) => {
            const state = window.__store!.getState()
            const panes = window.__paneManagers?.get(state.activeTabId!)?.getPanes() ?? []
            return panes.some(({ terminal }) => {
              const buffer = terminal.buffer.active
              return Array.from(
                { length: buffer.length },
                (_, i) => buffer.getLine(i)?.translateToString(true) ?? ''
              )
                .join('')
                .includes(marker)
            })
          }, marker),
        { timeout: 15_000, message: `No restored pane contained ${marker}` }
      )
      .toBe(true)
    await second.page.evaluate(() => {
      const state = window.__store!.getState()
      const manager = window.__paneManagers?.get(state.activeTabId!)
      const pane = manager?.getActivePane()
      if (!pane) {
        throw new Error('Restored active pane is missing')
      }
      pane.container.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus()
    })
    const inputPrefix = `DECK_INPUT_${Date.now()}`
    const inputMarker = `${inputPrefix}_CONFIRMED`
    await second.page.keyboard.type(`echo ${inputPrefix}'_CONFIRMED'`)
    await second.page.keyboard.press('Enter')
    await waitForTerminalOutput(second.page, inputMarker)
  } finally {
    for (const app of [secondApp, firstApp]) {
      if (app) {
        await session.close(app)
      }
    }
    await session.dispose()
  }
})
