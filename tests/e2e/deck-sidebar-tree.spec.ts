import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { runProcess } from '../../src/shared/child-process/run-process'

test.use({
  orcaAppExtraArgs: [
    ...(process.platform === 'linux' ? ['--ozone-platform=headless'] : []),
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
})

test('Deck sidebar hangs secondary worktrees off the main worktree with connector lines', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await waitForSessionReady(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'deck-sidebar-tree-')))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const repoPath = path.join(root, 'Paper')
  mkdirSync(repoPath)
  writeFileSync(path.join(repoPath, 'seed.txt'), 'seed\n')
  for (const args of [
    ['init', '-b', 'main'],
    ['add', '.'],
    ['commit', '-m', 'seed']
  ]) {
    const result = await runProcess({
      program: 'git',
      args: ['-c', 'user.name=T', '-c', 'user.email=t@e.x', '-c', 'commit.gpgsign=false', ...args],
      cwd: repoPath,
      timeoutMs: 10_000
    })
    expect(result.code, result.stderr).toBe(0)
  }

  const repoId = await page.evaluate(async (repoPath) => {
    const store = window.__store!
    await window.api.repos.add({ path: repoPath })
    await store.getState().awaitLocalRepoCatalogSettlement()
    const repo = store.getState().repos.find((entry) => entry.path === repoPath)!
    for (const name of ['lexapplicable-sprint', 'verirule-sprint']) {
      await store.getState().createWorktree(repo.id, name, undefined, 'skip')
    }
    await store.getState().fetchWorktrees(repo.id)
    const state = store.getState()
    state.setGroupBy('repo')
    state.setSidebarWidth(300)
    state.setWorktreeCardProperties(['status', 'unread', 'inline-agents'])
    const main = state.worktreesByRepo[repo.id]!.find((worktree) => worktree.isMainWorktree)!
    const tab = state.createTab(main.id, undefined, undefined, {
      activate: false
    })
    const paneKey = `${tab.id}:leaf-0`
    state.setAgentStatus(
      paneKey,
      {
        agentType: 'claude',
        state: 'done',
        prompt: 'Review',
        lastAssistantMessage: ''
      },
      'claude',
      { updatedAt: Date.now(), stateStartedAt: Date.now() }
    )
    const entry = store.getState().agentStatusByPaneKey[paneKey]!
    store.getState().retainAgents([
      {
        entry,
        worktreeId: main.id,
        tab,
        agentType: 'claude',
        startedAt: Date.now()
      }
    ])
    store.getState().setActiveWorktree(main.id)
    return repo.id
  }, repoPath)

  const project = page.locator(`[data-repo-header-id="${repoId}"]`)
  const rowScope = `[data-worktree-id^="${repoId}::"]`
  await expect(project).toBeVisible()
  await expect(page.locator(`${rowScope}[data-repo-worktree-tree]`)).toHaveCount(3)
  await expect(
    page.locator(`${rowScope}[data-repo-worktree-tree="root"] [data-deck-agent]`)
  ).toHaveCount(1)

  const tree = await page.evaluate(
    ({ repoId, rowScope }) => {
      const center = (element: Element): number => {
        const box = element.getBoundingClientRect()
        return box.left + box.width / 2
      }
      const label = document
        .querySelector(`[data-repo-header-id="${repoId}"] .deck-tree-project-label`)!
        .getBoundingClientRect()
      const rows = ['root', 'branch', 'last'].map((kind) => {
        const row = document.querySelector(`${rowScope}[data-repo-worktree-tree="${kind}"]`)!
        const line = getComputedStyle(row, '::before')
        const elbow = getComputedStyle(row, '::after')
        return {
          rowLeft: row.getBoundingClientRect().left,
          glyph: center(row.querySelector('.deck-branch-glyph svg')!),
          title: row.querySelector('[data-worktree-title-inline-rename]')!.getBoundingClientRect()
            .left,
          lineLeft: Number.parseFloat(line.left),
          lineHeight: Number.parseFloat(line.height),
          elbowWidth: elbow.content === 'none' ? 0 : Number.parseFloat(elbow.width)
        }
      })
      const agentIcon = document
        .querySelector(`${rowScope}[data-repo-worktree-tree="root"] .deck-agent-icon-slot`)!
        .getBoundingClientRect()
      return { labelLeft: label.left, rows, agentIconLeft: agentIcon.left }
    },
    { repoId, rowScope }
  )

  const [main, branch, last] = tree.rows
  // The main worktree's branch glyph sits under the project name, and the line drops from its centre.
  expect(Math.abs(main.glyph - tree.labelLeft)).toBeLessThanOrEqual(1)
  for (const row of tree.rows) {
    expect(Math.abs(row.rowLeft + row.lineLeft - main.glyph)).toBeLessThanOrEqual(1)
    expect(row.lineHeight).toBeGreaterThan(0)
  }
  expect(main.elbowWidth).toBe(0)
  expect(branch.elbowWidth).toBeGreaterThan(0)
  expect(last.elbowWidth).toBeGreaterThan(0)
  // Nested worktrees step right of the line; agents sit clear of it, under the worktree name.
  expect(branch.glyph).toBeGreaterThan(main.glyph + branch.elbowWidth)
  expect(branch.title).toBeGreaterThan(main.title)
  expect(tree.agentIconLeft).toBeGreaterThan(main.glyph + 4)
  expect(tree.agentIconLeft).toBeLessThan(main.title)
  await expect(project.locator('.deck-tree-chevron')).toHaveCount(0)

  // The selection frame holds the active workspace's agents, right of the line, with a left accent bar.
  const frame = page.locator('.deck-workspace-selection-frame')
  await expect(frame).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate((rowScope) => {
        const frame = document.querySelector('.deck-workspace-selection-frame')!
        const agent = document.querySelector(
          `${rowScope}[data-repo-worktree-tree="root"] [data-deck-agent]`
        )!
        return Math.round(agent.getBoundingClientRect().top - frame.getBoundingClientRect().top)
      }, rowScope)
    )
    .toBe(2)
  const selection = await page.evaluate((rowScope) => {
    const frame = document.querySelector('.deck-workspace-selection-frame')!
    const box = frame.getBoundingClientRect()
    const agent = document
      .querySelector(`${rowScope}[data-repo-worktree-tree="root"] [data-deck-agent]`)!
      .getBoundingClientRect()
    const icon = document
      .querySelector(`${rowScope}[data-repo-worktree-tree="root"] .deck-agent-icon-slot`)!
      .getBoundingClientRect()
    const badge = document
      .querySelector(`${rowScope}[data-repo-worktree-tree="root"] .deck-agent-state-slot`)!
      .getBoundingClientRect()
    return {
      left: box.left,
      top: box.top,
      bottom: box.bottom,
      agentTop: agent.top,
      agentBottom: agent.bottom,
      fill: getComputedStyle(frame).backgroundColor,
      border: getComputedStyle(frame).borderTopWidth,
      bar: getComputedStyle(frame, '::before').width,
      badgeOnIconCorner:
        badge.width > 0 &&
        badge.left < icon.left + 2 &&
        badge.right > icon.left &&
        badge.bottom > icon.bottom - 2
    }
  }, rowScope)
  expect(selection.left).toBeGreaterThan(main.glyph + 2)
  expect(selection.left).toBeLessThan(tree.agentIconLeft)
  expect(selection.top).toBeLessThanOrEqual(selection.agentTop)
  expect(selection.bottom).toBeGreaterThanOrEqual(selection.agentBottom)
  expect(selection.fill).not.toBe('rgba(0, 0, 0, 0)')
  expect(selection.border).toBe('0px')
  expect(selection.bar).toBe('2.5px')
  // Settled ("done") agents keep their badge on the logo's lower-left corner.
  expect(selection.badgeOnIconCorner).toBe(true)

  const sidebar = (await page.locator('.deck-sidebar').boundingBox())!
  await page.screenshot({
    path: testInfo.outputPath('deck-sidebar-tree.png'),
    clip: sidebar
  })
})

