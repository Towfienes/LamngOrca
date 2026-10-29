import { expect, it } from 'vitest'
import { worktree } from '../../worktree-list-groups-test-fixtures'
import { withRepoWorktreeTree } from './repo-worktree-tree'
import type { Row, WorktreeRow } from './row-types'

function row(id: string, main = false, overrides: Partial<WorktreeRow> = {}): WorktreeRow {
  return {
    type: 'item',
    rowKey: id,
    sectionKey: 'repo:repo-1',
    worktree: { ...worktree, id, isMainWorktree: main },
    repo: undefined,
    depth: 0,
    groupDepth: 0,
    lineageTrail: [],
    isLastLineageChild: false,
    lineageChildCount: 0,
    ...overrides
  }
}

it('anchors visible repo siblings to the main worktree and preserves sibling order', () => {
  const input = [row('feature-a'), row('main', true), row('feature-b')]
  const output = withRepoWorktreeTree(input)
  expect(output.map((item) => item.type === 'item' && [item.worktree.id, item.repoTree])).toEqual([
    ['main', 'root'],
    ['feature-a', 'branch'],
    ['feature-b', 'last']
  ])
  expect(input.map((item) => item.repoTree)).toEqual([undefined, undefined, undefined])
})

it('draws lineage descendants as tree rows without rewriting their ancestry', () => {
  const nested = row('nested', false, { depth: 1, lineageTrail: [false] })
  const grandchild = row('grandchild', false, { depth: 2, lineageTrail: [false, false] })
  const input = [
    row('feature'),
    row('main', true, { lineageChildCount: 1, lineageGroupKey: 'lineage:main' }),
    nested,
    grandchild
  ]
  const output = withRepoWorktreeTree(input)
  const items = output.filter((item): item is WorktreeRow => item.type === 'item')
  expect(items.map((item) => [item.worktree.id, item.repoTree, item.repoTreeLevel])).toEqual([
    ['main', 'root', 0],
    ['nested', 'branch', 1],
    ['grandchild', 'last', 2],
    ['feature', 'last', 1]
  ])
  // Flattened so no lineage pill or nested card is drawn; the input rows keep their lineage data.
  expect(items.every((item) => item.depth === 0 && item.lineageChildCount === 0)).toBe(true)
  expect(items[0].lineageGroupKey).toBeUndefined()
  expect(nested.depth).toBe(1)
  expect(items.map((item) => item.repoTreeHasChildren)).toEqual([true, true, false, false])
  // The main trunk keeps running past the grandchild because `feature` follows it.
  expect(items[2].repoTreeTrail).toEqual([true])
})

it('ends a trunk with the last child so deeper rows do not keep drawing it', () => {
  const input = [
    row('main', true),
    row('child', false, { depth: 1 }),
    row('grandchild', false, { depth: 2 })
  ]
  const items = withRepoWorktreeTree(input).filter(
    (item): item is WorktreeRow => item.type === 'item'
  )
  expect(items.map((item) => item.repoTree)).toEqual(['root', 'last', 'last'])
  expect(items[2].repoTreeTrail).toEqual([false])
})

it('leaves filtered, pinned and single-worktree groups unconnected', () => {
  for (const input of [
    [row('feature')],
    [row('main', true)],
    [row('main', true, { sectionKey: 'pinned' }), row('feature', false, { sectionKey: 'pinned' })]
  ]) {
    expect(withRepoWorktreeTree(input)).toBe(input)
  }
})

it('never draws a connection across hosts or repositories', () => {
  const remote = row('remote', false, {
    worktree: { ...worktree, id: 'remote', hostId: 'ssh:box' }
  })
  const otherRepo = row('other', false, {
    worktree: { ...worktree, id: 'other', repoId: 'repo-2' }
  })
  const input = [row('main', true), remote, otherRepo]
  expect(withRepoWorktreeTree(input)).toBe(input)
})

it('keeps folder and section boundary rows intact', () => {
  const header: Row = { type: 'header', key: 'repo:repo-1', label: 'Repo', count: 2, tone: '' }
  const output = withRepoWorktreeTree([header, row('main', true), row('feature')])
  expect(output[0]).toBe(header)
  expect(output[2]).toMatchObject({ repoTree: 'last' })
})
