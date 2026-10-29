import { useEffect } from 'react'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import { dispatchZoomLevelChanged } from '@/lib/zoom-events'
import { safeFit } from '@/lib/pane-manager/pane-tree-ops'
import { overridePendingPaneMetricOptions } from '@/lib/pane-manager/pane-metric-options-deferral'
import { getPaneOwnedActiveHelperTextarea } from './regular-terminal-focus-ownership'

type FontZoomDeps = {
  isActive: boolean
  containerRef: React.RefObject<HTMLElement | null>
  managerRef: React.RefObject<PaneManager | null>
  paneFontSizesRef: React.RefObject<Map<number, number>>
  settingsRef: React.RefObject<{ terminalFontSize?: number } | null>
}

export function useTerminalFontZoom({
  isActive,
  containerRef,
  managerRef,
  paneFontSizesRef,
  settingsRef
}: FontZoomDeps): void {
  useEffect(() => {
    if (!isActive) {
      return
    }
    const MIN_FONT_SIZE = 8
    const MAX_FONT_SIZE = 32
    const FONT_SIZE_STEP = 1

    const zoom = (pane: ManagedPane, steps: number | 'reset'): void => {
      const globalSize = settingsRef.current?.terminalFontSize ?? 14
      const currentSize = paneFontSizesRef.current.get(pane.id) ?? globalSize

      let nextSize: number
      if (steps === 'reset') {
        nextSize = globalSize
        paneFontSizesRef.current.delete(pane.id)
      } else {
        nextSize = Math.max(
          MIN_FONT_SIZE,
          Math.min(MAX_FONT_SIZE, currentSize + steps * FONT_SIZE_STEP)
        )
        paneFontSizesRef.current.set(pane.id, nextSize)
      }
      if (pane.terminal.options.fontSize === nextSize) {
        return
      }
      pane.terminal.options.fontSize = nextSize
      // Fold zoom into parked metrics before safeFit flushes them, or the captured font size overwrites it.
      overridePendingPaneMetricOptions(pane, { fontSize: nextSize })
      safeFit(pane)

      const percent = Math.round((nextSize / globalSize) * 100)
      dispatchZoomLevelChanged('terminal', percent)
    }
    const unsubscribe = window.api.ui.onTerminalZoom((direction) => {
      const container = containerRef.current
      if (!container || !getPaneOwnedActiveHelperTextarea(container, document.activeElement)) {
        return
      }
      const pane = managerRef.current?.getActivePane()
      if (pane) {
        zoom(pane, direction === 'reset' ? 'reset' : direction === 'in' ? 1 : -1)
      }
    })

    const container = containerRef.current
    let pendingPane: ManagedPane | undefined
    let distance = 0
    let frame: number | null = null
    const onWheel = (event: WheelEvent): void => {
      if (
        !event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        !Number.isFinite(event.deltaY) ||
        event.deltaY === 0 ||
        !(event.target instanceof Node)
      ) {
        return
      }
      const target = event.target
      const pane = managerRef.current?.getPanes().find((pane) => pane.container.contains(target))
      if (!pane) {
        return
      }
      // Chromium delivers trackpad pinch through the same Ctrl-wheel route.
      event.preventDefault()
      event.stopPropagation()
      if (pendingPane?.id !== pane.id) {
        distance = 0
      }
      pendingPane = pane
      distance -=
        event.deltaMode === 0
          ? event.deltaY
          : event.deltaMode === 1
            ? (event.deltaY * 100) / 3
            : Math.sign(event.deltaY) * 100
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null
          const steps = Math.max(-3, Math.min(3, Math.trunc(distance / 100)))
          distance %= 100
          if (
            pendingPane &&
            steps &&
            managerRef.current?.getPanes().some((pane) => pane.id === pendingPane?.id)
          ) {
            zoom(pendingPane, steps)
          }
        })
      }
    }
    container?.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      unsubscribe()
      container?.removeEventListener('wheel', onWheel, true)
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
    }
  }, [containerRef, isActive, managerRef, paneFontSizesRef, settingsRef])
}
