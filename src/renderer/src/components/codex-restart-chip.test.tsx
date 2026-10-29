// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { useAppStore } from '../store'
import CodexRestartChip from './CodexRestartChip'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const PTY = 'worktree-1@@pty-1'
const OTHER_PTY = 'worktree-2@@pty-2'
let root: Root
let container: HTMLDivElement
let forgetStalePanes: ReturnType<typeof vi.fn>
const notice = {
  previousAccountLabel: 'Old',
  previousAccountId: 'old',
  nextAccountLabel: 'New',
  nextAccountId: 'new'
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  forgetStalePanes = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { codexAccounts: { forgetStalePanes } }
  })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useAppStore.setState(useAppStore.getInitialState(), true)
  vi.restoreAllMocks()
})

describe('Deck Codex account continuity', () => {
  it('keeps the exact pane on its launch account without a dialog, restart or focus change', async () => {
    useAppStore.setState({ codexRestartNoticeByPtyId: { [PTY]: notice, [OTHER_PTY]: notice } })
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    input.focus()
    await act(async () => {
      root.render(<CodexRestartChip ptyId={PTY} shouldFocus />)
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(useAppStore.getState().codexRestartNoticeByPtyId[PTY]).toEqual({
      ...notice,
      dismissed: true
    })
    expect(useAppStore.getState().codexRestartNoticeByPtyId[OTHER_PTY]).toEqual(notice)
    expect(useAppStore.getState().pendingCodexPaneRestartIds).toEqual({})
    expect(document.activeElement).toBe(input)
    expect(forgetStalePanes).not.toHaveBeenCalled()
    input.remove()
  })
  it('does not consume an explicitly queued restart', async () => {
    useAppStore.setState({
      codexRestartNoticeByPtyId: { [PTY]: { ...notice, restartRequested: true } },
      pendingCodexPaneRestartIds: { [PTY]: true }
    })
    await act(async () => {
      root.render(<CodexRestartChip ptyId={PTY} />)
    })
    expect(useAppStore.getState().pendingCodexPaneRestartIds[PTY]).toBe(true)
    expect(forgetStalePanes).not.toHaveBeenCalled()
  })
  it('dismisses a restored notice once even during StrictMode replay', async () => {
    useAppStore.setState({
      codexRestartNoticeByPtyId: { [PTY]: { ...notice, homeRouteChanged: true } }
    })
    await act(async () => {
      root.render(
        <StrictMode>
          <CodexRestartChip ptyId={PTY} isVisible={false} />
        </StrictMode>
      )
    })
    expect(useAppStore.getState().codexRestartNoticeByPtyId[PTY]?.dismissed).toBe(true)
    expect(forgetStalePanes).not.toHaveBeenCalled()
  })
  it('does not touch already answered notices', async () => {
    useAppStore.setState({ codexRestartNoticeByPtyId: { [PTY]: { ...notice, dismissed: true } } })
    await act(async () => {
      root.render(<CodexRestartChip ptyId={PTY} />)
    })
    expect(forgetStalePanes).not.toHaveBeenCalled()
  })
  it('keeps the launch identity after another global account switch', async () => {
    useAppStore.setState({ codexRestartNoticeByPtyId: { [PTY]: notice } })
    await act(async () => {
      root.render(<CodexRestartChip ptyId={PTY} />)
    })
    await act(async () => {
      useAppStore
        .getState()
        .markCodexRestartNotices([
          { ptyId: PTY, ...notice, nextAccountId: 'third', nextAccountLabel: 'Third' }
        ])
    })
    expect(useAppStore.getState().codexRestartNoticeByPtyId[PTY]).toMatchObject({
      previousAccountId: 'old',
      nextAccountId: 'third',
      dismissed: true
    })
    expect(useAppStore.getState().pendingCodexPaneRestartIds).toEqual({})
    expect(forgetStalePanes).not.toHaveBeenCalled()
  })
})
