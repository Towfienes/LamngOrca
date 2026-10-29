import { zstdDecompressSync } from 'node:zlib'
import { openTranscriptReadStream } from '../native-chat/wsl-transcript-fs-access'
import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { ExecutionHostId } from '../../shared/execution-host'
import type { FileWithMtime, SessionAccumulator } from './session-scanner-types'
import type { TranscriptMessageSink } from './session-transcript-consumers'
import {
  addPreviewContent,
  addPreviewMessage,
  createAccumulator,
  finalizeSession,
  updateTimeline
} from './session-scanner-accumulator'
import { dshSessionIdFromLogPath } from './session-scanner-dsh-paths'
import { asRecord } from './session-scanner-record-value'
import { extractString, parseJsonObject } from './session-scanner-values'
import { numberValue } from './session-scanner-token-values'

/**
 * DeepSeek Harness (dsh-tui) persistence:
 *
 *   <sessionRoot>/<workspace-key>/<sessionId>/session.vN.jsonl[.zstd]
 *
 * The log is a JSONL event stream whose first row is the session header
 * (`{type:'session', id, createdAt, cwd}`). Rows that matter here: `user/message`,
 * `assistant/message`, `session/title`, and `request/*` for the model route.
 *
 * Why `source.kind` decides what a user row is: dsh injects approval notices,
 * instruction files, runtime snapshots, the skill catalog and time context as
 * user rows. Counting those would make every session look busier than it was and
 * put a system reminder in the preview instead of the ask.
 */
const REAL_USER_MESSAGE_SOURCE = 'user'

type DshParserOptions = {
  executionHostId?: ExecutionHostId
  executionHostPlatform?: NodeJS.Platform | null
}

/** One committed zstd frame: the decompressed bytes of a single frame slice. */
export type ZstdFrameDecode = (slice: Buffer) => Buffer

/** Zstd frame magic, little-endian (`0xFD2FB528`). */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

export function decodeDshSessionLogBytes(filePath: string, bytes: Buffer): string {
  if (!filePath.toLowerCase().endsWith('.zstd')) {
    return bytes.toString('utf8')
  }
  if (typeof zstdDecompressSync !== 'function') {
    throw new Error('This runtime cannot decompress DeepSeek Harness session logs.')
  }
  return decompressZstdFrames(bytes, (slice) => zstdDecompressSync(slice)).toString('utf8')
}

/**
 * Why a frame loop: dsh appends one zstd frame per write, and the decoder that
 * ships with Electron (Node 24) stops after the first frame — a 638-frame log
 * decoded to its header alone, while Node 26 decodes every frame in one call.
 * Slicing at frame magics makes each call decode exactly one frame on both.
 *
 * A half-written trailing frame is normal for a session that is still running:
 * the committed frames before it are kept, and only a file with nothing decodable
 * throws.
 */
export function decompressZstdFrames(bytes: Buffer, decodeFrame: ZstdFrameDecode): Buffer {
  const starts = frameOffsets(bytes)
  if (starts.length === 0) {
    return bytes.length === 0 ? Buffer.alloc(0) : decodeFrame(bytes)
  }
  const chunks: Buffer[] = []
  let start = starts[0]
  for (let index = 0; index < starts.length; index++) {
    const end = index + 1 < starts.length ? starts[index + 1] : bytes.length
    try {
      chunks.push(decodeFrame(bytes.subarray(start, end)))
      start = end
    } catch (error) {
      // A magic that occurs *inside* a compressed frame is not a boundary: fold
      // that segment into the next slice instead of losing the session.
      if (index + 1 < starts.length) {
        continue
      }
      if (chunks.length === 0) {
        throw error
      }
      break
    }
  }
  return Buffer.concat(chunks)
}

function frameOffsets(bytes: Buffer): number[] {
  const offsets: number[] = []
  let index = bytes.indexOf(ZSTD_MAGIC, 0)
  while (index !== -1) {
    offsets.push(index)
    index = bytes.indexOf(ZSTD_MAGIC, index + ZSTD_MAGIC.length)
  }
  return offsets
}

export function parseDshSessionContent(
  file: FileWithMtime,
  content: string,
  platform: NodeJS.Platform = process.platform,
  options: DshParserOptions = {},
  messages?: TranscriptMessageSink
): AiVaultSession | null {
  const accumulator = createAccumulator({
    agent: 'dsh',
    file,
    sessionId: dshSessionIdFromLogPath(file.path),
    messages
  })
  const isSubagent = foldDshLog(accumulator, content)
  const session = finalizeSession(accumulator, platform, options)
  return session ? { ...session, isSubagent } : null
}

