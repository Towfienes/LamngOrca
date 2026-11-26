import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { buildDeeprelayModelList, listDeeprelaySessions } from './deeprelay-models'

const config = {
  base: 'https://api.deeprelay.ai',
  key: 'secret',
  model: 'deeprelay/deepseek-v4.1-flash',
  effort: 'low'
}
const cache = {
  at: 123,
  usable: [
    {
      id: 'deeprelay/deepseek-v4.1-flash',
      name: 'DeepSeek V4.1 Flash',
      ctx: 1_048_576,
      out: 393_216,
      vision: true
    },
    { id: 'deeprelay/glm-5.3', name: 'GLM 5.3', ctx: 1_048_576, out: 131_072, vision: false }
  ]
}

describe('buildDeeprelayModelList', () => {
  it('uses the configured default and the launcher-cached plan models', () => {
    expect(buildDeeprelayModelList(config, cache, 999)).toEqual({
      available: true,
      defaultId: 'deeprelay/deepseek-v4.1-flash',
      models: [
        {
          id: 'deeprelay/deepseek-v4.1-flash',
          label: 'deepseek-v4.1-flash',
          ctx: 1_048_576,
          out: 393_216,
          vision: true
        },
        {
          id: 'deeprelay/glm-5.3',
          label: 'glm-5.3',
          ctx: 1_048_576,
          out: 131_072,
          vision: false
        }
      ],
      base: 'https://api.deeprelay.ai',
      fetchedAt: 123
    })
  })

  it('falls back to the configured model before the launcher caches a probe', () => {
    expect(buildDeeprelayModelList(config, null, 999)).toMatchObject({
      available: true,
      defaultId: 'deeprelay/deepseek-v4.1-flash',
      models: [
        {
          id: 'deeprelay/deepseek-v4.1-flash',
          label: 'deepseek-v4.1-flash',
          ctx: null,
          out: null,
          vision: false
        }
      ],
      base: 'https://api.deeprelay.ai',
      fetchedAt: null
    })
  })

  it('keeps the configured default when the cache predates a model switch', () => {
    expect(
      buildDeeprelayModelList({ ...config, model: 'deeprelay/kimi-k3.1-pro' }, cache, 999)
    ).toMatchObject({
      available: true,
      defaultId: 'deeprelay/kimi-k3.1-pro',
      models: [
        { id: 'deeprelay/kimi-k3.1-pro', label: 'kimi-k3.1-pro', ctx: null },
        { id: 'deeprelay/deepseek-v4.1-flash', label: 'deepseek-v4.1-flash' },
        { id: 'deeprelay/glm-5.3', label: 'glm-5.3' }
      ]
    })
  })

  it('reports an unconfigured launcher', () => {
    expect(buildDeeprelayModelList(null, cache, 999)).toEqual({
      available: false,
      reason: 'DeepRelay is not configured',
      fetchedAt: 999
    })
  })
})

describe('listDeeprelaySessions', () => {
  it('parses DeepRelay transcripts and resumes them with deeprelay', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = mkdtempSync(join(tmpdir(), 'deeprelay-projects-'))
    const project = join(root, '-w-Paper')
    mkdirSync(project, { recursive: true })
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
            model: 'deeprelay/deepseek-v4.1-flash',
            content: [{ type: 'text', text: 'Done.' }]
          }
        }
      ]
        .map((row) => `${JSON.stringify(row)}\n`)
        .join('')
    )
    writeFileSync(join(project, 'notes.txt'), 'ignored')
    const sessions = await listDeeprelaySessions(root)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      agent: 'claude',
      sessionId: 'abc-123',
      cwd: '/w/Paper',
      resumeCommand: 'deeprelay --resume abc-123'
    })
  })

  it('returns no sessions before DeepRelay has run', async () => {
    expect(await listDeeprelaySessions('/nonexistent/deeprelay/projects')).toEqual([])
  })
})
