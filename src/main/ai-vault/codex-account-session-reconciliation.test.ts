import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcileAccountSession } from './account-session-reconciliation'
import { MAX_SESSION_TRANSCRIPT_RECORD_BYTES } from './session-transcript-record-budget'

const meta = (id = 'session') => `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`
const message = (text: string, hour = 10, role = 'user') =>
  `${JSON.stringify({
    type: 'response_item',
    timestamp: `2026-10-20T${hour}:00:00Z`,
    payload: { type: 'message', role, content: [{ type: 'input_text', text }] }
  })}\n`
const older = meta() + message('opening') + message('old', 11, 'assistant')
let root: string
let source: string
let target: string
let backups: string
const reconcile = (id = 'session') => reconcileAccountSession(source, target, backups, id, 'codex')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-codex-reconcile-'))
  source = join(root, 'source.jsonl')
  target = join(root, 'target.jsonl')
  backups = join(root, 'backups')
  await writeFile(target, older)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('Codex account history reconciliation', () => {
  it.each([
    ['different session', meta('other') + message('opening') + message('new', 18)],
    ['different opening', meta() + message('unrelated') + message('new', 18)],
    ['mixed session IDs', older + meta('other')],
    ['truncated record', `${older}{`],
    ['invalid record', `${older}[]\n`],
    ['invalid payload', `${older}{"type":"response_item","payload":null}\n`],
    ['missing activity time', `${meta()}{"type":"response_item","payload":{}}\n`],
    ['no user message', meta() + message('instructions', 18, 'developer')],
    ['oversized record', older + message('x'.repeat(MAX_SESSION_TRANSCRIPT_RECORD_BYTES), 18)],
    ['ambiguous activity time', meta() + message('opening') + message('other branch', 11)]
  ])('refuses %s and preserves both histories', async (_name, transcript) => {
    await writeFile(source, transcript)
    expect(await reconcile()).toBe(false)
    expect(await readFile(target, 'utf8')).toBe(older)
    expect(await readFile(source, 'utf8')).toBe(transcript)
  })

  it('checks the requested session ID', async () => {
    await writeFile(source, meta() + message('opening') + message('latest', 18))
    expect(await reconcile('other')).toBe(false)
    expect(await readFile(target, 'utf8')).toBe(older)
  })

  it('ignores later settings writes on the older account', async () => {
    const metadata = `${JSON.stringify({
      type: 'event_msg',
      timestamp: '2099-01-01',
      payload: { type: 'thread_settings_applied' }
    })}\n`
    const latest = meta() + message('opening') + message('latest', 18)
    await writeFile(source, latest)
    await writeFile(target, older + metadata)
    expect(await reconcile()).toBe(true)
    expect(await readFile(target, 'utf8')).toBe(latest)
  })

  it('compares the whole history when the latest message and time match', async () => {
    const ending = message('same ending', 18, 'assistant')
    await writeFile(source, meta() + message('opening') + message('different branch', 11) + ending)
    await writeFile(target, older + ending)
    expect(await reconcile()).toBe(false)
    expect(await readFile(target, 'utf8')).toBe(older + ending)
  })

  it('accepts identical conversations with different metadata and a complete final record', async () => {
    await writeFile(source, older.trimEnd())
    await writeFile(target, `${older}{"type":"token_usage_record","payload":{}}\n`)
    expect(await reconcile()).toBe(true)
  })
})
