import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcileAccountSession } from './account-session-reconciliation'
import { MAX_SESSION_TRANSCRIPT_RECORD_BYTES } from './session-transcript-record-budget'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>()
  return { ...actual, link: vi.fn(actual.link), copyFile: vi.fn(actual.copyFile) }
})

let root: string
let source: string
let target: string
let backups: string
const row = (uuid: string, hour: number, sessionId = 'same-session', content = uuid) =>
  `${JSON.stringify({
    type: 'user',
    uuid,
    sessionId,
    message: { content },
    timestamp: `2026-10-15T${hour}:00:00Z`
  })}\n`
const older = row('shared-first', 10) + row('old-branch', 11)
const newer = row('shared-first', 10) + row('new-branch', 18)
const reconcile = (sessionId?: string) =>
  reconcileAccountSession(source, target, backups, sessionId)
async function archived(): Promise<string> {
  const directories = await fs.readdir(backups)
  expect(directories).toHaveLength(1)
  const directory = join(backups, directories[0]!)
  expect(await fs.readdir(directory)).toEqual(['session.jsonl'])
  return fs.readFile(join(directory, 'session.jsonl'), 'utf8')
}

beforeEach(async () => {
  vi.mocked(fs.link)
    .mockReset()
    .mockImplementation((...args) => actualLink(...args))
  vi.mocked(fs.copyFile)
    .mockReset()
    .mockImplementation((...args) => actualCopy(...args))
  root = await fs.mkdtemp(join(tmpdir(), 'orca-claude-reconcile-'))
  source = join(root, 'source.jsonl')
  target = join(root, 'session.jsonl')
  backups = join(root, 'backups')
  await fs.writeFile(source, newer)
  await fs.writeFile(target, older)
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
const { link: actualLink, copyFile: actualCopy } =
  await vi.importActual<typeof fs>('node:fs/promises')

describe('Claude account history reconciliation', () => {
  it.each(['\u2028', '\u2029'])(
    'preserves Unicode separators inside JSON message strings (%j)',
    async (separator) => {
      const latest =
        row('shared-first', 10) + row('new-branch', 18, 'same-session', `before${separator}after`)
      await fs.writeFile(source, latest)
      expect(await reconcile()).toBe(true)
      expect(await fs.readFile(target, 'utf8')).toBe(latest)
      expect(await archived()).toBe(older)
    }
  )
  it.each([
    [
      'different session',
      row('shared-first', 10, 'other-session') + row('new', 18, 'other-session')
    ],
    [
      'different opening message',
      row('shared-first', 10, 'same-session', 'unrelated') + row('new', 18)
    ],
    ['mixed session IDs', newer + row('other', 19, 'other-session')],
    ['truncated JSON', `${newer}{`],
    [
      'no activity time',
      JSON.stringify({ type: 'user', uuid: 'shared-first', sessionId: 'same-session', message: {} })
    ],
    ['ambiguous timestamp', row('shared-first', 10) + row('different-branch', 11)]
  ])('refuses %s without changing either history', async (_name, transcript) => {
    await fs.writeFile(source, transcript)
    expect(await reconcile()).toBe(false)
    expect(await fs.readFile(source, 'utf8')).toBe(transcript)
    expect(await fs.readFile(target, 'utf8')).toBe(older)
    await expect(fs.stat(backups)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('checks the requested session ID', async () => {
    expect(await reconcile('different-selection')).toBe(false)
    expect(await fs.readFile(target, 'utf8')).toBe(older)
  })
  it('refuses reconciliation if any transcript record exceeds the read budget', async () => {
    await fs.writeFile(
      source,
      newer + row('large', 19, 'same-session', 'x'.repeat(MAX_SESSION_TRANSCRIPT_RECORD_BYTES))
    )
    expect(await reconcile()).toBe(false)
    expect(await fs.readFile(target, 'utf8')).toBe(older)
  })
  it('ignores later metadata writes when both copies have the same last message', async () => {
    await fs.writeFile(
      source,
      `${older + JSON.stringify({ type: 'queue-operation', timestamp: '2099-01-01' })}\n`
    )
    expect(await reconcile()).toBe(true)
    expect(await fs.readFile(target, 'utf8')).toBe(older)
    await expect(fs.stat(backups)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects a redirected backup folder', async () => {
    const outside = join(root, 'outside')
    await fs.mkdir(outside)
    await fs.symlink(outside, backups, 'dir')
    await expect(reconcile()).rejects.toThrow('redirected')
    expect(await fs.readFile(target, 'utf8')).toBe(older)
    expect(await fs.readdir(outside)).toEqual([])
  })
  it('aborts if the target changes while staging the source', async () => {
    vi.mocked(fs.copyFile).mockImplementationOnce(async (...args) => {
      await actualCopy(...args)
      await fs.appendFile(target, row('concurrent-message', 19))
    })
    await expect(reconcile()).rejects.toThrow('changed')
    expect(await fs.readFile(target, 'utf8')).toBe(older + row('concurrent-message', 19))
    expect(await fs.readdir(backups)).toEqual([])
  })
  it('aborts if the source changes while it is being copied', async () => {
    vi.mocked(fs.copyFile).mockImplementationOnce(async (...args) => {
      await actualCopy(...args)
      await fs.appendFile(source, row('incoming-message', 19))
    })
    await expect(reconcile()).rejects.toThrow('changed')
    expect(await fs.readFile(target, 'utf8')).toBe(older)
    expect(await fs.readdir(backups)).toEqual([])
  })
  it('retains late writes from an already open target in the archive', async () => {
    const writer = await fs.open(target, 'a')
    try {
      vi.mocked(fs.link).mockImplementation(async (from, to) => {
        if (String(from).endsWith('latest.tmp')) {
          await writer.write(row('late-message', 19))
        }
        await actualLink(from, to)
      })
      expect(await reconcile()).toBe(true)
      expect(await fs.readFile(target, 'utf8')).toBe(newer)
      expect(await archived()).toBe(older + row('late-message', 19))
    } finally {
      await writer.close()
    }
  })
  it('restores the archived original if installing the latest copy fails', async () => {
    vi.mocked(fs.link).mockImplementation(async (from, to) => {
      if (String(from).endsWith('latest.tmp')) {
        throw new Error('install failed')
      }
      await actualLink(from, to)
    })
    await expect(reconcile()).rejects.toThrow('install failed')
    expect(await fs.readFile(target, 'utf8')).toBe(older)
    expect(await archived()).toBe(older)
  })
  it('never replaces a concurrent creator and retains the displaced history', async () => {
    vi.mocked(fs.link).mockImplementation(async (from, to) => {
      if (String(from).endsWith('latest.tmp')) {
        await fs.writeFile(target, 'concurrent', { flag: 'wx' })
      }
      await actualLink(from, to)
    })
    await expect(reconcile()).rejects.toThrow('previous history is saved at')
    expect(await fs.readFile(target, 'utf8')).toBe('concurrent')
    expect(await archived()).toBe(older)
    expect(await fs.readFile(source, 'utf8')).toBe(newer)
  })
})
