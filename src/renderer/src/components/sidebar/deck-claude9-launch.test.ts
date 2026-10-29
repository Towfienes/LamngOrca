import { describe, expect, it } from 'vitest'
import { buildClaude9Command, formatTokenCount } from './deck-claude9-launch'

describe('buildClaude9Command', () => {
  it('starts claude9 on its default model with the Claude default args', () => {
    expect(buildClaude9Command('--dangerously-skip-permissions')).toBe(
      'claude9 --dangerously-skip-permissions'
    )
  })

  it('drops empty args', () => {
    expect(buildClaude9Command('  ')).toBe('claude9')
  })

  it('resumes a session started in the current workspace', () => {
    expect(
      buildClaude9Command('--dangerously-skip-permissions', {
        sessionId: 'abc-123',
        cwd: '/w/Paper',
        workspacePath: '/w/Paper'
      })
    ).toBe('claude9 --resume abc-123 --dangerously-skip-permissions')
  })

  it("resumes from the session's own start directory when it differs", () => {
    expect(
      buildClaude9Command('', { sessionId: 'abc-123', cwd: "/w/it's", workspacePath: '/w/Paper' })
    ).toBe(`cd '/w/it'\\''s' && claude9 --resume abc-123`)
  })

  it('rejects session ids that are not plain identifiers', () => {
    expect(() =>
      buildClaude9Command('', { sessionId: 'x; rm -rf ~', cwd: null, workspacePath: null })
    ).toThrow()
  })
})

describe('formatTokenCount', () => {
  it('formats millions, thousands and missing values', () => {
    expect(formatTokenCount(1_048_576)).toBe('1.0M')
    expect(formatTokenCount(64_000)).toBe('64k')
    expect(formatTokenCount(null)).toBe('—')
  })
})
