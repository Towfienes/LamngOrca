import { recognizeAgentProcess } from '../../../../shared/agent-process-recognition'
import { isRemoteExecutionHostPtyId } from '../../../../shared/remote-execution-host-pty-id'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalStoreGet } from './terminal-state'
import { createPaneForegroundProcessReader } from '@/components/terminal-pane/pane-foreground-process-reader'

/** Inspect saved local panes once without mounting xterm or resizing their PTYs. */
export async function restoreWorkspacePaneIdentities(
  get: TerminalStoreGet,
  workspaceKeys: readonly string[],
  signal?: AbortSignal
): Promise<void> {
  const state = get()
  const panes = workspaceKeys.flatMap((workspaceKey) =>
    (state.tabsByWorktree[workspaceKey] ?? []).flatMap((tab) =>
      Object.entries(state.terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {}).flatMap(
        ([leafId, ptyId]) => {
          if (!isTerminalLeafId(leafId)) {
            return []
          }
          const paneKey = makePaneKey(tab.id, leafId)
          // Remote identity needs an attached incarnation; its host snapshot remains authoritative.
          if (
            !state.ptyIdsByTabId[tab.id]?.includes(ptyId) ||
            isRemoteExecutionHostPtyId(ptyId) ||
            state.agentStatusByPaneKey[paneKey]?.agentType ||
            state.paneForegroundAgentByPaneKey[paneKey]
          ) {
            return []
          }
          return [{ tabId: tab.id, leafId, ptyId, paneKey }]
        }
      )
    )
  )
  if (panes.length === 0 || signal?.aborted) {
    return
  }
  // Inventory waits for daemon handoff; inspection's hasPty guard only knows attached panes.
  const liveIds = new Set(
    (await window.api.pty.listSessions({ connectionId: null })).map((session) => session.id)
  )
  let next = 0
  const readProcess = createPaneForegroundProcessReader({
    readForegroundProcess: (id) => window.api.pty.getForegroundProcess(id)
  })
  const inspect = async (): Promise<void> => {
    while (!signal?.aborted) {
      const pane = panes[next++]
      if (!pane) {
        return
      }
      if (!liveIds.has(pane.ptyId)) {
        continue
      }
      try {
        const { processName } = await readProcess(pane.ptyId, false)
        const current = get()
        if (
          signal?.aborted ||
          current.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId] !==
            pane.ptyId ||
          !current.ptyIdsByTabId[pane.tabId]?.includes(pane.ptyId) ||
          current.paneForegroundAgentByPaneKey[pane.paneKey] ||
          current.agentStatusByPaneKey[pane.paneKey]?.agentType
        ) {
          continue
        }
        const recognized = recognizeAgentProcess(processName)
        if (recognized) {
          current.setPaneForegroundAgent(pane.paneKey, {
            agent: recognized.agent,
            agentEvidence: 'process-read',
            shellForeground: false
          })
        }
      } catch {
        // No response is not exit evidence; leave the saved pane and host status intact.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, panes.length) }, inspect))
}
