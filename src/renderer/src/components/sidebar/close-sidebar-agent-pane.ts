import { useAppStore } from '@/store'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { toHostSessionTabId } from '@/runtime/web-terminal-surface-id'
import { makePaneKey, parsePaneKey } from '../../../../shared/stable-pane-id'
import type {
  RuntimeTerminalClose,
  RuntimeTerminalResolvePane
} from '../../../../shared/runtime-terminal-contracts'

export async function closeSidebarAgentPane(worktreeId: string, paneKey: string): Promise<void> {
  const pane = parsePaneKey(paneKey)
  if (!pane) {
    throw new Error('This agent has no terminal pane to close.')
  }
  const environmentId = getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
  const target: RuntimeClientTarget = environmentId
    ? { kind: 'environment', environmentId }
    : { kind: 'local' }
  const options = environmentId
    ? {
        expectedEnvironmentPairingRevision: captureRuntimeEnvironmentRequestRevision(environmentId)
      }
    : {}
  const { terminal } = await callRuntimeRpc<{ terminal: RuntimeTerminalResolvePane }>(
    target,
    'terminal.resolvePane',
    { paneKey: makePaneKey(toHostSessionTabId(pane.tabId), pane.leafId), worktreeId },
    options
  )
  const { close } = await callRuntimeRpc<{ close: RuntimeTerminalClose }>(
    target,
    'terminal.close',
    { terminal: terminal.handle },
    options
  )
  if (close.ptyStopVerdict) {
    throw new Error(close.ptyStopReason ?? `Agent terminal is ${close.ptyStopVerdict}.`)
  }
}
