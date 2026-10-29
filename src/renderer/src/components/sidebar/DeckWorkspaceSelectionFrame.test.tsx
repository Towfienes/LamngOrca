// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeckWorkspaceSelectionFrame } from './DeckWorkspaceSelectionFrame'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('workspace selection frame', () => {
  it('moves one frame between cards, hides offscreen, and cleans up tracking', async () => {
    const { container, unmount } = render(
      <div data-worktree-sidebar>
        <div data-content>
          <div aria-current="page">
            <div data-pinned data-worktree-card-active="secondary" />
          </div>
          <div data-first data-worktree-card-surface data-worktree-card-active="primary" />
          <div data-second data-worktree-card-surface />
          <DeckWorkspaceSelectionFrame />
        </div>
      </div>
    )
    const viewport = container.querySelector<HTMLElement>('[data-worktree-sidebar]')!
    const content = container.querySelector<HTMLElement>('[data-content]')!
    const first = container.querySelector<HTMLElement>('[data-first]')!
    const second = container.querySelector<HTMLElement>('[data-second]')!
    const frame = container.querySelector<HTMLElement>('.deck-workspace-selection-frame')!
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 400))
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 900))
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(8, 20, 280, 50))
    const secondRect = vi
      .spyOn(second, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(20, 140, 268, 95))
    await waitFor(() => expect(frame.style.transform).toBe('translate(8px, 20px)'))
    expect(frame.hidden).toBe(false)
    first.removeAttribute('data-worktree-card-active')
    second.setAttribute('data-worktree-card-active', 'primary')
    await waitFor(() => expect(frame.style.transform).toBe('translate(20px, 140px)'))
    expect(frame.style.height).toBe('95px')
    expect(container.querySelectorAll('.deck-workspace-selection-frame')).toHaveLength(1)
    secondRect.mockReturnValue(new DOMRect(20, -200, 268, 95))
    viewport.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(frame.hidden).toBe(true))
    expect(viewport.hasAttribute('data-deck-selection-tracking')).toBe(false)
    unmount()
    expect(viewport.hasAttribute('data-deck-selection-tracking')).toBe(false)
  })
  it('frames the selected workspace agents from just before their icons', async () => {
    const { container } = render(
      <div data-worktree-sidebar>
        <div data-content>
          <div data-card data-worktree-card-surface data-worktree-card-active="primary">
            <div data-deck-agent data-first-agent>
              <span className="deck-agent-icon-slot" />
            </div>
            <div data-deck-agent data-last-agent />
          </div>
          <DeckWorkspaceSelectionFrame />
        </div>
      </div>
    )
    const rect = (selector: string, value: DOMRect): void => {
      vi.spyOn(
        container.querySelector<HTMLElement>(selector)!,
        'getBoundingClientRect'
      ).mockReturnValue(value)
    }
    rect('[data-worktree-sidebar]', new DOMRect(0, 0, 300, 400))
    rect('[data-content]', new DOMRect(0, 0, 300, 900))
    rect('[data-card]', new DOMRect(4, 100, 292, 80))
    rect('[data-first-agent]', new DOMRect(46, 126, 250, 24))
    rect('[data-last-agent]', new DOMRect(46, 152, 250, 24))
    rect('.deck-agent-icon-slot', new DOMRect(50, 130, 16, 16))
    const frame = container.querySelector<HTMLElement>('.deck-workspace-selection-frame')!
    await waitFor(() => expect(frame.style.transform).toBe('translate(42px, 124px)'))
    expect(frame.style.width).toBe('254px')
    expect(frame.style.height).toBe('54px')
  })
})