test('Deck sidebar draws lineage children and grandchildren as tree rows without a child pill', async ({
  orcaPage: page,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await waitForSessionReady(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'deck-sidebar-lineage-')))
  registerPostElectronShutdownCleanup(async () => rmSync(root, { recursive: true, force: true }))
  const repoPath = path.join(root, 'Paper')
  mkdirSync(repoPath)
  writeFileSync(path.join(repoPath, 'seed.txt'), 'seed\n')
  for (const args of [
    ['init', '-b', 'main'],
    ['add', '.'],
    ['commit', '-m', 'seed']
  ]) {
    const result = await runProcess({
      program: 'git',
      args: ['-c', 'user.name=T', '-c', 'user.email=t@e.x', '-c', 'commit.gpgsign=false', ...args],
      cwd: repoPath,
      timeoutMs: 10_000
    })
    expect(result.code, result.stderr).toBe(0)
  }

  const repoId = await page.evaluate(async (repoPath) => {
    const store = window.__store!
    await window.api.repos.add({ path: repoPath })
    await store.getState().awaitLocalRepoCatalogSettlement()
    const repo = store.getState().repos.find((entry) => entry.path === repoPath)!
    for (const name of ['child-a', 'grandchild-a1', 'sibling-b']) {
      await store.getState().createWorktree(repo.id, name, undefined, 'skip')
    }
    await store.getState().fetchWorktrees(repo.id)
    const byName = (name: string) =>
      store.getState().worktreesByRepo[repo.id]!.find((worktree) => worktree.path.endsWith(name))!
    const main = store.getState().worktreesByRepo[repo.id]!.find((w) => w.isMainWorktree)!
    await store.getState().updateWorktreeLineage(byName('child-a').id, {
      parentWorktreeId: main.id
    })
    await store.getState().updateWorktreeLineage(byName('grandchild-a1').id, {
      parentWorktreeId: byName('child-a').id
    })
    const state = store.getState()
    state.setGroupBy('repo')
    state.setSidebarWidth(300)
    state.setWorktreeCardProperties(['status', 'unread', 'inline-agents'])
    state.setActiveWorktree(main.id)
    return repo.id
  }, repoPath)

  const rowScope = `[data-worktree-id^="${repoId}::"]`
  await expect(page.locator(`${rowScope}[data-repo-worktree-tree]`)).toHaveCount(4)
  await expect(page.getByText(/^\d+ child(ren)?$/)).toHaveCount(0)

  const rows = await page.evaluate((rowScope) => {
    const center = (element: Element): number => {
      const box = element.getBoundingClientRect()
      return box.left + box.width / 2
    }
    return Array.from(document.querySelectorAll(`${rowScope}[data-repo-worktree-tree]`)).map(
      (row) => {
        const rowBox = row.getBoundingClientRect()
        const line = getComputedStyle(row, '::before')
        const elbow = getComputedStyle(row, '::after')
        return {
          name: row.querySelector('[data-worktree-title-inline-rename]')!.textContent,
          kind: row.getAttribute('data-repo-worktree-tree'),
          level: Number(row.getAttribute('data-repo-worktree-level')),
          glyph: center(row.querySelector('.deck-branch-glyph svg')!),
          trunk: rowBox.left + Number.parseFloat(line.left),
          elbowEnd: rowBox.left + Number.parseFloat(elbow.left) + Number.parseFloat(elbow.width),
          elbowWidth: elbow.content === 'none' ? 0 : Number.parseFloat(elbow.width),
          lineHeight: Number.parseFloat(line.height),
          title: row.querySelector('[data-worktree-title-inline-rename]')!.getBoundingClientRect()
            .left
        }
      }
    )
  }, rowScope)

  expect(rows.map((row) => [row.name, row.kind, row.level])).toEqual([
    [expect.stringContaining('main'), 'root', 0],
    [expect.stringContaining('child-a'), 'branch', 1],
    [expect.stringContaining('grandchild-a1'), 'last', 2],
    [expect.stringContaining('sibling-b'), 'last', 1]
  ])
  const [main, child, grandchild, sibling] = rows
  // The child's tick hangs off the main trunk; the grandchild's off the child's glyph.
  expect(Math.abs(child.trunk - main.glyph)).toBeLessThanOrEqual(2)
  expect(Math.abs(sibling.trunk - main.glyph)).toBeLessThanOrEqual(2)
  expect(Math.abs(grandchild.trunk - child.glyph)).toBeLessThanOrEqual(2)
  for (const row of [child, grandchild, sibling]) {
    expect(row.elbowWidth).toBeGreaterThan(0)
    expect(row.elbowEnd).toBeLessThanOrEqual(row.glyph)
  }
  // Last children end their trunk at the elbow (the └ form); a middle child keeps it running.
  expect(grandchild.lineHeight).toBeLessThan(child.lineHeight)
  expect(sibling.lineHeight).toBeLessThan(child.lineHeight)
  // The grandchild indents one level further than the child, and the child past the main worktree.
  expect(child.glyph).toBeGreaterThan(main.glyph)
  expect(grandchild.glyph - child.glyph).toBeCloseTo(child.glyph - main.glyph, 0)
  expect(grandchild.title).toBeGreaterThan(child.title)
  // The main trunk keeps running past the child's subtree to reach the last sibling.
  await expect(
    page.locator(`${rowScope}[data-repo-worktree-level="2"] .deck-tree-trunk`)
  ).toHaveCount(1)

  const sidebar = (await page.locator('.deck-sidebar').boundingBox())!
  const shotsDir = process.env.ORCA_DECK_SHOTS_DIR ?? testInfo.outputDir
  mkdirSync(shotsDir, { recursive: true })
  await page.screenshot({ path: path.join(shotsDir, 'sidebar-lineage.png'), clip: sidebar })
})
