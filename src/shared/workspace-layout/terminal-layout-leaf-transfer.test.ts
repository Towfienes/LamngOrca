import { expect, it } from 'vitest'
import { transferTerminalLayoutLeaf } from './terminal-layout-leaf-transfer'
import type { TerminalLayoutSnapshot } from './terminal-tab-types'

it('merges only the moved leaf records and tolerates an owner frame arriving before its reply', () => {
  const source: TerminalLayoutSnapshot = {
    root: {
      type: 'split',
      direction: 'vertical',
      ratio: 0.5,
      first: { type: 'leaf', leafId: 'moved' },
      second: { type: 'leaf', leafId: 'sibling' }
    },
    activeLeafId: 'moved',
    expandedLeafId: null,
    ptyIdsByLeafId: { moved: 'live-pty', sibling: 'sibling-pty' },
    buffersByLeafId: { moved: 'scrollback', sibling: 'private sibling buffer' },
    lastGridsByLeafId: { moved: { cols: 80, rows: 24 }, sibling: { cols: 90, rows: 30 } }
  }
  const target: TerminalLayoutSnapshot = {
    root: { type: 'leaf', leafId: 'target' },
    activeLeafId: 'target',
    expandedLeafId: null,
    ptyIdsByLeafId: { target: 'target-pty' },
    buffersByLeafId: { target: 'target scrollback' }
  }
  const before = structuredClone(source)
  const merged = transferTerminalLayoutLeaf(source, target, 'moved', 'live-pty')
  expect(merged.ptyIdsByLeafId).toEqual({ target: 'target-pty', moved: 'live-pty' })
  expect(merged.buffersByLeafId).toEqual({ target: 'target scrollback', moved: 'scrollback' })
  expect(merged.lastGridsByLeafId).toEqual({ moved: { cols: 80, rows: 24 } })
  expect(source).toEqual(before)
  expect(transferTerminalLayoutLeaf(source, merged, 'moved', 'live-pty')).toEqual(merged)
  expect(() => transferTerminalLayoutLeaf(source, target, 'gone', null)).toThrow('pane_not_found')
})
