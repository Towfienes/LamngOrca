import {
  normalizeAgentStatusPayload,
  type AgentStatusState,
  type AgentWorkingMode,
  type ParsedAgentStatusPayload
} from '../../agent-status-types'
import { claudeRosterToSnapshots } from '../../claude-subagent-roster'
import { resolvePrompt, resolveToolState } from '../prompt-fields'
import { extractToolFields, isNewTurnEvent } from '../provider-event-routing'
import type { HookListenerState } from '../listener-state'
import { mainAgentTurnInterrupted } from '../../agent-lead-status-fold'
import { claudeMainAgentStatusForPayload } from './claude-roster-state'
import { readString } from '../tool-input-preview'
import { record } from '../../codex-rollout-jsonl-cursor'
import { readLastTextFromTranscriptOnce } from '../transcript-reader'
import { extractClaudeAssistantModelFromLine } from '../transcript-entry-text'

export function buildClaudeStatusPayload(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>,
  options: {
    stateName: AgentStatusState
    workingMode?: AgentWorkingMode
    updateToolSnapshot: boolean
    sessionBoundary?: boolean
    claudeTaskWakeupPending?: ParsedAgentStatusPayload['claudeTaskWakeupPending']
  }
): ParsedAgentStatusPayload | null {
  // Roster refreshes read cached tool state without clearing live cards or previews.
  const snapshot = options.updateToolSnapshot
    ? resolveToolState(state, paneKey, extractToolFields('claude', eventName, hookPayload), {
        resetOnNewTurn: isNewTurnEvent('claude', eventName)
      })
    : (state.lastToolByPaneKey.get(paneKey) ?? {})

  // Read mainAgent/verdict/turn stamp from one lead record; keep interruption there while child-held rows omit it.
  const mainAgentRecord = state.claudeLeadStateByPaneKey.get(paneKey)
  const previous = state.lastStatusByPaneKey.get(paneKey)
  const sameSession =
    previous?.payload.agentType === 'claude' &&
    previous.providerSession?.id === readString(hookPayload, 'session_id')
  const child = Boolean(readString(hookPayload, 'agent_id'))
  const effort = record(hookPayload.effort)
  const hookModel = child ? undefined : readString(hookPayload, 'model')
  const knownModel =
    hookModel ?? (eventName !== 'SessionStart' && sameSession ? previous?.payload.model : undefined)
  const transcriptPath =
    !child && !knownModel && (eventName === 'PostToolUse' || eventName === 'Stop')
      ? readString(hookPayload, 'transcript_path')
      : undefined
  // Older sessions may have missed SessionStart; read the actual root response, never global defaults.
  const model =
    knownModel ??
    (transcriptPath
      ? readLastTextFromTranscriptOnce(transcriptPath, extractClaudeAssistantModelFromLine)
      : undefined)
  // Validate directly to avoid hot-path stringify/parse overhead.
  return normalizeAgentStatusPayload({
    state: options.stateName,
    workingMode: options.workingMode,
    claudeTaskWakeupPending: options.claudeTaskWakeupPending,
    // Only lead events reset prompt labels; child refreshes retain them.
    prompt: resolvePrompt(state, paneKey, promptText, {
      resetOnNewTurn: options.updateToolSnapshot && isNewTurnEvent('claude', eventName)
    }),
    agentType: 'claude',
    model,
    reasoningEffort:
      (child ? undefined : readString(effort ?? hookPayload, effort ? 'level' : 'effort')) ??
      (eventName !== 'SessionStart' &&
      sameSession &&
      (!readString(hookPayload, 'model') ||
        readString(hookPayload, 'model') === previous?.payload.model)
        ? previous?.payload.reasoningEffort
        : undefined),
    toolName: snapshot.toolName,
    toolInput: snapshot.toolInput,
    interactivePrompt: snapshot.interactivePrompt,
    lastAssistantMessage: snapshot.lastAssistantMessage,
    lastAssistantMessageIsToolOutput: snapshot.lastAssistantMessageIsToolOutput,
    interrupted: mainAgentTurnInterrupted(mainAgentRecord),
    sessionBoundary: options.sessionBoundary,
    turnCompletedAt: mainAgentRecord?.turnCompletedAt,
    subagents: claudeRosterToSnapshots(state.claudeSubagentRosterByPaneKey.get(paneKey)),
    mainAgent: mainAgentRecord ? claudeMainAgentStatusForPayload(mainAgentRecord) : undefined
  })
}
