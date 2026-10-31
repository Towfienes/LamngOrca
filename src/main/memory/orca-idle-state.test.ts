import { describe, expect, it } from 'vitest'
import { parseOrcaIdleState } from './orca-idle-state'

const NOW = 1_800_000_000_000

function stateText(overrides: Record<string, unknown> = {}, tabs: unknown[] = []): string {
  return JSON.stringify({ version: 1, updatedAt: NOW / 1000 - 30, tabs, ...overrides })
}

describe('parseOrcaIdleState', () => {
  it('keys idle scopes by every pid and converts seconds to ms', () => {
    const tab = {
      scope: 'orca_pty_x_1.scope',
      pids: [10, 11],
      idleSince: NOW / 1000 - 900,
      frozen: true,
      memCurrent: 32 << 20,
      swapCurrent: 270 << 20
    }
    const byPid = parseOrcaIdleState(stateText({}, [tab]), NOW)
    const expected = {
      idleSince: NOW - 900_000,
      frozen: true,
      cgroupMemory: 32 << 20,
      cgroupSwap: 270 << 20
    }
    expect(byPid.get(10)).toEqual(expected)
    expect(byPid.get(11)).toEqual(expected)
  })

  it('skips active scopes and malformed pids', () => {
    const byPid = parseOrcaIdleState(
      stateText({}, [
        { pids: [20], idleSince: null, frozen: false },
        { pids: [-1, 1.5, 'x', 21], idleSince: NOW / 1000 - 60 }
      ]),
      NOW
    )
    expect([...byPid.keys()]).toEqual([21])
    expect(byPid.get(21)?.frozen).toBe(false)
  })

  it('ignores a stale file from a stopped service', () => {
    const tab = { pids: [30], idleSince: NOW / 1000 - 60 }
    expect(parseOrcaIdleState(stateText({ updatedAt: NOW / 1000 - 600 }, [tab]), NOW).size).toBe(0)
  })

  it('ignores unknown versions and invalid JSON', () => {
    const tab = { pids: [40], idleSince: NOW / 1000 - 60 }
    expect(parseOrcaIdleState(stateText({ version: 2 }, [tab]), NOW).size).toBe(0)
    expect(parseOrcaIdleState('{not json', NOW).size).toBe(0)
  })
})
