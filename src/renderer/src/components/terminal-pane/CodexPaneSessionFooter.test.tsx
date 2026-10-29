// @vitest-environment happy-dom
import { Terminal } from '@xterm/headless'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodexPaneSessionFooter } from './CodexPaneSessionFooter'

const identity = vi.hoisted(() => ({
  agentType: 'codex',
  accountLabel: 'pane@example.invalid',
  ptyId: 'pty-one'
}))
vi.mock('./use-pane-account-identity', () => ({ usePaneAccountIdentity: () => identity }))
let terminal: Terminal
beforeEach(() => {
  identity.agentType = 'codex'
  identity.accountLabel = 'pane@example.invalid'
  identity.ptyId = 'pty-one'
  terminal = new Terminal({ cols: 120, rows: 30, allowProposedApi: true })
})
afterEach(() => {
  cleanup()
  terminal.dispose()
})
function mount() {
  return render(<CodexPaneSessionFooter paneKey="pane" ptyId="pty-one" terminal={terminal} />)
}
async function paint(footer: string) {
  await act(async () => {
    await new Promise<void>((resolve) =>
      terminal.write(`\x1b[18;1H\x1b[2K${footer}\x1b[16;3H`, resolve)
    )
  })
}
it('shows account and context from the native Codex footer', async () => {
  // Captured Codex 0.163.0 statusline, 2026-10-23; cursor rests two rows above it.
  await paint('GPT-6.1-Sol high · Context 37% used')
  mount()
  expect(await screen.findByText('ctx 37%')).toBeTruthy()
  expect(screen.getByText('pane@example.invalid')).toBeTruthy()
})
it('updates after CLI redraw and never fabricates a percentage for a hidden footer', async () => {
  mount()
  expect(screen.getByText('ctx —')).toBeTruthy()
  await paint('GPT-6.1-Sol high · Context 0% used')
  await screen.findByText('ctx 0%')
  await paint('GPT-6.1-Sol high · Context 62% used')
  await screen.findByText('ctx 62%')
  await paint('Choose a model')
  await waitFor(() => expect(screen.getByText('ctx —')).toBeTruthy())
})
it('supports the existing context-left footer on an already running Codex', async () => {
  await paint('? for shortcuts                 58% context left')
  mount()
  expect(await screen.findByText('ctx 42%')).toBeTruthy()
})
it('ignores context-like text in older scrollback', async () => {
  await new Promise<void>((resolve) => terminal.write('Context 95% used\r\n\x1b[16;3H', resolve))
  mount()
  expect(screen.getByText('ctx —')).toBeTruthy()
})
it('does not show a footer for another provider or a different PTY', () => {
  identity.agentType = 'claude'
  const { rerender } = mount()
  expect(screen.queryByRole('status')).toBeNull()
  identity.agentType = 'codex'
  identity.ptyId = 'pty-replaced'
  rerender(<CodexPaneSessionFooter paneKey="pane" ptyId="pty-one" terminal={terminal} />)
  expect(screen.queryByRole('status')).toBeNull()
})
