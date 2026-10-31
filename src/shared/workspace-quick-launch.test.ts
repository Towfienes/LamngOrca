import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceQuickLaunch } from './workspace-quick-launch'

describe('workspace Quick Launch preferences', () => {
  it('provides reference defaults for older profiles', () => {
    expect(normalizeWorkspaceQuickLaunch(undefined).agents).toEqual([
      'claude',
      'codex',
      'opencode',
      'antigravity',
      'gemini',
      'droid'
    ])
  })
  it('preserves an intentionally empty selection', () => {
    expect(normalizeWorkspaceQuickLaunch({ agents: [], tools: [] })).toEqual({
      version: 2,
      agents: [],
      tools: []
    })
  })
  it('keeps user order while removing duplicates and invalid identities', () => {
    expect(
      normalizeWorkspaceQuickLaunch({
        agents: ['dsh', 'codex', 'dsh', 'bogus'],
        tools: ['browser', 'bogus', 'terminal', 'browser']
      })
    ).toEqual({ version: 2, agents: ['dsh', 'codex'], tools: ['browser', 'terminal', 'vscode'] })
  })
  it('adds VS Code once to an older nonempty tool list and lets users remove it permanently', () => {
    const upgraded = normalizeWorkspaceQuickLaunch({
      agents: ['codex'],
      tools: ['terminal', 'browser', 'emulator']
    })
    expect(upgraded.tools).toEqual(['terminal', 'vscode', 'browser', 'emulator'])
    expect(normalizeWorkspaceQuickLaunch(upgraded)).toEqual(upgraded)
    const hidden = { ...upgraded, tools: upgraded.tools.filter((tool) => tool !== 'vscode') }
    expect(normalizeWorkspaceQuickLaunch(hidden)).toEqual(hidden)
    expect(normalizeWorkspaceQuickLaunch(undefined).tools).toContain('vscode')
  })
})
