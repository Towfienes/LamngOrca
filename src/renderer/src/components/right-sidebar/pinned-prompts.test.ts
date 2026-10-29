// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  parsePinnedPrompts,
  reorderPinnedPrompts,
  isPromptFile,
  pinnedPromptKey,
  loadGlobalPinnedPrompts,
  GLOBAL_PROMPTS_KEY
} from './pinned-prompts'

const first = { filePath: '/repo/a.md', relativePath: 'a.md', worktreeId: 'one' }
const second = { filePath: '/repo/b.txt', relativePath: 'b.txt', worktreeId: 'one' }

describe('pinned prompt references', () => {
  it('restores ordered references without storing prompt contents', () => {
    expect(parsePinnedPrompts(JSON.stringify([second, first]))).toEqual([second, first])
    expect(parsePinnedPrompts(null)).toEqual([])
  })
  it('rejects damaged storage instead of replacing it with an empty list', () => {
    expect(() => parsePinnedPrompts('{')).toThrow()
    expect(() => parsePinnedPrompts('[{"filePath":"/repo/a.md"}]')).toThrow()
    expect(() =>
      parsePinnedPrompts(JSON.stringify([{ ...first, filePath: '/repo/a.exe' }]))
    ).toThrow()
  })
  it('accepts only markdown and text files, including upper-case extensions', () => {
    expect(isPromptFile('C:\\project\\REVIEW.MD')).toBe(true)
    expect(isPromptFile('notes.txt')).toBe(true)
    expect(isPromptFile('a.md.exe')).toBe(false)
  })
  it('reorders without mutating the source and ignores stale drag sources', () => {
    const pins = [first, second]
    expect(reorderPinnedPrompts(pins, pinnedPromptKey(second), pinnedPromptKey(first))).toEqual([
      second,
      first
    ])
    expect(reorderPinnedPrompts(pins, 'missing', pinnedPromptKey(first))).toEqual(pins)
    expect(pins).toEqual([first, second])
  })
})

describe('global prompt migration', () => {
  it('merges old projects, preserves their lists and does not resurrect unpinned files', () => {
    localStorage.clear()
    const owner = JSON.stringify({ kind: 'local' })
    const one = `orca.pinned-prompts.v1:${JSON.stringify(['repo-one', owner])}`
    const two = `orca.pinned-prompts.v1:${JSON.stringify(['repo-two', owner])}`
    localStorage.setItem(one, JSON.stringify([first]))
    localStorage.setItem(two, JSON.stringify([second, first]))
    const migrated = loadGlobalPinnedPrompts(localStorage)
    expect(migrated.map((pin) => pin.filePath)).toEqual([first.filePath, second.filePath])
    expect(migrated.every((pin) => pin.owner?.kind === 'local' && pin.worktreeId !== 'one')).toBe(
      true
    )
    expect(localStorage.getItem(one)).toBe(JSON.stringify([first]))
    localStorage.setItem(GLOBAL_PROMPTS_KEY, '[]')
    expect(loadGlobalPinnedPrompts(localStorage)).toEqual([])
    localStorage.clear()
  })
  it('keeps identical paths on different hosts distinct and does not migrate damaged data', () => {
    localStorage.clear()
    for (const connectionId of ['host-a', 'host-b']) {
      const owner = JSON.stringify({ kind: 'ssh', connectionId })
      localStorage.setItem(
        `orca.pinned-prompts.v1:${JSON.stringify(['repo', owner])}`,
        JSON.stringify([first])
      )
    }
    const migrated = loadGlobalPinnedPrompts(localStorage)
    expect(migrated).toHaveLength(2)
    expect(pinnedPromptKey(migrated[0])).not.toBe(pinnedPromptKey(migrated[1]))
    expect(migrated[0].worktreeId).toBe('one')
    localStorage.removeItem(GLOBAL_PROMPTS_KEY)
    localStorage.setItem('orca.pinned-prompts.v1:invalid', '{')
    expect(() => loadGlobalPinnedPrompts(localStorage)).toThrow()
    expect(localStorage.getItem(GLOBAL_PROMPTS_KEY)).toBeNull()
    localStorage.clear()
  })
})