export async function parseDshSessionFile(
  file: FileWithMtime,
  platform: NodeJS.Platform = process.platform,
  messages?: TranscriptMessageSink
): Promise<AiVaultSession | null> {
  return parseDshSessionContent(
    file,
    decodeDshSessionLogBytes(file.path, await readSessionLogBytes(file.path)),
    platform,
    {},
    messages
  )
}

/**
 * dsh-tui's session-list projection (`$DSH_HOME/storages/session_projcache`).
 *
 * Why the scanner reads it at all: it is the only plain-text copy of cwd, title
 * and last-prompt time, so a host that can serve text but not the compressed log
 * (SSH) still lists its sessions. The projection carries no turn count, so the
 * first prompt is published as the row's resumable-content signal.
 */
export function parseDshProjcacheContent(
  file: FileWithMtime,
  content: string,
  platform: NodeJS.Platform = process.platform,
  options: DshParserOptions = {},
  messages?: TranscriptMessageSink
): AiVaultSession | null {
  const record = asRecord(parseJsonObject(content)?.record)
  if (!record) {
    return null
  }
  const identity = asRecord(record.identity)
  const rows = asRecord(record.rows)
  const accumulator = createAccumulator({
    agent: 'dsh',
    file,
    sessionId: dshSessionIdFromLogPath(file.path),
    messages
  })
  accumulator.cwd =
    extractString(identity?.cwd) ?? extractString(asRecord(rows?.workingDirectory)?.val)
  updateTimeline(accumulator, identity?.createdAt)
  const title = extractString(asRecord(rows?.title)?.val)
  if (title) {
    accumulator.title = title
  }
  const firstPrompt = extractString(
    asRecord(asRecord(asRecord(rows?.titleInput)?.val)?.first)?.text
  )
  const lastPromptAt = asRecord(asRecord(rows?.sessionListMetadata)?.val)?.lastPromptAt
  updateTimeline(accumulator, lastPromptAt)
  if (firstPrompt) {
    addPreviewMessage(accumulator, {
      role: 'user',
      text: firstPrompt,
      timestamp: lastPromptAt,
      seedFirstUserPrompt: true
    })
  }
  accumulator.totalTokens = dshTokenTotal(
    asRecord(asRecord(asRecord(rows?.tokenUsage)?.val)?.totals)
  )
  const session = finalizeSession(accumulator, platform, options)
  const childIdentity = asRecord(asRecord(asRecord(rows?.subagent)?.val)?.identity)
  return session ? { ...session, isSubagent: childIdentity !== null } : null
}

function foldDshLog(accumulator: SessionAccumulator, content: string): boolean {
  let isSubagent = false
  for (const line of content.split('\n')) {
    const row = parseJsonObject(line)
    if (!row) {
      continue
    }
    updateTimeline(accumulator, row.time)
    const type = extractString(row.type)
    if (!type) {
      continue
    }
    switch (type) {
      case 'session': {
        isSubagent ||= row.origin === 'subagent'
        const id = extractString(row.id)
        if (id) {
          accumulator.sessionId = id
        }
        if (accumulator.cwd === null) {
          accumulator.cwd = extractString(row.cwd)
        }
        updateTimeline(accumulator, row.createdAt)
        break
      }
      case 'request/context':
      case 'request/header': {
        accumulator.model ??=
          extractString(asRecord(row.data)?.model) ??
          extractString(asRecord(asRecord(asRecord(row.data)?.header)?.config)?.model)
        break
      }
      case 'user/message': {
        const data = asRecord(row.data)
        if (extractString(asRecord(data?.source)?.kind) !== REAL_USER_MESSAGE_SOURCE) {
          break
        }
        addPreviewContent(accumulator, 'user', data?.content, row.time, {
          seedFirstUserPrompt: true
        })
        accumulator.messageCount++
        break
      }
      case 'assistant/message': {
        const message = asRecord(asRecord(row.data)?.message)
        if (!message) {
          break
        }
        addPreviewContent(accumulator, 'assistant', message.content, row.time)
        accumulator.messageCount++
        break
      }
      case 'session/title': {
        // Why last wins: dsh-tui rewrites the title (fallback first, provider
        // suggestion after) and its own picker shows the latest one.
        const title = extractString(asRecord(row.data)?.title)
        if (title) {
          accumulator.title = title
        }
        break
      }
    }
  }
  return isSubagent
}

function dshTokenTotal(totals: Record<string, unknown> | null): number {
  if (!totals) {
    return 0
  }
  return (
    numberValue(totals.uncachedInputTokens) +
    numberValue(totals.outputTokens) +
    numberValue(totals.cacheReadTokens) +
    numberValue(totals.cacheWriteTokens)
  )
}

async function readSessionLogBytes(path: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of openTranscriptReadStream(path, {}, 'scan')) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk)
  }
  return Buffer.concat(chunks)
}
