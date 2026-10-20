// @vitest-environment happy-dom
import type * as ReactModule from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTerminalFontZoom } from './useTerminalFontZoom'

const mocks = vi.hoisted(() => ({
  captureScrollState: vi.fn(() => ({ wasAtBottom: true })),
  restoreScrollState: vi.fn(),
  safeFit: vi.fn(),
  dispatchZoomLevelChanged: vi.fn(),
  unsubscribe: vi.fn(),
  cleanups: new Array<() => void>()
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>()
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect()
      if (cleanup) {
        mocks.cleanups.push(cleanup)
      }
    }
  }
})

vi.mock('@/lib/pane-manager/pane-tree-ops', () => ({
  captureScrollState: mocks.captureScrollState,
  restoreScrollState: mocks.restoreScrollState,
  safeFit: mocks.safeFit
}))

vi.mock('@/lib/zoom-events', () => ({
  dispatchZoomLevelChanged: mocks.dispatchZoomLevelChanged
}))

describe('useTerminalFontZoom', () => {
  let terminalZoomListeners: ((direction: 'in' | 'out' | 'reset') => void)[]
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    mocks.cleanups.forEach((cleanup) => cleanup())
    terminalZoomListeners = []
    frames = []
    mocks.cleanups = []
    document.body.replaceChildren()
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: {
          onTerminalZoom: vi.fn((listener: (direction: 'in' | 'out' | 'reset') => void) => {
            terminalZoomListeners.push(listener)
            return mocks.unsubscribe
          })
        }
      }
    })
  })

  function useMountedTerminalFontZoom(activeElement: HTMLElement): {
    terminal: { options: { fontSize?: number } }
    container: HTMLElement
    secondContainer: HTMLElement
    secondTerminal: { options: { fontSize?: number } }
    listener: (direction: 'in' | 'out' | 'reset') => void
  } {
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.appendChild(activeElement)
    activeElement.focus()
    const terminal = { options: { fontSize: 14 } }
    const secondTerminal = { options: { fontSize: 14 } }
    const secondContainer = document.createElement('div')
    container.appendChild(secondContainer)
    useTerminalFontZoom({
      isActive: true,
      containerRef: { current: container },
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fixture exposes the only manager methods read here; fitting is mocked.
      managerRef: {
        current: {
          getActivePane: () => ({ id: 1, terminal }),
          getPanes: () => [
            { id: 1, terminal, container: activeElement },
            { id: 2, terminal: secondTerminal, container: secondContainer }
          ]
        }
      } as never,
      paneFontSizesRef: { current: new Map() },
      settingsRef: { current: { terminalFontSize: 14 } }
    })
    const listener = terminalZoomListeners.at(-1)
    expect(listener).toBeTypeOf('function')
    if (!listener) {
      throw new Error('Missing zoom listener')
    }
    return {
      terminal,
      container,
      secondContainer,
      secondTerminal,
      listener
    }
  }

  function wheelEvent(init: WheelEventInit): WheelEvent {
    const event = new WheelEvent('wheel', init)
    // Happy DOM's WheelEvent omits modifier keys.
    Object.defineProperty(event, 'ctrlKey', { value: init.ctrlKey ?? false })
    return event
  }

  function flushFrame(): void {
    frames.splice(0).forEach((callback) => callback(0))
  }

  it('zooms only the pane under the pointer without changing keyboard focus', () => {
    const input = document.createElement('textarea')
    input.className = 'xterm-helper-textarea'
    const { terminal, secondTerminal, secondContainer } = useMountedTerminalFontZoom(input)
    const normalWheel = wheelEvent({ deltaY: -100, bubbles: true, cancelable: true })
    secondContainer.dispatchEvent(normalWheel)
    expect(normalWheel.defaultPrevented).toBe(false)
    const wheel = wheelEvent({
      ctrlKey: true,
      deltaY: -100,
      bubbles: true,
      cancelable: true
    })
    secondContainer.dispatchEvent(wheel)
    flushFrame()
    expect(wheel.defaultPrevented).toBe(true)
    expect(terminal.options.fontSize).toBe(14)
    expect(secondTerminal.options.fontSize).toBe(15)
    expect(document.activeElement).toBe(input)
  })

  it('accumulates small pinch deltas and fits only once per frame', () => {
    const { secondContainer, secondTerminal } = useMountedTerminalFontZoom(
      document.createElement('button')
    )
    for (let i = 0; i < 10; i++) {
      secondContainer.dispatchEvent(wheelEvent({ ctrlKey: true, deltaY: -10, bubbles: true }))
    }
    expect(frames).toHaveLength(1)
    flushFrame()
    expect(secondTerminal.options.fontSize).toBe(15)
    expect(mocks.safeFit).toHaveBeenCalledTimes(1)
  })

  it('normalizes line wheels, enforces font bounds and preserves keyboard reset', () => {
    const helper = document.createElement('textarea')
    helper.className = 'xterm-helper-textarea'
    const { listener, terminal, secondContainer, secondTerminal } =
      useMountedTerminalFontZoom(helper)
    secondContainer.dispatchEvent(
      wheelEvent({ ctrlKey: true, deltaY: 3, deltaMode: 1, bubbles: true })
    )
    flushFrame()
    expect(secondTerminal.options.fontSize).toBe(13)
    for (let i = 0; i < 50; i++) {
      listener('in')
    }
    expect(terminal.options.fontSize).toBe(32)
    for (let i = 0; i < 50; i++) {
      listener('out')
    }
    expect(terminal.options.fontSize).toBe(8)
    listener('reset')
    expect(terminal.options.fontSize).toBe(14)
  })

  it('removes its wheel listener and cancels pending work when unmounted', () => {
    const { secondContainer, secondTerminal } = useMountedTerminalFontZoom(
      document.createElement('button')
    )
    secondContainer.dispatchEvent(wheelEvent({ ctrlKey: true, deltaY: -100, bubbles: true }))
    mocks.cleanups.forEach((cleanup) => cleanup())
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
    frames = []
    secondContainer.dispatchEvent(wheelEvent({ ctrlKey: true, deltaY: -100, bubbles: true }))
    expect(frames).toHaveLength(0)
    expect(secondTerminal.options.fontSize).toBe(14)
  })

  it('ignores zoom events when terminal input no longer owns focus', () => {
    const button = document.createElement('button')
    const { listener, terminal } = useMountedTerminalFontZoom(button)

    listener('in')

    expect(terminal.options.fontSize).toBe(14)
    expect(mocks.safeFit).not.toHaveBeenCalled()
    expect(mocks.dispatchZoomLevelChanged).not.toHaveBeenCalled()
  })

  it('applies terminal font zoom while the xterm helper textarea owns focus', () => {
    const helper = document.createElement('textarea')
    helper.className = 'xterm-helper-textarea'
    const { listener, terminal } = useMountedTerminalFontZoom(helper)

    listener('in')

    expect(terminal.options.fontSize).toBe(15)
    expect(mocks.safeFit).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchZoomLevelChanged).toHaveBeenCalledWith('terminal', 107)
  })

  it('only lets the pane owning the focused helper apply terminal font zoom', () => {
    const inactiveContainer = document.createElement('div')
    const activeContainer = document.createElement('div')
    const focusedHelper = document.createElement('textarea')
    focusedHelper.className = 'xterm-helper-textarea'
    document.body.append(inactiveContainer, activeContainer)
    activeContainer.appendChild(focusedHelper)
    focusedHelper.focus()

    const inactiveTerminal = { options: { fontSize: 14 } }
    const activeTerminal = { options: { fontSize: 14 } }
    useTerminalFontZoom({
      isActive: true,
      containerRef: { current: inactiveContainer },
      managerRef: {
        current: {
          getActivePane: () => ({ id: 1, terminal: inactiveTerminal })
        }
      } as never,
      paneFontSizesRef: { current: new Map() },
      settingsRef: { current: { terminalFontSize: 14 } }
    })
    useTerminalFontZoom({
      isActive: true,
      containerRef: { current: activeContainer },
      managerRef: {
        current: {
          getActivePane: () => ({ id: 2, terminal: activeTerminal })
        }
      } as never,
      paneFontSizesRef: { current: new Map() },
      settingsRef: { current: { terminalFontSize: 14 } }
    })

    for (const listener of terminalZoomListeners) {
      listener('in')
    }

    expect(inactiveTerminal.options.fontSize).toBe(14)
    expect(activeTerminal.options.fontSize).toBe(15)
    expect(mocks.safeFit).toHaveBeenCalledTimes(1)
  })
})
