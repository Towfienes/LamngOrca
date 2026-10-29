import { z } from 'zod'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { parseExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'

const ownerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local') }),
  z.object({ kind: z.literal('ssh'), connectionId: z.string().min(1) }),
  z.object({
    kind: z.literal('runtime'),
    environmentId: z.string().min(1),
    executionHostId: z.custom<ExecutionHostId>(
      (value) => typeof value === 'string' && parseExecutionHostId(value) !== null
    )
  }),
  z.object({ kind: z.literal('unresolved') })
])

export const GLOBAL_PROMPTS_KEY = 'orca.global-prompts.v1'
const LEGACY_PREFIX = 'orca.pinned-prompts.v1:'

export function isPromptFile(path: string): boolean {
  return /\.(md|txt)$/i.test(path)
}

const promptSchema = z.object({
  filePath: z.string().min(1).refine(isPromptFile),
  relativePath: z.string().min(1),
  worktreeId: z.string().min(1),
  owner: ownerSchema.optional()
})

export type PinnedPrompt = z.infer<typeof promptSchema>

export function parsePinnedPrompts(raw: string | null): PinnedPrompt[] {
  return raw === null ? [] : z.array(promptSchema).parse(JSON.parse(raw))
}

export function pinnedPromptKey(pin: PinnedPrompt): string {
  return JSON.stringify([pin.owner, pin.filePath])
}

export function loadGlobalPinnedPrompts(storage: Storage): PinnedPrompt[] {
  const saved = storage.getItem(GLOBAL_PROMPTS_KEY)
  if (saved !== null) {
    return parsePinnedPrompts(saved)
  }
  const pins = new Map<string, PinnedPrompt>()
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(LEGACY_PREFIX)) {
      continue
    }
    const [, encodedOwner] = z
      .tuple([z.string(), z.string()])
      .parse(JSON.parse(key.slice(LEGACY_PREFIX.length)))
    const owner = ownerSchema.parse(JSON.parse(encodedOwner))
    for (const pin of parsePinnedPrompts(storage.getItem(key))) {
      const migrated = {
        ...pin,
        owner,
        worktreeId: owner.kind === 'local' ? FLOATING_TERMINAL_WORKTREE_ID : pin.worktreeId
      }
      pins.set(pinnedPromptKey(migrated), migrated)
    }
  }
  const result = [...pins.values()]
  // Keep the original lists intact for rollback; an empty global list must not re-import them.
  storage.setItem(GLOBAL_PROMPTS_KEY, JSON.stringify(result))
  return result
}

export function reorderPinnedPrompts(
  pins: PinnedPrompt[],
  source: string,
  target: string
): PinnedPrompt[] {
  const from = pins.findIndex((pin) => pinnedPromptKey(pin) === source)
  const to = pins.findIndex((pin) => pinnedPromptKey(pin) === target)
  if (from === -1 || to === -1 || from === to) {
    return pins
  }
  const next = [...pins]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
