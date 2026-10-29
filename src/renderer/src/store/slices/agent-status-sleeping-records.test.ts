import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { AppState } from '../types'
import { sleepingRecordFromEntry } from './agent-status-sleeping-records'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'
const TAB: TerminalTab = {
  id: 'tab',
  ptyId: null,
  worktreeId: 'wt',
  title: '✳ Model tự động cho 9router',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

function entry(paneKey: string): AgentStatusEntry {
  return {
    state: 'done',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    stateHistory: [],
    agentType: 'claude',
    paneKey,
    providerSession: { key: 'session_id', id: 'session-1' }
  }
}

function state(root: unknown): AppState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the builder reads only the layout map.
  return {
    terminalLayoutsByTabId: { tab: { root, activeLeafId: LEAF_A, expandedLeafId: null } }
  } as unknown as AppState
}

describe('sleepingRecordFromEntry terminal title', () => {
  it("does not record a split tab's focused-pane title as a sibling's own", () => {
    const split = {
      type: 'split',
      direction: 'vertical',
      first: { type: 'leaf', leafId: LEAF_A },
      second: { type: 'leaf', leafId: LEAF_B }
    }
    const record = sleepingRecordFromEntry({
      state: state(split),
      entry: entry(`tab:${LEAF_B}`),
      worktreeId: 'wt',
      tab: TAB,
      capturedAt: 1
    })
    expect(record?.terminalTitle).toBeUndefined()
  })

  it('keeps the tab title for the only pane of a tab', () => {
    const record = sleepingRecordFromEntry({
      state: state({ type: 'leaf', leafId: LEAF_A }),
      entry: entry(`tab:${LEAF_A}`),
      worktreeId: 'wt',
      tab: TAB,
      capturedAt: 1
    })
    expect(record?.terminalTitle).toBe('✳ Model tự động cho 9router')
  })
})
