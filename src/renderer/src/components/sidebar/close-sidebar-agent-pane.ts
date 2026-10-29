import { useAppStore } from '@/store'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { toHostSessionTabId } from '../../../../shared/terminal-surface-id'
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
  const environmentId = runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), worktreeId)
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
