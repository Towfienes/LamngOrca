/**
 * Deck build switch for the experimental agent-sleep (hibernation) coordinator.
 *
 * Why a build-level switch instead of only the persisted setting: the coordinator parks
 * idle agent terminals on a timer, and this build is not tuned for it — a stored
 * `experimentalAgentHibernation: true` would otherwise bring it back on the next launch
 * with no visible toggle to turn off. `DECK_AGENT_HIBERNATION_DISABLED = true` keeps the
 * coordinator unmounted and hides the Agent sleep section, so no stored value can start it.
 */
export const DECK_AGENT_HIBERNATION_DISABLED = true

/** Single decision point shared by the gate and its regression test. */
export function isAgentHibernationCoordinatorEnabled(settingEnabled: boolean | undefined): boolean {
  return !DECK_AGENT_HIBERNATION_DISABLED && settingEnabled === true
}
