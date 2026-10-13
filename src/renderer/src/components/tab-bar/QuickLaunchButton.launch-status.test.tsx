// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({ detectedIds: ['claude', 'codex'] })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ useOptionalShortcutLabel: () => null }))
vi.mock('@/store', () => {
  const state = {
    settings: { defaultTuiAgent: 'codex', disabledTuiAgents: [] },
    worktreesByRepo: {},
    repos: [],
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn()
  }
  const useAppStore = Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
  return { useAppStore }
})
vi.mock('@/lib/agent-catalog', () => ({
  getAgentCatalog: () => [
    { id: 'claude', label: 'Claude' },
    { id: 'codex', label: 'Codex' }
  ],
  AgentIcon: ({ agent }: { agent: string }) => <span>{agent}</span>
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    disabled,
    title,
    onSelect
  }: { children: ReactNode } & DivProps) => (
    <div aria-disabled={disabled ? 'true' : 'false'} title={title} onClick={onSelect}>
      {children}
    </div>
  ),
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    fallback.replace('{{value0}}', values?.value0 ?? '')
}))
const launchMock = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, message: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: launchMock }))

type DivProps = { disabled?: boolean; title?: string; onSelect?: () => void }

import { QuickLaunchAgentMenuItems } from './QuickLaunchButton'

const WORKTREE_ID = 'worktree-1'

describe('QuickLaunchAgentMenuItems pane placement', () => {
  afterEach(cleanup)
  it('lets the sidebar place the selected agent without opening a tab', () => {
    launchMock.mockClear()
    const onLaunchAgent = vi.fn()
    const onFocusTerminal = vi.fn()
    render(
      <QuickLaunchAgentMenuItems
        worktreeId={WORKTREE_ID}
        groupId="group-1"
        onFocusTerminal={onFocusTerminal}
        onLaunchAgent={onLaunchAgent}
      />
    )
    fireEvent.click(document.querySelector('[title="Launch Codex in a new terminal"]')!)
    expect(onLaunchAgent).toHaveBeenCalledExactlyOnceWith('codex')
    expect(launchMock).not.toHaveBeenCalled()
    expect(onFocusTerminal).not.toHaveBeenCalled()
  })
})
