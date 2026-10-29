import { describe, expect, it } from 'vitest'
import {
  getAgentRowConversationName,
  isUsableAgentSessionName,
  type ConversationNameTab
} from './agent-row-conversation-name'

type TestTab = ConversationNameTab & { generatedTitle?: string | null }

function makeTab(overrides: Partial<TestTab> = {}): TestTab {
  return { customTitle: null, title: '', ...overrides }
}

describe('getAgentRowConversationName', () => {
  it('uses each DSH pane session title instead of the shared generated prompt', () => {
    const tab = makeTab({
      title: '✦ 🐋 Paper review',
      generatedTitle: 'The approval policy changed from ask to',
      aiVaultTitle: { agent: 'claude', sessionId: 'sibling', title: 'Claude task' }
    })
    expect(getAgentRowConversationName(tab, 'dsh', '✦ 🐋 Paper review')).toBe('Paper review')
    expect(getAgentRowConversationName(tab, 'dsh', '⠂ 🐋 Check citations')).toBe('Check citations')
    for (const title of ['✦ 🐋', null]) {
      expect(getAgentRowConversationName(tab, 'dsh', title)).toBe('DeepSeek Harness')
    }
    expect(getAgentRowConversationName({ ...tab, customTitle: 'My paper' }, 'dsh')).toBe('My paper')
    expect(getAgentRowConversationName({ ...tab, quickCommandLabel: 'Review' }, 'dsh')).toBe(
      'Review'
    )
  })

  it('prefers the manual tab rename over every other source', () => {
    const tab = makeTab({
      customTitle: 'Patient sync spike',
      quickCommandLabel: 'Run tests',
      generatedTitle: 'Fix intake flow',
      title: '✳ Investigate replay bug'
    })
    expect(getAgentRowConversationName(tab, 'claude')).toBe('Patient sync spike')
  })

  it('falls back to the quick-command label before titles', () => {
    const tab = makeTab({ quickCommandLabel: 'Run tests', title: '✳ Investigate replay bug' })
    expect(getAgentRowConversationName(tab, 'claude')).toBe('Run tests')
  })

  it('keeps OpenCode semantic session titles whole', () => {
    const tab = makeTab({ title: 'OC | build the release pipeline' })
    expect(getAgentRowConversationName(tab, 'opencode')).toBe('OC | build the release pipeline')
  })

  it("shows the title owned by the row's provider session", () => {
    const tab = makeTab({
      aiVaultTitle: { agent: 'claude', sessionId: 's1', title: 'Fix the lease probe' },
      generatedTitle: 'Fix intake flow',
      title: '\u2733 Investigate replay bug'
    })
    expect(getAgentRowConversationName(tab, 'claude', undefined, 's1')).toBe('Fix the lease probe')
  })

  it('lets a manual rename and a quick command still outrank the provider title', () => {
    const vault = { agent: 'claude' as const, sessionId: 's1', title: 'Fix the lease probe' }
    expect(
      getAgentRowConversationName(
        makeTab({ aiVaultTitle: vault, customTitle: 'Mine' }),
        'claude',
        undefined,
        's1'
      )
    ).toBe('Mine')
    expect(
      getAgentRowConversationName(
        makeTab({ aiVaultTitle: vault, quickCommandLabel: 'Run tests' }),
        'claude',
        undefined,
        's1'
      )
    ).toBe('Run tests')
  })

  it('keeps a cwd-shaped provider title that the live-title sanitizer would discard', () => {
    // `auth/login` is a real session name; as a scraped live title it would be read as a cwd.
    const tab = makeTab({
      aiVaultTitle: { agent: 'claude', sessionId: 's1', title: 'auth/login' },
      title: '\u2733 Investigate replay bug'
    })
    expect(getAgentRowConversationName(tab, 'claude', undefined, 's1')).toBe('auth/login')
    expect(getAgentRowConversationName(makeTab({ title: 'auth/login' }), 'claude')).toBeNull()
  })

  it("never names a session from Orca's generated tab title, a clipped first prompt", () => {
    const tab = makeTab({ generatedTitle: 'Fix intake flow', title: '✳ Investigate replay bug' })
    expect(getAgentRowConversationName(tab, 'claude')).toBe('Investigate replay bug')
    expect(getAgentRowConversationName(makeTab({ generatedTitle: 'Fix intake' }), 'claude')).toBe(
      null
    )
  })

  it('names a split pane from its own live title, not the tab title', () => {
    // Tab live title belongs to the focused pane; siblings need their own.
    const tab = makeTab({ title: '\u2733 Linear work log' })
    expect(getAgentRowConversationName(tab, 'claude', '\u2733 Redis cache strategy')).toBe(
      'Redis cache strategy'
    )
    // OpenCode's semantic title is a live title too, so it follows the pane.
    expect(getAgentRowConversationName(tab, 'opencode', 'OC | build the release pipeline')).toBe(
      'OC | build the release pipeline'
    )
    // No resolvable pane title: no live title at all, never the sibling's.
    expect(getAgentRowConversationName(tab, 'claude', null)).toBeNull()
    // A single-pane tab passes undefined and is untouched.
    expect(getAgentRowConversationName(tab, 'claude')).toBe('Linear work log')
  })

  it('does not lend tab-wide names to every agent of a split tab', () => {
    // Why: one tab name on several agents is exactly how sibling rows ended up identical.
    const custom = makeTab({ customTitle: 'Patient sync spike' })
    expect(getAgentRowConversationName(custom, 'claude', 'Redis cache strategy')).toBe(
      'Redis cache strategy'
    )
    const quick = makeTab({ quickCommandLabel: 'Run tests' })
    expect(getAgentRowConversationName(quick, 'claude', null)).toBeNull()
  })

  it('strips leading status decoration from agent-set titles', () => {
    expect(
      getAgentRowConversationName(makeTab({ title: '✳ Fix patient intake flow' }), 'claude')
    ).toBe('Fix patient intake flow')
    expect(
      getAgentRowConversationName(makeTab({ title: '⠋ Refactor replay guard' }), 'codex')
    ).toBe('Refactor replay guard')
  })

  it('rejects spinner+cwd titles instead of surfacing paths as names', () => {
    expect(
      getAgentRowConversationName(makeTab({ title: '⠋ ~/orca/workspaces' }), 'codex')
    ).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: '/Users/dev/repo' }), 'codex')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'C:\\repos\\orca' }), 'codex')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'orca/workspaces' }), 'codex')).toBeNull()
    expect(
      getAgentRowConversationName(
        makeTab({ title: '\\\\wsl.localhost\\Ubuntu\\home\\dev\\orca' }),
        'codex'
      )
    ).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'repos\\orca' }), 'codex')).toBeNull()
  })

  it('accepts multi-word titles that merely contain a slash', () => {
    expect(
      getAgentRowConversationName(makeTab({ title: 'Fix a/b toggle in settings' }), 'codex')
    ).toBe('Fix a/b toggle in settings')
  })

  it('rejects synthetic status titles', () => {
    expect(getAgentRowConversationName(makeTab({ title: 'Codex ready' }), 'codex')).toBeNull()
    expect(
      getAgentRowConversationName(makeTab({ title: 'Codex - action required' }), 'codex')
    ).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'Cursor Agent' }), 'cursor')).toBeNull()
  })

  it('rejects identity-echo, management, and placeholder titles', () => {
    expect(getAgentRowConversationName(makeTab({ title: 'Claude' }), 'claude')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: '✳ Claude Code' }), 'claude')).toBeNull()
    expect(
      getAgentRowConversationName(makeTab({ title: 'Claude Code - action required' }), 'claude')
    ).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: '✦ Gemini CLI' }), 'gemini')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: '◇ Ready (orca)' }), 'gemini')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'claude agents' }), 'claude')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'Agent' }), 'claude')).toBeNull()
  })

  it("rejects jcode's live identity title so the row shows the prompt instead", () => {
    // jcode's per-second codename/diff/duration title would hide the actual prompt/reply preview.
    expect(
      getAgentRowConversationName(makeTab({ title: '🌐 jcode Puppy · +3 -0 · last ~23s' }), 'jcode')
    ).toBeNull()
    expect(
      getAgentRowConversationName(makeTab({ title: '🐍 jcode Snake · work ~6s' }), 'jcode')
    ).toBeNull()
    expect(
      getAgentRowConversationName(makeTab({ title: '🐍 jcode/creek Snake' }), 'jcode')
    ).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'Fix the greet helper' }), 'jcode')).toBe(
      'Fix the greet helper'
    )
  })

  it('rejects empty, glyph-only, and default terminal titles', () => {
    expect(getAgentRowConversationName(makeTab(), 'claude')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: '✳' }), 'claude')).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title: 'Terminal 1' }), 'claude')).toBeNull()
    expect(
      getAgentRowConversationName(
        makeTab({ title: 'Workbench', defaultTitle: 'Workbench' }),
        'claude'
      )
    ).toBeNull()
    expect(
      getAgentRowConversationName(
        makeTab({ title: 'Terminal 2', defaultTitle: 'Terminal 2' }),
        'claude'
      )
    ).toBeNull()
  })

  it('puts the user pane rename first, and automatic titles never replace it', () => {
    const tab = makeTab({
      customTitle: 'Tab name',
      aiVaultTitle: { agent: 'claude', sessionId: 's1', title: 'Fix the lease probe' }
    })
    const sources = { manualPaneTitle: 'My review', providerSessionTitle: 'Generated name' }
    expect(getAgentRowConversationName(tab, 'claude', '✳ Live name', 's1', sources)).toBe(
      'My review'
    )
    expect(getAgentRowConversationName(tab, 'claude', undefined, 's1', sources)).toBe('My review')
  })

  it('names split-tab siblings from their own sessions, not the tab owner', () => {
    // Real case: three Claude sessions in one tab; only one owned the tab's title slot.
    const tab = makeTab({
      generatedTitle: 'Sao cái fast jev compact nó lại k hoạt',
      aiVaultTitle: { agent: 'claude', sessionId: 'a', title: 'Kho skill MCP và plugin' }
    })
    const names = [
      ['a', undefined],
      ['b', 'Tối ưu claude9 giống Claude thuần'],
      ['c', 'Worktree cho phần hiện tại']
    ].map(([id, providerSessionTitle]) =>
      getAgentRowConversationName(tab, 'claude', null, id, { providerSessionTitle })
    )
    expect(names).toEqual([
      'Kho skill MCP và plugin',
      'Tối ưu claude9 giống Claude thuần',
      'Worktree cho phần hiện tại'
    ])
  })

  it("never shows another session's tab-slot title", () => {
    const tab = makeTab({
      aiVaultTitle: { agent: 'claude', sessionId: 'other', title: 'Sibling work' }
    })
    expect(getAgentRowConversationName(tab, 'claude', null, 'mine')).toBeNull()
  })

  it('lets two sessions keep the same real name without inventing a tie-breaker', () => {
    const tab = makeTab()
    const sources = { providerSessionTitle: 'Review parser' }
    expect(getAgentRowConversationName(tab, 'claude', null, 'a', sources)).toBe('Review parser')
    expect(getAgentRowConversationName(tab, 'claude', null, 'b', sources)).toBe('Review parser')
  })

  it.each([
    '--- name: paper-referee description: Review a paper',
    '1 --- 2 name: paper-referee 3 descrip',
    '<local-command-caveat>The command below was run directly in Claude Code, not sent to you as a...',
    'Think in <thinking> tags as',
    '/paper-referee /home/me/paper.pdf',
    'hiện tại cái phần này chưa phải là worktree, biến nó thành worktree đi ạ cho tôi nhé'
  ])('rejects prompt, front matter and system text as a name: %s', (title) => {
    const tab = makeTab()
    expect(
      getAgentRowConversationName(tab, 'claude', null, 's1', { providerSessionTitle: title })
    ).toBeNull()
    expect(getAgentRowConversationName(makeTab({ title }), 'claude')).toBeNull()
    expect(isUsableAgentSessionName(title)).toBe(false)
  })

  it('ignores system text that was stored in the pane rename slot', () => {
    const sources = {
      manualPaneTitle: '<local-command-caveat>The command below was run directly',
      providerSessionTitle: 'Paper referee plugin'
    }
    expect(getAgentRowConversationName(makeTab(), 'claude', null, 's1', sources)).toBe(
      'Paper referee plugin'
    )
  })

  it('treats empty or whitespace titles as no name', () => {
    const sources = { manualPaneTitle: '   ', providerSessionTitle: '' }
    expect(getAgentRowConversationName(makeTab(), 'claude', null, 's1', sources)).toBeNull()
  })

  it("does not let a DSH pane borrow a Claude sibling's title", () => {
    // Real case: a DSH pane recorded the tab title of the focused Claude pane.
    const tab = makeTab({
      title: '✳ Model tự động cho 9router',
      aiVaultTitle: { agent: 'claude', sessionId: 'claude-1', title: 'Model tự động cho 9router' }
    })
    expect(getAgentRowConversationName(tab, 'dsh', '✳ Model tự động cho 9router', 'dsh-1')).toBe(
      'DeepSeek Harness'
    )
    expect(getAgentRowConversationName(tab, 'dsh', 'Think in <thinking> tags as', 'dsh-1')).toBe(
      'DeepSeek Harness'
    )
  })
})
