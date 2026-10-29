import { describe, expect, it } from 'vitest'
import { isClaude9TranscriptPath } from './claude9-models'
import { buildAgentResumeStartupPlan } from './tui-agent-startup'

const SESSION_ID = '27e3c992-b23e-46dd-9da3-eb06fbeebed7'

describe('isClaude9TranscriptPath', () => {
  it('matches transcripts under the claude9 config dir only', () => {
    expect(isClaude9TranscriptPath(`/home/u/.claude-9router/projects/-p/${SESSION_ID}.jsonl`)).toBe(
      true
    )
    expect(isClaude9TranscriptPath('/home/u/.claude/projects/-p/x.jsonl')).toBe(false)
    expect(isClaude9TranscriptPath('/home/u/.config/orca/claude-accounts/a/auth/projects/x')).toBe(
      false
    )
    expect(isClaude9TranscriptPath(undefined)).toBe(false)
  })
})

describe('Claude cold-restore of a claude9 pane', () => {
  it('resumes with claude9 when the hook transcript lives in ~/.claude-9router', () => {
    const plan = buildAgentResumeStartupPlan({
      agent: 'claude',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: `/home/u/.claude-9router/projects/-home-u-Paper/${SESSION_ID}.jsonl`
      },
      cmdOverrides: {},
      agentArgs: '--dangerously-skip-permissions',
      platform: 'linux'
    })
    expect(plan?.launchCommand).toBe(
      `claude9 --dangerously-skip-permissions '--resume' '${SESSION_ID}'`
    )
  })

  it('keeps plain claude for Orca-managed Claude transcripts', () => {
    const plan = buildAgentResumeStartupPlan({
      agent: 'claude',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: `/home/u/.config/orca/claude-accounts/a/auth/projects/-p/${SESSION_ID}.jsonl`
      },
      cmdOverrides: {},
      agentArgs: '--dangerously-skip-permissions',
      platform: 'linux'
    })
    expect(plan?.launchCommand.startsWith('claude ')).toBe(true)
    expect(plan?.launchCommand).not.toContain('claude9')
  })
})
