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
      const snapshot = {
        app: { cpu: 0, memory: 0, main: {}, renderer: {}, other: {}, history: [] },
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
        host: {},
        processMemoryMetric: 'rss',
        totalCpu: 0,
        totalMemory: 0,
        collectedAt: now
      } as unknown as MemorySnapshot
      window.__store!.setState({ memorySnapshot: snapshot })
    },
    { count: idleSessions, mib: MiB }
  )
}

test('Deck dock shows a quiet idle-RAM badge beside New agent', async ({
  orcaPage: page
}, testInfo) => {
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

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 })
    await injectSnapshot(page, 3)
    await expect(badge).toBeVisible()
    const geometry = await page.evaluate(() => {
      const bar = document.querySelector('.deck-create-bar')!.getBoundingClientRect()
      const plus = document
        .querySelector('.deck-create-bar [aria-label="New agent"]')!
        .getBoundingClientRect()
      const chip = document.querySelector('.deck-idle-ram-badge')!.getBoundingClientRect()
      return {
        insideBar: chip.left >= bar.left - 0.5 && chip.right <= bar.right + 0.5,
        afterPlus: chip.left >= plus.right - 0.5,
        sameRow: Math.abs(chip.top + chip.height / 2 - (plus.top + plus.height / 2)) <= 2,
        pageScroll: document.documentElement.scrollWidth > window.innerWidth
      }
    })
    expect(geometry, `width ${width}`).toEqual({
      insideBar: true,
      afterPlus: true,
      sameRow: true,
      pageScroll: false
    })
    await createBar.screenshot({ path: testInfo.outputPath(`idle-badge-${width}.png`) })
  }

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
