import { describe, expect, it } from 'vitest'
import { buildDeeprelayCommand } from './deck-deeprelay-launch'

describe('buildDeeprelayCommand', () => {
  it('starts deeprelay on its configured model', () => {
    expect(buildDeeprelayCommand()).toBe('deeprelay')
  })

  it('resumes a session started in the current workspace', () => {
    expect(
      buildDeeprelayCommand({ sessionId: 'abc-123', cwd: '/w/Paper', workspacePath: '/w/Paper' })
    ).toBe('deeprelay --resume abc-123')
  })

  it("resumes from the session's own start directory when it differs", () => {
    expect(
      buildDeeprelayCommand({ sessionId: 'abc-123', cwd: "/w/it's", workspacePath: '/w/Paper' })
    ).toBe(`cd '/w/it'\\''s' && deeprelay --resume abc-123`)
  })

  it('changes directory with PowerShell syntax on a Windows desktop', () => {
    expect(
      buildDeeprelayCommand(
        { sessionId: 'abc-123', cwd: "C:\\w\\it's", workspacePath: 'C:\\w\\Paper' },
        true
      )
    ).toBe(`Set-Location -LiteralPath 'C:\\w\\it''s'; deeprelay --resume abc-123`)
  })

  it('rejects session ids that are not plain identifiers', () => {
    expect(() =>
      buildDeeprelayCommand({ sessionId: 'x; rm -rf ~', cwd: null, workspacePath: null })
    ).toThrow()
  })
})
