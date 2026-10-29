import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { scanAiVaultSessions } from './session-scanner'
import {
  decompressZstdFrames,
  parseDshProjcacheContent,
  parseDshSessionContent,
  parseDshSessionFile
} from './session-scanner-dsh-parser'
import {
  isolatedScanRoots,
  jsonLines,
  writeDshScannerFixture
} from './session-scanner-test-fixtures'
import type { FileWithMtime } from './session-scanner-types'
import type { TranscriptMessage, TranscriptMessageSink } from './session-transcript-consumers'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

function logFile(path: string): FileWithMtime {
  return { path, mtimeMs: 1_777_634_400_500, modifiedAt: '2026-05-01T10:00:00.500Z' }
}

function sessionLogPath(sessionId: string, name = 'session.v4.jsonl'): string {
  return join(tmpdir(), 'dsh', 'sessions', 'ws', sessionId, name)
}

function recordingSink(messages: TranscriptMessage[]): TranscriptMessageSink {
  return { active: true, push: (message) => messages.push(message) }
}

describe('scanAiVaultSessions dsh', () => {
  it.each([
    [{ origin: 'subagent', parentSession: 'lead-session', delegationDepth: 1 }, true],
    [{ delegationDepth: 0 }, false],
    [{ parentSession: 'fork-source' }, false]
  ])('identifies child ownership from the log header %j', (header, expected) => {
    const session = parseDshSessionContent(
      logFile(sessionLogPath('ownership')),
      jsonLines([
        { type: 'session', id: 'ownership', cwd: '/workspace', ...header },
        { type: 'subagent/catalog', data: { childId: 'another-child' } },
        { type: 'user/message', data: { source: { kind: 'user' }, content: 'ENVIRONMENT' } }
      ])
    )
    expect(session).toHaveProperty('isSubagent', expected)
  })

  it.each([true, false])('identifies projection child identity: %s', (child) => {
    const session = parseDshProjcacheContent(
      logFile(sessionLogPath('projection')),
      JSON.stringify({
        record: {
          identity: { cwd: '/workspace', isSeeded: true },
          rows: {
            subagent: {
              ver: 2,
              val: child ? { identity: { mode: 'continuable', label: 'worker', seq: 0 } } : {}
            },
            subagentCatalog: { val: { children: ['some-child'] } },
            titleInput: { val: { first: { text: 'ENVIRONMENT' } } }
          }
        }
      }),
      'linux',
      { executionHostId: 'ssh:fixture' }
    )
    expect(session).toHaveProperty('isSubagent', child)
    expect(session?.executionHostId).toBe('ssh:fixture')
  })

  it('indexes a compressed dsh session with title, model, counts and resume command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-ai-vault-dsh-'))
    tempRoots.push(root)
    const roots = isolatedScanRoots(root)
    const sessionFile = await writeDshScannerFixture(roots.dshSessionsDir)

    const result = await scanAiVaultSessions({ ...roots, platform: 'darwin', limit: 20 })

    expect(result.issues).toEqual([])
    expect(result.sessions).toHaveLength(1)
    const session = result.sessions[0]
    expect(session.agent).toBe('dsh')
    expect(session.sessionId).toBe('dsh-session')
    expect(session.title).toBe('DSH vault title')
    expect(session.cwd).toBe('/tmp/dsh')
    expect(session.model).toBe('deepseek-v4-flash')
    expect(session.messageCount).toBe(2)
    expect(session.filePath).toBe(sessionFile)
    // Why not firstUserPrompt: list scans never capture it (see
    // shouldCaptureFullFirstUserPrompt); the preview is the list's own signal.
    expect(session.previewMessages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'DSH vault title'],
      ['assistant', 'DSH answer']
    ])
    expect(session.resumeCommand).toBe("cd '/tmp/dsh' && dsh-tui --resume 'dsh-session'")
  })

  it('reads an uncompressed generation log', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-ai-vault-dsh-plain-'))
    tempRoots.push(root)
    const logPath = join(root, '-tmp-plain-', 'plain-session', 'session.v3.jsonl')
    await mkdir(dirname(logPath), { recursive: true })
    await writeFile(
      logPath,
      jsonLines([
        {
          type: 'session',
          version: 3,
          id: 'plain-session',
          createdAt: 1_777_634_400_000,
          cwd: '/tmp/plain'
        },
        {
          type: 'user/message',
          time: 1_777_634_400_100,
          data: { content: [{ type: 'text', text: 'plain ask' }], source: { kind: 'user' } }
        }
      ])
    )

    const session = await parseDshSessionFile(logFile(logPath), 'darwin')

    expect(session?.sessionId).toBe('plain-session')
    expect(session?.cwd).toBe('/tmp/plain')
    expect(session?.messageCount).toBe(1)
    expect(session?.previewMessages.map((message) => message.text)).toEqual(['plain ask'])
  })

  it('ignores injected user rows so the ask is the first prompt', () => {
    const messages: TranscriptMessage[] = []
    const session = parseDshSessionContent(
      logFile(sessionLogPath('injected')),
      jsonLines([
        { type: 'session', id: 'injected', createdAt: 1_777_634_400_000, cwd: '/tmp/injected' },
        {
          type: 'user/message',
          time: 1_777_634_400_100,
          data: {
            content: [{ type: 'text', text: 'approval changed' }],
            source: { kind: 'user-approval' }
          }
        },
        {
          type: 'user/message',
          time: 1_777_634_400_200,
          data: { content: [{ type: 'text', text: 'real ask' }], source: { kind: 'user' } }
        }
      ]),
      'darwin',
      {},
      recordingSink(messages)
    )

    expect(session?.messageCount).toBe(1)
    expect(session?.previewMessages.map((message) => message.text)).toEqual(['real ask'])
    expect(messages.map((message) => message.text)).toEqual(['real ask'])
  })

  it('decodes every appended zstd frame, handing the decoder exactly one frame', () => {
    // dsh appends one zstd frame per write, and Electron 43's Node decodes only
    // the first frame of a concatenation. Slicing at the magic makes every call
    // a single frame, whichever runtime decodes it.
    const frames = [Buffer.from('first\n'), Buffer.from('second\n'), Buffer.from('third\n')]
    const wire = Buffer.concat(frames.map((frame) => zstdCompressSync(frame)))
    const slices: Buffer[] = []

    const decoded = decompressZstdFrames(wire, (slice) => {
      slices.push(slice)
      return zstdDecompressSync(slice)
    })

    expect(decoded.toString('utf8')).toBe('first\nsecond\nthird\n')
    expect(slices.map((slice) => slice.length)).toEqual(
      frames.map((frame) => zstdCompressSync(frame).length)
    )
  })

  it('keeps the committed frames when the session is mid-write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-ai-vault-dsh-partial-'))
    tempRoots.push(root)
    const logPath = join(root, '-tmp-live--', 'live-session', 'session.v4.jsonl.zstd')
    await mkdir(dirname(logPath), { recursive: true })
    const header = `${JSON.stringify({ type: 'session', id: 'live-session', cwd: '/tmp/live' })}\n`
    const ask = `${JSON.stringify({
      type: 'user/message',
      time: 1_777_634_400_100,
      data: { content: [{ type: 'text', text: 'live ask' }], source: { kind: 'user' } }
    })}\n`
    const halfWritten = zstdCompressSync(
      Buffer.from(
        `${JSON.stringify({
          type: 'assistant/message',
          time: 1_777_634_400_200,
          data: { message: { role: 'assistant', content: [{ type: 'text', text: 'unread' }] } }
        })}\n`
      )
    ).subarray(0, 9)
    await writeFile(
      logPath,
      Buffer.concat([
        zstdCompressSync(Buffer.from(header)),
        zstdCompressSync(Buffer.from(ask)),
        halfWritten
      ])
    )

    const session = await parseDshSessionFile(logFile(logPath), 'darwin')

    expect(session?.sessionId).toBe('live-session')
    expect(session?.previewMessages.map((message) => message.text)).toEqual(['live ask'])
  })

  it('lists a session from its projection when the host cannot decode the log', () => {
    const session = parseDshProjcacheContent(
      logFile(sessionLogPath('cached-session', 'session.v4.jsonl.zstd')),
      JSON.stringify({
        version: 7,
        record: {
          identity: { formatVersion: 4, createdAt: 1_777_634_400_000, cwd: '/tmp/cached' },
          rows: {
            title: { val: 'Cached title' },
            titleInput: { val: { first: { text: 'cached first prompt' } } },
            sessionListMetadata: { val: { lastPromptAt: 1_777_634_500_000 } },
            tokenUsage: {
              val: { totals: { uncachedInputTokens: 10, outputTokens: 5 } }
            }
          }
        }
      }),
      'darwin'
    )

    expect(session?.sessionId).toBe('cached-session')
    expect(session?.cwd).toBe('/tmp/cached')
    expect(session?.title).toBe('Cached title')
    expect(session?.totalTokens).toBe(15)
    expect(session?.updatedAt).toBe(new Date(1_777_634_500_000).toISOString())
    expect(session?.previewMessages.map((message) => message.text)).toEqual(['cached first prompt'])
    expect(session?.resumeCommand).toBe("cd '/tmp/cached' && dsh-tui --resume 'cached-session'")
  })
})
