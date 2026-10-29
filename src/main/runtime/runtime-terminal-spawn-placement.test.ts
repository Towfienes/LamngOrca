import { describe, expect, it } from 'vitest'
import { newTabIn } from './runtime-terminal-spawn-placement'

describe('newTabIn', () => {
  it('opens a new tab in the requested group', () => {
    expect(newTabIn({ targetGroupId: 'g1' })).toEqual({
      placement: { kind: 'new-tab' },
      groupId: 'g1'
    })
  })

  it('splits the joined pane for an agent joining the open workspace', () => {
    expect(
      newTabIn({
        targetGroupId: 'g1',
        title: 'Claude',
        agentJoin: { leafId: 'leaf-a', direction: 'vertical' }
      })
    ).toEqual({ placement: { kind: 'split', parentLeafId: 'leaf-a', direction: 'vertical' } })
  })
})
