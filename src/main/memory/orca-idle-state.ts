import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { SessionIdleState } from '../../shared/process-stats-types'

// Written by the optional user service ~/.local/bin/orca-tab-memlimit, one row per orca_pty_*.scope.
const STATE_FILE_NAME = path.join('orca-idle', 'state.json')
// The service rewrites the file every minute; an older file means it stopped and its idle view is stale.
const STALE_AFTER_MS = 5 * 60_000

type RawTab = {
  pids?: unknown
  idleSince?: unknown
  frozen?: unknown
  memCurrent?: unknown
  swapCurrent?: unknown
}

function stateFilePath(): string | null {
  const runtimeDir = process.env.XDG_RUNTIME_DIR
  return runtimeDir ? path.join(runtimeDir, STATE_FILE_NAME) : null
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Parses the service file into idle scopes keyed by every PID in each scope. */
export function parseOrcaIdleState(text: string, now: number): Map<number, SessionIdleState> {
  const byPid = new Map<number, SessionIdleState>()
  let parsed: { version?: unknown; updatedAt?: unknown; tabs?: unknown }
  try {
    parsed = JSON.parse(text)
  } catch {
    return byPid
  }
  const updatedAtMs = finiteNumber(parsed?.updatedAt) * 1000
  if (parsed?.version !== 1 || now - updatedAtMs > STALE_AFTER_MS || !Array.isArray(parsed.tabs)) {
    return byPid
  }
  for (const tab of parsed.tabs as RawTab[]) {
    const idleSince = finiteNumber(tab?.idleSince)
    if (!idleSince || !Array.isArray(tab.pids)) {
      continue
    }
    const state: SessionIdleState = {
      idleSince: idleSince * 1000,
      frozen: tab.frozen === true,
      cgroupMemory: finiteNumber(tab.memCurrent),
      cgroupSwap: finiteNumber(tab.swapCurrent)
    }
    for (const pid of tab.pids) {
      if (Number.isInteger(pid) && pid > 0) {
        byPid.set(pid, state)
      }
    }
  }
  return byPid
}

export async function readOrcaIdleState(now = Date.now()): Promise<Map<number, SessionIdleState>> {
  const file = os.platform() === 'linux' ? stateFilePath() : null
  if (!file) {
    return new Map()
  }
  try {
    return parseOrcaIdleState(await readFile(file, 'utf8'), now)
  } catch {
    // Missing file is the normal case when the service is not installed.
    return new Map()
  }
}
