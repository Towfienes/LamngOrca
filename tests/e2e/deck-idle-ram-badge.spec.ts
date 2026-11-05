import type { Page } from '@stablyai/playwright-test'
import type { MemorySnapshot } from '../../src/shared/process-stats-types'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
})

const MiB = 1024 * 1024

async function injectSnapshot(page: Page, idleSessions: number): Promise<void> {
  await page.evaluate(
    ({ count, mib }) => {
      const now = Date.now()
      const sessions = Array.from({ length: count }, (_, index) => ({
        sessionId: `idle-${index}`,
        paneKey: null,
        pid: 1000 + index,
        cpu: 0,
        memory: 0,
        idle: {
          idleSince: now - (20 + index * 50) * 60_000,
          frozen: index % 2 === 0,
          cgroupMemory: (index % 2 === 0 ? 31 : 410) * mib,
          cgroupSwap: (index % 2 === 0 ? 270 : 0) * mib
        }
      }))
      const emptyUsage = { cpu: 0, memory: 0 }
      const snapshot: MemorySnapshot = {
        app: {
          ...emptyUsage,
          main: emptyUsage,
          renderer: emptyUsage,
          other: emptyUsage,
          history: []
        },
        worktrees: [
          {
            worktreeId: 'e2e-idle',
            worktreeName: 'idle-agent-workspace',
            repoId: 'r',
            repoName: 'r',
            cpu: 0,
            memory: 0,
            sessions,
            history: []
          }
        ],
        host: {
          totalMemory: 0,
          freeMemory: 0,
          availableMemory: 0,
          availableMemorySource: 'free-memory',
          usedMemory: 0,
          memoryUsagePercent: 0,
          cpuCoreCount: 1,
          loadAverage1m: 0
        },
        processMemoryMetric: 'rss',
        totalCpu: 0,
        totalMemory: 0,
        collectedAt: now
      }
      window.__store!.setState({ memorySnapshot: snapshot })
    },
    { count: idleSessions, mib: MiB }
  )
}

test('Deck flat rail keeps OpenCode and idle RAM right-aligned below it', async ({
  orcaPage: page
}, testInfo) => {
  // Exercise the real sidebar at three widths and a session picker without revealing the window.
  test.setTimeout(180_000)
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await page.waitForFunction(() => window.__store?.getState().persistedUIReady)
  const createBar = page.locator('.deck-create-bar')
  await expect(createBar).toBeVisible()
  const badge = createBar.locator('.deck-idle-ram-badge')

  // The mount-time sweep finds no idle service rows, so nothing renders.
  await injectSnapshot(page, 0)
  await expect(badge).toHaveCount(0)

  await injectSnapshot(page, 3)
  await expect(badge).toBeVisible()
  // 31M + 410M + 31M resident across the three idle scopes.
  await expect(badge).toHaveText(/3\s*·\s*472M/)
  await expect(badge).toHaveAttribute('aria-label', '3 idle tabs holding 472M RAM')

  for (const [width, sidebarWidth] of [
    [390, 220],
    [768, 260],
    [1440, 320]
  ] as const) {
    await page.setViewportSize({ width, height: 800 })
    await page.evaluate((value) => window.__store!.getState().setSidebarWidth(value), sidebarWidth)
    await injectSnapshot(page, 3)
    await expect(badge).toBeVisible()
    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.deck-create-bar')!.getBoundingClientRect()
      const pill = document.querySelector('.deck-agent-actions')!.getBoundingClientRect()
      const buttons = [...document.querySelectorAll('.deck-agent-actions button')].map((node) =>
        node.getBoundingClientRect()
      )
      const chip = document.querySelector('.deck-idle-ram-badge')!.getBoundingClientRect()
      return {
        insideBar: chip.left >= bar.left - 0.5 && chip.right <= bar.right + 0.5,
        belowPill: chip.top >= pill.bottom - 0.5,
        buttonsInsidePill: buttons.every(
          (button) => button.left >= pill.left && button.right <= pill.right
        ),
        railBorder: getComputedStyle(document.querySelector('.deck-agent-actions')!).borderTopWidth,
        rightAligned: Math.abs(chip.right - pill.right) < 1,
        noOverlap: buttons.slice(1).every((button, index) => button.left >= buttons[index].right),
        pillInsideBar: pill.right <= bar.right,
        pageScroll: document.documentElement.scrollWidth > window.innerWidth
      }
    })
    expect(geometry, `width ${width}`).toEqual({
      insideBar: true,
      belowPill: true,
      buttonsInsidePill: true,
      railBorder: '0px',
      rightAligned: true,
      noOverlap: true,
      pillInsideBar: true,
      pageScroll: false
    })
    await createBar.screenshot({ path: testInfo.outputPath(`idle-badge-${width}.png`) })
  }

  const openCode = createBar.getByRole('button', { name: 'New OpenCode session', exact: true })
  await openCode.click()
  const history = page.getByLabel('OpenCode session history', { exact: true })
  await expect(history).toBeVisible()
  await expect(history.getByRole('button', { name: 'New session', exact: true })).toBeVisible()
  await expect(page.getByLabel('Launch account', { exact: true })).toHaveCount(0)
  await history.getByRole('button', { name: 'Close sessions', exact: true }).click()
  await expect(history).toBeHidden()

  await badge.focus()
  const tooltip = page.getByRole('tooltip').filter({ hasText: 'idle ·' })
  await expect(tooltip).toContainText('3 idle · 2 frozen')
  await expect(tooltip).toContainText('idle-agent-workspace')
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running')
  )
  await page.screenshot({ path: testInfo.outputPath('idle-badge-tooltip.png') })

  await injectSnapshot(page, 0)
  await expect(badge).toHaveCount(0)
  await createBar.screenshot({ path: testInfo.outputPath('idle-badge-none.png') })
})
