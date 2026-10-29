import {
  AGENT_MODEL_MAX_LENGTH,
  normalizeAgentStatusPayload,
  type ParsedAgentStatusPayload
} from '../../agent-status-types'
import { normalizeOptionalField } from '../../agent-status-field-normalization'
import { record } from '../../codex-rollout-jsonl-cursor'
import type { AgentHookEventPayload } from '../listener-event'
import { readString } from '../tool-input-preview'

/** A root session's PostModelSwitch updates its model/effort; it never announces a turn ending. */
export function normalizeClaudeModelSwitch(
  previous: AgentHookEventPayload | undefined,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  const model = normalizeOptionalField(hookPayload.to_model, AGENT_MODEL_MAX_LENGTH)
  if (
    readString(hookPayload, 'agent_id') ||
    !model ||
    previous?.payload.agentType !== 'claude' ||
    !previous.providerSession?.id ||
    previous.providerSession.id !== readString(hookPayload, 'session_id')
  ) {
    return null
  }
  return normalizeAgentStatusPayload({
    ...previous.payload,
    model,
    reasoningEffort: normalizeOptionalField(
      record(hookPayload.effort)?.level ?? hookPayload.effort,
      AGENT_MODEL_MAX_LENGTH
    ),
    sessionBoundary: true
  })
}
