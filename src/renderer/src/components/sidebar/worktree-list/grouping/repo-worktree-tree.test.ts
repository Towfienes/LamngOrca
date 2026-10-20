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

it('moves the existing lineage subtree together without rewriting its ancestry', () => {
  const nested = row('nested', false, { depth: 1, lineageTrail: [false] })
  const input = [row('feature'), row('main', true, { lineageChildCount: 1 }), nested]
  const output = withRepoWorktreeTree(input)
  expect(output.map((item) => item.type === 'item' && item.worktree.id)).toEqual([
    'main',
    'nested',
    'feature'
  ])
  expect(output[1]).toBe(nested)
  expect(nested.depth).toBe(1)
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
