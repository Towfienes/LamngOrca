import { app } from 'electron'
import { resolveLinuxPasswordStore } from './linux-keyring-backend-selection'
import { probeSecretServiceCollection } from './linux-secret-service-probe'
import type { SecretServiceCollectionState } from './linux-keyring-backend-selection'

const UNLOCK_WAIT_MS = 4_000
const UNLOCK_POLL_MS = 400

/** A desktop that unlocks the login keyring at its lock screen may start Orca in the same instant;
 *  a short wait keeps OS-sealed secrets for that whole run instead of falling back to basic_text. */
export function waitForUnlockedCollection(
  probe: () => SecretServiceCollectionState = probeSecretServiceCollection,
  deadline = Date.now() + UNLOCK_WAIT_MS,
  sleep: (ms: number) => void = (ms) =>
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
): SecretServiceCollectionState {
  let state = probe()
  while (state === 'locked' && Date.now() < deadline) {
    sleep(UNLOCK_POLL_MS)
    state = probe()
  }
  return state
}

/** Select Linux credentials before ready/safeStorage fixes os_crypt config; otherwise the requested backend is ignored (#21827). */
export function selectLinuxKeyringBackend(
  log: (message: string) => void = (message) => console.log(message)
): void {
  if (process.platform !== 'linux') {
    return
  }
  const decision = resolveLinuxPasswordStore({
    env: process.env,
    passwordStoreAlreadySelected:
      app.commandLine.hasSwitch('password-store') ||
      process.argv.some((argument) => argument.startsWith('--password-store')),
    probeCollection: () => waitForUnlockedCollection()
  })
  if (!decision.store) {
    return
  }
  app.commandLine.appendSwitch('password-store', decision.store)
  // Log actual backend changes only; ordinary no-op launches would add noise.
  log(`[secrets] selected --password-store=${decision.store}: ${decision.reason}`)
}
