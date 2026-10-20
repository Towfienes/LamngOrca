import { expect, it } from 'vitest'
import { appendSavedSessionRows } from './worktree-saved-session-rows'
import { makeTab } from '@/store/slices/store-test-helpers'
import type { SleepingAgentSessionRecord } from '../../../../shared/agent-session-resume'
const leaf = '11111111-1111-4111-8111-111111111111'
const paneKey = `tab:${leaf}`
const record: SleepingAgentSessionRecord = {
  paneKey,
  worktreeId: 'wt',
  agent: 'claude',
  providerSession: { key: 'session_id', id: 'saved' },
  prompt: 'Yesterday review',
  model: 'claude-sonnet-4-6',
  reasoningEffort: 'high',
  state: 'working',
  capturedAt: 1,
  updatedAt: 1
}
const tabs = [makeTab({ id: 'tab', worktreeId: 'wt' })]
const layouts = {
  tab: { root: { type: 'leaf' as const, leafId: leaf }, activeLeafId: leaf, expandedLeafId: null }
}
it('lists a saved pane before workspace activation without claiming it is running', () => {
  const rows = appendSavedSessionRows([], [record], tabs, layouts, new Set())
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    paneKey,
    state: 'idle',
    entry: {
      prompt: 'Yesterday review',
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
      restoredUnconfirmed: true
    }
  })
  expect(appendSavedSessionRows(rows, [record], tabs, layouts, new Set())).toBe(rows)
})
it('does not revive closed panes or a CLI confirmed to have exited', () => {
  expect(appendSavedSessionRows([], [record], tabs, {}, new Set())).toEqual([])
  expect(appendSavedSessionRows([], [record], tabs, layouts, new Set([paneKey]))).toEqual([])
})

it('fills missing model metadata only for the same provider session', () => {
  const rows = appendSavedSessionRows([], [record], tabs, layouts, new Set())
  const missing = rows.map((row) => ({ ...row, entry: { ...row.entry, model: undefined } }))
  expect(appendSavedSessionRows(missing, [record], tabs, layouts, new Set())[0].entry.model).toBe(
    record.model
  )
  const replacement = missing.map((row) => ({
    ...row,
    entry: { ...row.entry, providerSession: { key: 'session_id' as const, id: 'new-session' } }
  }))
  expect(appendSavedSessionRows(replacement, [record], tabs, layouts, new Set())).toBe(replacement)
  expect(appendSavedSessionRows(missing, [record], tabs, layouts, new Set([paneKey]))).toBe(missing)
})
it('retains the last observed model for an idle title projection only on its original PTY', () => {
  const rows = appendSavedSessionRows([], [record], tabs, layouts, new Set())
  const projected = rows.map((row) => ({
    ...row,
    entry: {
      ...row.entry,
      model: undefined,
      providerSession: undefined,
      observation: {
        origin: 'title' as const,
        authorityId: 'renderer-title-projection',
        incarnation: 0,
        revision: 1,
        observedAt: 1,
        kind: 'snapshot' as const
      }
    }
  }))
  const ptyLayouts = { tab: { ...layouts.tab, ptyIdsByLeafId: { [leaf]: 'pty-original' } } }
  expect(
    appendSavedSessionRows(
      projected,
      [{ ...record, ptyId: 'pty-original' }],
      tabs,
      ptyLayouts,
      new Set()
    )[0].entry.model
  ).toBe(record.model)
  expect(
    appendSavedSessionRows(
      projected,
      [{ ...record, ptyId: 'pty-replaced' }],
      tabs,
      ptyLayouts,
      new Set()
    )
  ).toBe(projected)
})
