import { createHash } from 'node:crypto'
import type { Stats } from 'node:fs'
import { link, lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { copySessionFileWithoutOverwrite } from '../codex/codex-session-backfill-copy'
import { consumeCompleteJsonlLines } from './session-scanner-jsonl-reader'
import { readCodexConversation } from './codex-account-session-reconciliation'

export type Conversation = {
  sessionId: string
  firstMessage: string
  latestMessage: string
  latestTime: number
}

async function readConversation(file: string): Promise<Conversation | null> {
  let sessionId = ''
  let firstMessage = ''
  let latestMessage = ''
  let latestTime = 0
  const onLine = (line: string): void => {
    if (!line.trim()) {
      return
    }
    const row: unknown = JSON.parse(line)
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new SyntaxError('The transcript contains an invalid record.')
    }
    if ('sessionId' in row && typeof row.sessionId === 'string') {
      if (sessionId && sessionId !== row.sessionId) {
        throw new SyntaxError('The transcript contains different sessions.')
      }
      sessionId = row.sessionId
    }
    if (!('type' in row) || (row.type !== 'user' && row.type !== 'assistant')) {
      return
    }
    if (!('uuid' in row) || typeof row.uuid !== 'string' || !('message' in row)) {
      throw new SyntaxError('The transcript contains an invalid message.')
    }
    const message = createHash('sha256')
      .update(JSON.stringify([row.uuid, row.message]))
      .digest('hex')
    firstMessage ||= message
    const time =
      'timestamp' in row && typeof row.timestamp === 'string'
        ? Date.parse(row.timestamp)
        : Number.NaN
    if (time >= latestTime) {
      latestTime = time
      latestMessage = message
    }
  }
  try {
    // JSON strings can contain U+2028/U+2029; only a physical newline ends a JSONL record.
    const read = await consumeCompleteJsonlLines({ path: file, start: 0, onLine })
    if (read.skippedRecords.length > 0) {
      return null
    }
    if (read.trailingPartialLine) {
      onLine(read.trailingPartialLine)
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null
    }
    throw error
  }
  return sessionId && firstMessage && latestMessage
    ? { sessionId, firstMessage, latestMessage, latestTime }
    : null
}

function sameFileVersion(before: Stats, after: Stats): boolean {
  return (
    after.isFile() &&
    !after.isSymbolicLink() &&
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs
  )
}

export async function reconcileAccountSession(
  source: string,
  target: string,
  backupRoot: string,
  expectedSessionId?: string,
  agent: 'claude' | 'codex' = 'claude'
): Promise<boolean> {
  const sourceStat = await lstat(source)
  const targetStat = await lstat(target)
  if (
    !sourceStat.isFile() ||
    sourceStat.isSymbolicLink() ||
    !targetStat.isFile() ||
    targetStat.isSymbolicLink()
  ) {
    return false
  }
  const read = agent === 'codex' ? readCodexConversation : readConversation
  const selected = await read(source)
  const existing = await read(target)
  if (
    !selected ||
    !existing ||
    selected.sessionId !== existing.sessionId ||
    (expectedSessionId && selected.sessionId !== expectedSessionId) ||
    selected.firstMessage !== existing.firstMessage
  ) {
    return false
  }
  if (
    !sameFileVersion(sourceStat, await lstat(source)) ||
    !sameFileVersion(targetStat, await lstat(target))
  ) {
    throw new Error('The session changed while switching accounts. Please try again.')
  }
  if (existing.latestTime > selected.latestTime) {
    return true
  }
  if (existing.latestTime === selected.latestTime) {
    return existing.latestMessage === selected.latestMessage
  }

  // Keep old branches outside scanned history so backups are not listed as sessions.
  await mkdir(backupRoot, { recursive: true })
  if ((await realpath(backupRoot)) !== resolve(backupRoot)) {
    throw new Error('The session backup directory is redirected.')
  }
  const backupDirectory = await mkdtemp(join(backupRoot, 'resume-'))
  const backup = join(backupDirectory, basename(target))
  const staged = join(backupDirectory, 'latest.tmp')
  let archived = false
  try {
    await copySessionFileWithoutOverwrite(source, staged)
    if (
      !sameFileVersion(sourceStat, await lstat(source)) ||
      !sameFileVersion(targetStat, await lstat(target))
    ) {
      throw new Error('The session changed while switching accounts. Please try again.')
    }
    await rename(target, backup)
    archived = true
    if (!sameFileVersion(targetStat, await lstat(backup))) {
      throw new Error('The session changed while switching accounts. Please try again.')
    }
    await link(staged, target)
  } catch (error) {
    if (archived) {
      try {
        await link(backup, target)
      } catch (restoreError) {
        throw new Error(
          `Could not finish switching accounts. The previous history is saved at ${backup}.`,
          {
            cause: restoreError
          }
        )
      }
    }
    throw error
  } finally {
    await rm(staged, { force: true })
    if (!archived) {
      await rm(backupDirectory, { recursive: true, force: true })
    }
  }
  return true
}
