import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, win32 } from 'node:path'
import type { Claude9Model, Claude9ModelList } from '../../shared/claude9-models'
import type { AiVaultSession } from '../../shared/ai-vault/contracts/ai-vault-types'
import { listClaudeProfileSessions } from './claude-profile-sessions'

const CACHE_MS = 5 * 60_000
let cached: Claude9ModelList | null = null
let inflight: Promise<Claude9ModelList> | null = null

/**
 * How Orca runs `claude9 --list --json`. Why: a GUI-launched Electron main may not have
 * ~/.local/bin on PATH, and on Windows claude9 is a .cmd shim that only cmd.exe can run.
 */
export function claude9ListInvocation(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync
): { file: string; args: string[]; shell: boolean } {
  const args = ['--list', '--json']
  if (platform === 'win32') {
    const shim = win32.join(home, '.local', 'bin', 'claude9.cmd')
    return { file: exists(shim) ? `"${shim}"` : 'claude9', args, shell: true }
  }
  const local = join(home, '.local', 'bin', 'claude9')
  return { file: exists(local) ? local : 'claude9', args, shell: false }
}

export function parseClaude9List(stdout: string, now: number): Claude9ModelList {
  const parsed = JSON.parse(stdout) as { default?: unknown; models?: unknown }
  if (!Array.isArray(parsed.models)) {
    return {
      available: false,
      reason: 'claude9 returned no model list',
      fetchedAt: now
    }
  }
  const models = parsed.models.filter(
    (m): m is Claude9Model =>
      typeof m === 'object' && m !== null && typeof (m as Claude9Model).id === 'string'
  )
  return {
    available: true,
    defaultId: typeof parsed.default === 'string' ? parsed.default : '',
    models,
    fetchedAt: now
  }
}

function runList(): Promise<Claude9ModelList> {
  const invocation = claude9ListInvocation()
  return new Promise((resolve) => {
    execFile(
      invocation.file,
      invocation.args,
      {
        timeout: 25_000,
        maxBuffer: 4 * 1024 * 1024,
        shell: invocation.shell,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        const now = Date.now()
        if (error) {
          const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
          resolve({
            available: false,
            reason: missing
              ? 'claude9 is not installed'
              : stderr.trim().split('\n').pop() || 'Gateway offline',
            fetchedAt: now
          })
          return
        }
        try {
          resolve(parseClaude9List(stdout, now))
        } catch {
          resolve({
            available: false,
            reason: 'claude9 returned unreadable output',
            fetchedAt: now
          })
        }
      }
    )
  })
}

export function listClaude9Models(force = false): Promise<Claude9ModelList> {
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return Promise.resolve(cached)
  }
  inflight ??= runList().then((result) => {
    cached = result
    inflight = null
    return result
  })
  return inflight
}

/** claude9 keeps Claude-format transcripts in its own config dir, outside Orca's Claude roots. */
export function claude9ProjectsDir(): string {
  return join(homedir(), '.claude-9router', 'projects')
}

/**
 * Newest claude9 sessions. Why: Orca's history scan only covers its managed Claude config
 * dirs, so claude9 sessions are listed here and resumed with `claude9`, never plain `claude`.
 */
export function listClaude9Sessions(root = claude9ProjectsDir()): Promise<AiVaultSession[]> {
  return listClaudeProfileSessions(root, (sessionId) => `claude9 --resume ${sessionId}`)
}

export function registerClaude9Handlers(): void {
  ipcMain.handle('claude9:sessions', () => listClaude9Sessions())
  ipcMain.handle('claude9:list', (_event, args?: { force?: boolean }) =>
    listClaude9Models(Boolean(args?.force))
  )
}
