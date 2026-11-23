import { useSyncExternalStore } from 'react'

let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

/** Callback ref for the Usage panel footer that hosts system status while the panel is mounted. */
export function setDeckUsageStatusSlot(node: HTMLElement | null): void {
  if (slot === node) {
    return
  }
  slot = node
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDeckUsageStatusSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slot)
}
