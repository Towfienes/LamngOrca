import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { parseClaude9List } from './claude9-models'

describe('parseClaude9List', () => {
  it('keeps well-formed models and the default id', () => {
    const out = parseClaude9List(
      JSON.stringify({
        default: 'm1',
        models: [{ alias: 'a', id: 'm1', label: 'M1' }, { bogus: true }, null]
      }),
      5
    )
    expect(out).toEqual({
      available: true,
      defaultId: 'm1',
      models: [{ alias: 'a', id: 'm1', label: 'M1' }],
      fetchedAt: 5
    })
  })

  it('reports unavailable when the list is missing', () => {
    expect(parseClaude9List('{}', 1)).toMatchObject({ available: false })
  })
})

describe('listClaude9Sessions', () => {
  it('parses claude9 transcripts and resumes them with claude9', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { listClaude9Sessions } = await import('./claude9-models')
    const root = mkdtempSync(join(tmpdir(), 'claude9-projects-'))
    const project = join(root, '-w-Paper')
    mkdirSync(join(project, 'abc-123', 'subagents'), { recursive: true })
    const at = '2026-10-28T03:00:00.000Z'
    writeFileSync(
      join(project, 'abc-123.jsonl'),
      [
        {
          type: 'user',
          sessionId: 'abc-123',
          cwd: '/w/Paper',
          timestamp: at,
          uuid: 'u1',
          message: { role: 'user', content: 'Fix the paper intro' }
        },
        {
          type: 'assistant',
          sessionId: 'abc-123',
          cwd: '/w/Paper',
          timestamp: at,
          uuid: 'a1',
          message: {
            role: 'assistant',
            model: 'Lamng/ds',
            content: [{ type: 'text', text: 'Done.' }]
          }
        }
      ]
        .map((row) => `${JSON.stringify(row)}\n`)
        .join('')
    )
    writeFileSync(join(project, 'notes.txt'), 'ignored')
    const sessions = await listClaude9Sessions(root)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      agent: 'claude',
      sessionId: 'abc-123',
      cwd: '/w/Paper',
      resumeCommand: 'claude9 --resume abc-123'
    })
  })

  it('returns no sessions when claude9 has never run', async () => {
    const { listClaude9Sessions } = await import('./claude9-models')
    expect(await listClaude9Sessions('/nonexistent/claude9/projects')).toEqual([])
  })
})
