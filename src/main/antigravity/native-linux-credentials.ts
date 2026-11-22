import { existsSync } from 'node:fs'
import { runProcess } from '@orca/process-host'
import {
  decodeAntigravityKeychainValue,
  parseAntigravityNativeCredential,
  type AntigravityNativeCredential
} from './native-credential-codec'
import type { AntigravityCredentialBackend } from './native-account-service'

const CONFLICT =
  'The native Antigravity credential changed during selection; refresh before retrying.'

// agy (go-keyring) reads and writes the Secret Service "login" collection, falling back to the
// default alias. `secret-tool` cannot pick a collection, and a stale copy in another collection
// would be read instead, so this talks to libsecret directly and refuses ambiguous matches.
const HELPER = String.raw`
import sys
try:
    import gi
    gi.require_version('Secret', '1')
    from gi.repository import Secret
except Exception:
    sys.exit(3)
op, service, user = sys.argv[1:4]
try:
    svc = Secret.Service.get_sync(Secret.ServiceFlags.OPEN_SESSION | Secret.ServiceFlags.LOAD_COLLECTIONS, None)
    cols = {c.get_object_path(): c for c in (svc.get_collections() or [])}
    col = cols.get('/org/freedesktop/secrets/collection/login') or Secret.Collection.for_alias_sync(svc, 'default', Secret.CollectionFlags.NONE, None)
    if col is None:
        sys.exit(44 if op == 'read' else 4)
    attrs = {'service': service, 'username': user}
    items = col.search_sync(None, attrs, Secret.SearchFlags.ALL | Secret.SearchFlags.UNLOCK | Secret.SearchFlags.LOAD_SECRETS, None) or []
    if len(items) > 1:
        sys.exit(5)
    if op == 'read':
        if not items:
            sys.exit(44)
        value = items[0].get_secret()
        text = value.get_text() if value is not None else None
        if text is None:
            sys.exit(6)
        sys.stdout.write(text)
    elif op == 'clear':
        if items:
            items[0].delete_sync(None)
    elif op == 'write':
        data = sys.stdin.read()
        label = "Password for '%s' on '%s'" % (user, service)
        Secret.Item.create_sync(col, None, attrs, label, Secret.Value.new(data, -1, 'text/plain; charset=utf8'), Secret.ItemCreateFlags.REPLACE, None)
    else:
        sys.exit(2)
except SystemExit:
    raise
except Exception:
    sys.exit(4)
`

const EXIT_MESSAGES: Record<number, string> = {
  3: 'Antigravity account switching on Linux needs libsecret for Python (python3-gi with the Secret typelib).',
  5: 'More than one Antigravity credential exists in the Secret Service login collection; remove the duplicate before switching accounts.',
  6: 'The Antigravity credential in the Secret Service is not readable text.'
}

type Runner = typeof runProcess
export type AntigravityLinuxCredentialTarget = { service: string; account: string }
const nativeTarget: AntigravityLinuxCredentialTarget = { service: 'gemini', account: 'antigravity' }

function python(): string {
  return existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3'
}

async function runHelper(
  run: Runner,
  op: 'read' | 'write' | 'clear',
  target: AntigravityLinuxCredentialTarget,
  input?: string
) {
  try {
    return await run({
      program: python(),
      args: ['-I', '-c', HELPER, op, target.service, target.account],
      input,
      // Unlocking the keyring may show a desktop prompt.
      timeoutMs: 60_000,
      maxOutputBytes: 128 * 1024
    })
  } catch {
    // Child-process errors may embed credential-bearing output.
    throw new Error('The Antigravity Linux credential store could not be accessed.')
  }
}

export async function readAntigravityLinuxCredential(
  target = nativeTarget,
  run: Runner = runProcess
): Promise<AntigravityNativeCredential | null> {
  const result = await runHelper(run, 'read', target)
  if (!result.timedOut && !result.signal && !result.outputTruncated) {
    if (result.code === 44) {
      return null
    }
    if (result.code === 0) {
      return parseAntigravityNativeCredential(decodeAntigravityKeychainValue(result.stdout))
    }
  }
  throw new Error(
    EXIT_MESSAGES[result.code ?? -1] ?? 'The Antigravity Linux credential store could not be read.'
  )
}

export async function writeAntigravityLinuxCredential(
  contents: string,
  target = nativeTarget,
  run: Runner = runProcess
): Promise<void> {
  parseAntigravityNativeCredential(contents)
  const result = await runHelper(run, 'write', target, contents)
  if (result.code !== 0 || result.timedOut || result.signal || result.outputTruncated) {
    throw new Error(
      EXIT_MESSAGES[result.code ?? -1] ??
        'The Antigravity Linux credential store could not be updated.'
    )
  }
  const actual = await readAntigravityLinuxCredential(target, run)
  if (actual?.contents !== contents) {
    throw new Error('The Antigravity Linux credential update could not be verified.')
  }
}

export async function clearAntigravityLinuxCredential(
  target = nativeTarget,
  run: Runner = runProcess
): Promise<void> {
  const result = await runHelper(run, 'clear', target)
  if (result.code !== 0 || result.timedOut || result.signal) {
    throw new Error(
      EXIT_MESSAGES[result.code ?? -1] ??
        'The Antigravity Linux credential store could not be updated.'
    )
  }
  if (await readAntigravityLinuxCredential(target, run)) {
    throw new Error('The Antigravity Linux credential could not be removed.')
  }
}

export function createAntigravityLinuxCredentialBackend(
  marker: string,
  target = nativeTarget,
  run: Runner = runProcess
): AntigravityCredentialBackend {
  async function read() {
    if (existsSync(marker)) {
      throw new Error(
        'Antigravity has a keyring fallback marker; Orca cannot verify which credential store agy will use.'
      )
    }
    return readAntigravityLinuxCredential(target, run)
  }
  return {
    read,
    async write(contents, expected) {
      if ((await read())?.contents !== (expected ?? undefined)) {
        throw new Error(CONFLICT)
      }
      await writeAntigravityLinuxCredential(contents, target, run)
      if ((await read())?.contents !== contents) {
        throw new Error(CONFLICT)
      }
    },
    async clear(expected) {
      if ((await read())?.contents !== expected) {
        throw new Error(CONFLICT)
      }
      await clearAntigravityLinuxCredential(target, run)
    }
  }
}
