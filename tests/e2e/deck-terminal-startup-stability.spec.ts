import { test, expect } from './helpers/orca-app'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  launchGoldenStubAgentFromNewTab
} from './helpers/golden-stub-agent'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  launchEnv: getGoldenStubAgentLaunchEnv(),
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding'
  ]
})

test('new CLI keeps its pixel grid stationary without animating the workbench', async ({
  orcaPage: page
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await ensureTerminalVisible(page)
  await configureGoldenStubAgent(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // Count every animation started on the surface that holds the xterm canvases, including
  // one that finishes before the first geometry sample.
  await page.evaluate(() => {
    window.__workbenchAnimateCalls = 0
    const original = Element.prototype.animate
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      if (this.closest?.('[data-terminal-workbench-container]')) {
        window.__workbenchAnimateCalls = (window.__workbenchAnimateCalls ?? 0) + 1
      }
      return original.apply(this, args)
    }
  })
  await launchGoldenStubAgentFromNewTab(page)
  const measurement = await page.evaluate(async () => {
    const state = window.__store!.getState()
    const pane = window.__paneManagers!.get(state.activeTabId!)!.getActivePane()!
    const screen = pane.terminal.element!.querySelector('.xterm-screen')!
    const workbench = document.querySelector<HTMLElement>('[data-terminal-workbench-container]')!
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const samples: {
      t: number
      x: number
      y: number
      width: number
      height: number
      cols: number
      rows: number
      animations: number
    }[] = []
    for (const t of [0, 80, 160, 320]) {
      const previous = samples.at(-1)
      if (previous) {
        await wait(t - previous.t)
      }
      const rect = screen.getBoundingClientRect()
      samples.push({
        t,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        cols: pane.terminal.cols,
        rows: pane.terminal.rows,
        animations: workbench.getAnimations().length
      })
    }
    return { samples, workbenchAnimateCalls: window.__workbenchAnimateCalls ?? 0 }
  })
  await testInfo.attach('startup-grid-samples', {
    body: JSON.stringify(measurement),
    contentType: 'application/json'
  })
  const first = measurement.samples[0]!
  for (const sample of measurement.samples) {
    expect(sample.x).toBeCloseTo(first.x, 1)
    expect(sample.y).toBeCloseTo(first.y, 1)
    expect(sample.cols).toBe(first.cols)
    expect(sample.rows).toBe(first.rows)
    expect(sample.animations).toBe(0)
  }
  expect(measurement.workbenchAnimateCalls).toBe(0)
})
