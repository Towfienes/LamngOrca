import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readAntigravityMacOSCredential,
  writeAntigravityMacOSCredential
} from './native-macos-credentials'
import type { AntigravityCredentialBackend } from './native-account-service'
import { createAntigravityLinuxCredentialBackend } from './native-linux-credentials'
import {
  createAntigravityWindowsCredentialBackend,
  getAntigravityWindowsHome
} from './native-windows-credentials'
import {
  createAntigravityFileCredentialBackend,
  isAntigravityFileStorageHost
} from './native-file-credentials'
export {
  createAntigravityFileCredentialBackend,
  isAntigravityFileStorageHost
} from './native-file-credentials'

const CONFLICT =
  'The native Antigravity credential changed during selection; refresh before retrying.'

export function createAntigravityHostCredentialBackend(home: string): AntigravityCredentialBackend {
  if (process.platform === 'win32') {
    return createAntigravityWindowsCredentialBackend(getAntigravityWindowsHome(process.env))
  }
  const root = join(home, '.gemini', 'antigravity-cli')
  const file = createAntigravityFileCredentialBackend(join(root, 'antigravity-oauth-token'))
  let kernelRelease = ''
  if (process.platform === 'linux') {
    try {
      kernelRelease = readFileSync('/proc/sys/kernel/osrelease', 'utf8')
    } catch {}
  }
  if (isAntigravityFileStorageHost(process.env, kernelRelease)) {
    return file
  }
  const marker = join(root, 'cache', 'antigravity-keyring-unavailable')
  if (process.platform === 'linux') {
    return createAntigravityLinuxCredentialBackend(marker)
  }
  if (process.platform !== 'darwin') {
    throw new Error('Native Antigravity account switching is not supported on this host yet.')
  }
  async function read() {
    if (existsSync(marker)) {
      throw new Error(
        'Antigravity has a keyring fallback marker; Orca cannot verify which credential store agy will use.'
      )
    }
    return (await readAntigravityMacOSCredential()) ?? (await file.read())
  }
  return {
    read,
    async write(contents, expected) {
      if ((await read())?.contents !== (expected ?? undefined)) {
        throw new Error(CONFLICT)
      }
      const native = await readAntigravityMacOSCredential()
      if (existsSync(marker)) {
        throw new Error(CONFLICT)
      }
      if (native) {
        if (native.contents !== expected) {
          throw new Error(CONFLICT)
        }
        await writeAntigravityMacOSCredential(contents)
      } else {
        await file.write(contents, expected)
      }
      if ((await read())?.contents !== contents) {
        throw new Error(CONFLICT)
      }
    }
  }
}
