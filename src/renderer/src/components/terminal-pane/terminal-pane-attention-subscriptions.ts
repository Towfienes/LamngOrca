import { useAppStore } from '@/store'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../shared/agent-status-types'
import { isExplicitAgentStatusFresh } from '@/lib/agent-status'

type TerminalPaneAttentionListener = () => void

type TerminalPaneAttentionState = ReturnType<typeof useAppStore.getState>

const listenersByTabId = new Map<string, Set<TerminalPaneAttentionListener>>()
let unsubscribeStore: (() => void) | null = null
let previousUnreadTerminalPanes: TerminalPaneAttentionState['unreadTerminalPanes'] | null = null
let previousAttentionEnabled = false
let previousAgentEpoch = 0
let previousAgentStatuses: TerminalPaneAttentionState['agentStatusByPaneKey'] | null = null

function isWaitingForUser(
  entry: TerminalPaneAttentionState['agentStatusByPaneKey'][string] | undefined
): boolean {
  return (
    entry?.state === 'waiting' &&
    !entry.restoredUnconfirmed &&
    isExplicitAgentStatusFresh(entry, Date.now(), AGENT_STATUS_STALE_AFTER_MS)
  )
}

function isTerminalAttentionEnabled(state: TerminalPaneAttentionState): boolean {
  return state.settings?.experimentalTerminalAttention === true
}

function tabIdFromPaneKey(paneKey: string): string | null {
  const delimiter = paneKey.indexOf(':')
  if (delimiter <= 0) {
    return null
  }
  return paneKey.slice(0, delimiter)
}

function notifyTab(tabId: string): void {
  const listeners = listenersByTabId.get(tabId)
  if (!listeners) {
    return
  }
  for (const listener of Array.from(listeners)) {
    listener()
  }
}

function notifyAllTabs(): void {
  for (const tabId of listenersByTabId.keys()) {
    notifyTab(tabId)
  }
}

function collectChangedTabs(
  previous: TerminalPaneAttentionState['unreadTerminalPanes'],
  next: TerminalPaneAttentionState['unreadTerminalPanes']
): Set<string> {
  const changed = new Set<string>()
  for (const paneKey of Object.keys(previous)) {
    if (!next[paneKey]) {
      const tabId = tabIdFromPaneKey(paneKey)
      if (tabId) {
        changed.add(tabId)
      }
    }
  }
  for (const paneKey of Object.keys(next)) {
    if (!previous[paneKey]) {
      const tabId = tabIdFromPaneKey(paneKey)
      if (tabId) {
        changed.add(tabId)
      }
    }
  }
  return changed
}

function ensureStoreSubscription(): void {
  if (unsubscribeStore !== null) {
    return
  }
  const initial = useAppStore.getState()
  previousUnreadTerminalPanes = initial.unreadTerminalPanes
  previousAttentionEnabled = isTerminalAttentionEnabled(initial)
  previousAgentEpoch = initial.agentStatusEpoch
  previousAgentStatuses = initial.agentStatusByPaneKey
  unsubscribeStore = useAppStore.subscribe((state) => {
    const freshnessChanged = state.agentStatusEpoch !== previousAgentEpoch
    previousAgentEpoch = state.agentStatusEpoch
    const statusesChanged = state.agentStatusByPaneKey !== previousAgentStatuses
    const nextUnreadTerminalPanes = state.unreadTerminalPanes
    const nextAttentionEnabled = isTerminalAttentionEnabled(state)
    const attentionChanged = nextAttentionEnabled !== previousAttentionEnabled
    const unreadChanged = nextUnreadTerminalPanes !== previousUnreadTerminalPanes
    if (!attentionChanged && !unreadChanged && !statusesChanged && !freshnessChanged) {
      return
    }

    const changedTabs =
      unreadChanged && previousUnreadTerminalPanes
        ? collectChangedTabs(previousUnreadTerminalPanes, nextUnreadTerminalPanes)
        : new Set<string>()

    previousUnreadTerminalPanes = nextUnreadTerminalPanes
    previousAttentionEnabled = nextAttentionEnabled
    if (statusesChanged) {
      for (const tabId of listenersByTabId.keys()) {
        const leaves = state.terminalLayoutsByTabId?.[tabId]?.ptyIdsByLeafId ?? {}
        for (const leafId of Object.keys(leaves)) {
          const paneKey = makePaneKey(tabId, leafId)
          if (
            isWaitingForUser(state.agentStatusByPaneKey?.[paneKey]) !==
            isWaitingForUser(previousAgentStatuses?.[paneKey])
          ) {
            changedTabs.add(tabId)
            break
          }
        }
      }
      previousAgentStatuses = state.agentStatusByPaneKey
    }

    if (attentionChanged || freshnessChanged) {
      notifyAllTabs()
      return
    }
    for (const tabId of changedTabs) {
      if (nextAttentionEnabled || statusesChanged) {
        notifyTab(tabId)
      }
    }
  })
}

export function subscribeTerminalPaneAttention(
  tabId: string,
  listener: TerminalPaneAttentionListener
): () => void {
  ensureStoreSubscription()
  let listeners = listenersByTabId.get(tabId)
  if (!listeners) {
    listeners = new Set()
    listenersByTabId.set(tabId, listeners)
  }
  listeners.add(listener)
  return () => {
    const current = listenersByTabId.get(tabId)
    if (!current) {
      return
    }
    current.delete(listener)
    if (current.size === 0) {
      listenersByTabId.delete(tabId)
    }
    if (listenersByTabId.size === 0 && unsubscribeStore !== null) {
      unsubscribeStore()
      unsubscribeStore = null
      previousUnreadTerminalPanes = null
      previousAttentionEnabled = false
      previousAgentStatuses = null
    }
  }
}

export function applyTerminalPaneAttentionToManager(manager: PaneManager, tabId: string): void {
  const state = useAppStore.getState()
  const enabled = isTerminalAttentionEnabled(state)
  const unreadTerminalPanes = state.unreadTerminalPanes
  for (const pane of manager.getPanes()) {
    const paneKey = makePaneKey(tabId, pane.leafId)
    if (isWaitingForUser(state.agentStatusByPaneKey?.[paneKey])) {
      pane.container.setAttribute('data-agent-waiting', '')
    } else {
      pane.container.removeAttribute('data-agent-waiting')
    }
    if (enabled && unreadTerminalPanes[paneKey]) {
      pane.container.setAttribute('data-terminal-attention', '')
    } else {
      pane.container.removeAttribute('data-terminal-attention')
    }
  }
}

export function resetTerminalPaneAttentionSubscriptionsForTests(): void {
  unsubscribeStore?.()
  unsubscribeStore = null
  listenersByTabId.clear()
  previousUnreadTerminalPanes = null
  previousAttentionEnabled = false
  previousAgentStatuses = null
}
