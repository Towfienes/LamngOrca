// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSurfaceEntryAnimation } from './use-surface-entry-animation'

function Surface({ surface, enabled }: { surface: string; enabled: boolean }) {
  const ref = useSurfaceEntryAnimation(surface, enabled)
  return <div ref={ref}>Files</div>
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('surface entry animation', () => {
  it('waits for current data, animates a new scope, and cancels obsolete motion', () => {
    const animate = vi.spyOn(HTMLElement.prototype, 'animate')
    const { rerender } = render(<Surface surface="one" enabled={false} />)
    expect(animate).not.toHaveBeenCalled()
    rerender(<Surface surface="one" enabled />)
    expect(animate).toHaveBeenCalledOnce()
    const animation = animate.mock.results[0].value
    const cancel = vi.spyOn(animation, 'cancel')
    rerender(<Surface surface="two" enabled={false} />)
    expect(cancel).toHaveBeenCalledOnce()
    expect(animate).toHaveBeenCalledOnce()
    rerender(<Surface surface="two" enabled />)
    expect(animate).toHaveBeenCalledTimes(2)
    rerender(<Surface surface="two" enabled />)
    expect(animate).toHaveBeenCalledTimes(2)
  })

  it('keeps reduced-motion surfaces static even under StrictMode', () => {
    const animate = vi.spyOn(HTMLElement.prototype, 'animate')
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true)
    })
    render(
      <StrictMode>
        <Surface surface="one" enabled />
      </StrictMode>
    )
    expect(animate).not.toHaveBeenCalled()
  })
})
