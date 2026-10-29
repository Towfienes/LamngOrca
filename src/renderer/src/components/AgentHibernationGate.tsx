import { useEffect } from 'react'
import { useAppStore } from '@/store'
import {
  startAgentHibernationCoordinator,
  stopAgentHibernationCoordinator
} from '@/lib/agent-hibernation-coordinator'
import { isAgentHibernationCoordinatorEnabled } from '@/lib/deck-agent-hibernation-switch'

export function AgentHibernationGate(): null {
  const settingEnabled = useAppStore(
    (state) => state.settings?.experimentalAgentHibernation === true
  )
  // Why: the Deck switch outranks the stored setting, so a profile that still carries
  // `experimentalAgentHibernation: true` cannot restart the coordinator.
  const enabled = isAgentHibernationCoordinatorEnabled(settingEnabled)

  useEffect(() => {
    if (!enabled) {
      stopAgentHibernationCoordinator()
      return
    }
    return startAgentHibernationCoordinator()
  }, [enabled])

  return null
}
