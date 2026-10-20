import { createHash } from 'node:crypto'
import type { Conversation } from './account-session-reconciliation'
import { consumeCompleteJsonlLines } from './session-scanner-jsonl-reader'

export async function readCodexConversation(file: string): Promise<Conversation | null> {
  let sessionId = ''
  let firstMessage = ''
  let latestTime = 0
  const history = createHash('sha256')
  const onLine = (line: string): void => {
    if (!line.trim()) {
      return
    }
    const row: unknown = JSON.parse(line)
    if (!row || typeof row !== 'object' || Array.isArray(row) || !('type' in row)) {
      throw new SyntaxError('The transcript contains an invalid record.')
    }
    if (row.type !== 'session_meta' && row.type !== 'response_item' && row.type !== 'compacted') {
      return
    }
    if (
      !('payload' in row) ||
      !row.payload ||
      typeof row.payload !== 'object' ||
      Array.isArray(row.payload)
    ) {
      throw new SyntaxError('The transcript contains an invalid payload.')
    }
    const payload = row.payload
    if (row.type === 'session_meta') {
      if (
        !('id' in payload) ||
        typeof payload.id !== 'string' ||
        !payload.id ||
        (sessionId && sessionId !== payload.id)
      ) {
        throw new SyntaxError('The transcript contains different sessions.')
      }
      sessionId = payload.id
      return
    }
    const time =
      'timestamp' in row && typeof row.timestamp === 'string'
        ? Date.parse(row.timestamp)
        : Number.NaN
    if (!Number.isFinite(time)) {
      throw new SyntaxError('The transcript contains an invalid activity time.')
    }
    const message = JSON.stringify([row.type, payload])
    if (
      !firstMessage &&
      'type' in payload &&
      payload.type === 'message' &&
      'role' in payload &&
      payload.role === 'user'
    ) {
      firstMessage = createHash('sha256').update(message).digest('hex')
    }
    history.update(message).update('\n')
    latestTime = Math.max(latestTime, time)
  }
  try {
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
  return sessionId && firstMessage && latestTime
    ? { sessionId, firstMessage, latestMessage: history.digest('hex'), latestTime }
    : null
}
