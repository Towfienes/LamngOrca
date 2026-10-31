import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { MemorySnapshot, SessionMemory } from '../../../shared/process-stats-types'
import { formatDeckIdleBytes, formatDeckIdleDuration, summarizeDeckIdleRam } from './deck-idle-ram'

const MiB = 1024 * 1024

function session(id: string, paneKey: string | null, idle?: SessionMemory['idle']): SessionMemory {
  return { sessionId: id, paneKey, pid: 1, cpu: 0, memory: 0, ...(idle ? { idle } : {}) }
}

function snapshot(sessions: SessionMemory[]): MemorySnapshot {
  return {
    worktrees: [
      {
        worktreeId: 'wt',
        worktreeName: 'orca-deck',
        repoId: 'r',
        repoName: 'r',
        cpu: 0,
        memory: 0,
        sessions,
        history: []
      }
    ]
  } as unknown as MemorySnapshot
}

describe('summarizeDeckIdleRam', () => {
  it('returns nothing without a snapshot or idle sessions', () => {
    expect(summarizeDeckIdleRam(null, {}).rows).toEqual([])
    expect(summarizeDeckIdleRam(snapshot([session('a', null)]), {}).rows).toEqual([])
  })

  it('sums idle scopes, orders longest idle first and labels from agent status', () => {
    const status = {
      'tab:1': { terminalTitle: 'Fix login' } as AgentStatusEntry,
      'tab:2': { terminalTitle: '', prompt: 'write tests' } as AgentStatusEntry
    }
    const summary = summarizeDeckIdleRam(
      snapshot([
        session('a', 'tab:1', {
          idleSince: 2_000,
          frozen: false,
          cgroupMemory: 300 * MiB,
          cgroupSwap: 0
        }),
        session('b', 'tab:2', {
          idleSince: 1_000,
          frozen: true,
          cgroupMemory: 30 * MiB,
          cgroupSwap: 270 * MiB
        }),
        session('c', null, {
          idleSince: 3_000,
          frozen: false,
          cgroupMemory: 10 * MiB,
          cgroupSwap: 0
        }),
        session('d', 'tab:3')
      ]),
      status
    )
    expect(summary.rows.map((row) => [row.key, row.label])).toEqual([
      ['b', 'write tests'],
      ['a', 'Fix login'],
      ['c', 'orca-deck']
    ])
    expect(summary.memory).toBe(340 * MiB)
    expect(summary.swap).toBe(270 * MiB)
  })
})

describe('deck idle formatting', () => {
  it('formats compact bytes and durations', () => {
    expect(formatDeckIdleBytes(940 * MiB)).toBe('940M')
    expect(formatDeckIdleBytes(1536 * MiB)).toBe('1.5G')
    expect(formatDeckIdleDuration(42 * 60_000)).toBe('42m')
    expect(formatDeckIdleDuration(125 * 60_000)).toBe('2h05')
    expect(formatDeckIdleDuration(-5)).toBe('0m')
  })
})
