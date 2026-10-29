import { useEffect, useRef } from 'react'

// Clearance between the frame's accent bar and the first icon it holds.
const FRAME_LEAD_PX = 8
const FRAME_AGENT_PAD_PX = 2

// Why: the selected workspace is shown by framing its agents to the right of the tree line;
// a workspace without agents frames its own row.
function frameRect(card: HTMLElement): DOMRect {
  const cardRect = card.getBoundingClientRect()
  const agents = Array.from(card.querySelectorAll<HTMLElement>('[data-deck-agent]'))
    .map((agent) => agent.getBoundingClientRect())
    .filter((rect) => rect.width > 0)
  const first = agents[0]
  const last = agents.at(-1)
  const anchor = card.querySelector(first ? '.deck-agent-icon-slot' : '.deck-branch-glyph')
  const anchorLeft = anchor?.getBoundingClientRect().left
  const left = anchorLeft ? Math.max(cardRect.left, anchorLeft - FRAME_LEAD_PX) : cardRect.left
  const top = first ? first.top - FRAME_AGENT_PAD_PX : cardRect.top
  const bottom = last ? last.bottom + FRAME_AGENT_PAD_PX : cardRect.bottom
  return new DOMRect(left, top, cardRect.right - left, bottom - top)
}

export function DeckWorkspaceSelectionFrame(): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const frame = frameRef.current
    const content = frame?.parentElement
    const viewport = content?.closest<HTMLElement>('[data-worktree-sidebar]')
    if (!frame || !content || !viewport) {
      return
    }
    let pending = 0
    let target: HTMLElement | null = null
    const resize = new ResizeObserver(() => schedule())
    const update = (): void => {
      pending = 0
      const next =
        content.querySelector<HTMLElement>('[data-worktree-card-active="primary"]') ??
        content.querySelector<HTMLElement>('[aria-current="page"] [data-worktree-card-active]')
      if (target !== next) {
        if (target) {
          resize.unobserve(target)
        }
        target = next
        if (target) {
          resize.observe(target)
        }
      }
      const rect = target ? frameRect(target) : undefined
      const visible = viewport.getBoundingClientRect()
      if (!rect || !rect.width || rect.bottom <= visible.top || rect.top >= visible.bottom) {
        frame.hidden = true
        viewport.removeAttribute('data-deck-selection-tracking')
        return
      }
      const origin = content.getBoundingClientRect()
      frame.style.transform = `translate(${rect.left - origin.left}px, ${rect.top - origin.top}px)`
      frame.style.width = `${rect.width}px`
      frame.style.height = `${rect.height}px`
      frame.hidden = false
      viewport.setAttribute('data-deck-selection-tracking', '')
    }
    const schedule = (): void => {
      if (!pending) {
        pending = requestAnimationFrame(update)
      }
    }
    const mutations = new MutationObserver(schedule)
    mutations.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-worktree-card-active', 'aria-current']
    })
    resize.observe(viewport)
    viewport.addEventListener('scroll', schedule, { passive: true })
    schedule()
    return () => {
      cancelAnimationFrame(pending)
      mutations.disconnect()
      resize.disconnect()
      viewport.removeEventListener('scroll', schedule)
      viewport.removeAttribute('data-deck-selection-tracking')
    }
  }, [])
  return <div ref={frameRef} className="deck-workspace-selection-frame" aria-hidden hidden />
}
