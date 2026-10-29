import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Claude9Model, Claude9ModelList } from '../../shared/claude9-models'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import { parseClaudeSessionFile } from '../ai-vault/session-scanner-primary-parsers'

const CACHE_MS = 5 * 60_000
let cached: Claude9ModelList | null = null
let inflight: Promise<Claude9ModelList> | null = null

function claude9Binary(): string {
  // Why: a GUI-launched Electron main may not have ~/.local/bin on PATH.
  const local = join(homedir(), '.local', 'bin', 'claude9')
  return existsSync(local) ? local : 'claude9'
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
  return new Promise((resolve) => {
    execFile(
      claude9Binary(),
      ['--list', '--json'],
      { timeout: 25_000, maxBuffer: 4 * 1024 * 1024 },
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

const SESSION_LIMIT = 300

/** claude9 keeps Claude-format transcripts in its own config dir, outside Orca's Claude roots. */
export function claude9ProjectsDir(): string {
  return join(homedir(), '.claude-9router', 'projects')
}

/**
 * Newest claude9 sessions, parsed with the AI vault's Claude transcript parser.
 * Why: Orca's history scan only covers its managed Claude config dirs, so claude9
 * sessions are listed here and resumed with `claude9 --resume` rather than `claude`.
 */
export async function listClaude9Sessions(root = claude9ProjectsDir()): Promise<AiVaultSession[]> {
  const projects = await readdir(root, { withFileTypes: true }).catch(() => [])
  const files: { path: string; mtimeMs: number; modifiedAt: string }[] = []
  for (const project of projects) {
    if (!project.isDirectory()) {
      continue
    }
    const dir = join(root, project.name)
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
        continue
      }
      const path = join(dir, entry.name)
      const info = await stat(path).catch(() => null)
      if (info) {
        files.push({ path, mtimeMs: info.mtimeMs, modifiedAt: info.mtime.toISOString() })
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const sessions: AiVaultSession[] = []
  for (const file of files.slice(0, SESSION_LIMIT)) {
    const session = await parseClaudeSessionFile(file).catch(() => null)
    if (session && !session.subagent && !session.isSubagent) {
      sessions.push({ ...session, resumeCommand: `claude9 --resume ${session.sessionId}` })
    }
  }
  return sessions
}

export function registerClaude9Handlers(): void {
  ipcMain.handle('claude9:sessions', () => listClaude9Sessions())
  ipcMain.handle('claude9:list', (_event, args?: { force?: boolean }) =>
    listClaude9Models(Boolean(args?.force))
  )
}
