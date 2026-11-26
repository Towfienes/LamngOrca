import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { AiVaultSession } from '../../shared/ai-vault/contracts/ai-vault-types'
import { parseClaudeSessionFile } from '../ai-vault/scanners/claude/session-scanner-primary-parsers'

const SESSION_LIMIT = 300

/**
 * Newest sessions from a Claude-format profile directory (claude9, DeepRelay), parsed with
 * the AI vault's Claude transcript parser. The caller supplies the command that can resume them.
 */
export async function listClaudeProfileSessions(
  root: string,
  resumeCommand: (sessionId: string) => string
): Promise<AiVaultSession[]> {
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
      sessions.push({ ...session, resumeCommand: resumeCommand(session.sessionId) })
    }
  }
  return sessions
}
