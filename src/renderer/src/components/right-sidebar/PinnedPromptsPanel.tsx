import { runtimeTargetEnvironmentId } from '@/runtime/runtime-client-target'
import { useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, Pin, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { basename, getRelativePathInsideRoot, joinPath } from '@/lib/path'
import { detectLanguage } from '@/lib/language-detect'
import { GlobalNotesPanel } from './GlobalNotesPanel'
import { PinnedPromptPicker } from './PinnedPromptPicker'
import { PinnedPromptRow } from './PinnedPromptRow'
import {
  GLOBAL_PROMPTS_KEY,
  loadGlobalPinnedPrompts,
  parsePinnedPrompts,
  pinnedPromptKey,
  reorderPinnedPrompts,
  type PinnedPrompt
} from './pinned-prompts'
import { readPinnedPrompt } from './pinned-prompt-read'
import { createUntitledMarkdownFile } from '@/lib/create-untitled-markdown'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { requireMatchingFileExplorerOperationRoute } from './file-explorer-operation-owner'
import type { FileExplorerOperationOwner } from './file-explorer-types'

function loadPins(): { pins: PinnedPrompt[]; error: string | null } {
  try {
    return { pins: loadGlobalPinnedPrompts(localStorage), error: null }
  } catch {
    return {
      pins: [],
      error: 'Could not load pinned prompts. Saved references have been left untouched.'
    }
  }
}

export function PinnedPromptsPanel(): React.JSX.Element {
  const worktree = useActiveWorktree()
  const [initial] = useState(loadPins)
  const [pins, setPins] = useState(initial.pins)
  const [open, setOpen] = useState(true)
  const [notes, setNotes] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function save(next: PinnedPrompt[]): void {
    if (initial.error) {
      return
    }
    try {
      localStorage.setItem(GLOBAL_PROMPTS_KEY, JSON.stringify(next))
      setPins(next)
    } catch {
      toast.error('Could not save pinned prompts. Your previous list is unchanged.')
    }
  }
  function fail(error: unknown): void {
    toast.error(error instanceof Error ? error.message : 'Could not read the prompt file.')
  }
  function pin(relativePath: string, listedOwner: FileExplorerOperationOwner | undefined): void {
    try {
      if (!worktree) {
        return
      }
      requireMatchingFileExplorerOperationRoute(worktree.id, listedOwner)
      const filePath = joinPath(worktree.path, relativePath)
      if (!getRelativePathInsideRoot(filePath, worktree.path)) {
        throw new Error('Choose a file inside this workspace.')
      }
      addPin({
        filePath,
        relativePath,
        owner: listedOwner,
        worktreeId: listedOwner?.kind === 'local' ? FLOATING_TERMINAL_WORKTREE_ID : worktree.id
      })
    } catch (error) {
      fail(error)
    }
  }
  function addPin(item: PinnedPrompt): void {
    parsePinnedPrompts(JSON.stringify([item]))
    const current = parsePinnedPrompts(localStorage.getItem(GLOBAL_PROMPTS_KEY))
    if (!current.some((pin) => pinnedPromptKey(pin) === pinnedPromptKey(item))) {
      save([...current, item])
    }
    setOpen(true)
  }
  async function create(): Promise<void> {
    if (creating) {
      return
    }
    setCreating(true)
    try {
      const directory = await window.api.app.getFloatingMarkdownDirectory()
      if (!directory) {
        throw new Error('Global prompt files are available in the desktop app.')
      }
      const file = await createUntitledMarkdownFile(
        directory,
        FLOATING_TERMINAL_WORKTREE_ID,
        undefined,
        { kind: 'local' }
      )
      const item: PinnedPrompt = {
        filePath: file.filePath,
        relativePath: file.relativePath,
        worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        owner: { kind: 'local' }
      }
      addPin(item)
      openFile(item)
    } catch (error) {
      fail(error)
    } finally {
      setCreating(false)
    }
  }
  async function browse(): Promise<void> {
    try {
      const file = await window.api.app.pickFloatingMarkdownDocument()
      if (file) {
        addPin({
          filePath: file.filePath,
          relativePath: file.relativePath,
          worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
          owner: { kind: 'local' }
        })
      }
    } catch (error) {
      fail(error)
    }
  }
  function openFile(item: PinnedPrompt): void {
    try {
      const route = requireMatchingFileExplorerOperationRoute(item.worktreeId, item.owner)
      useAppStore.getState().openFile(
        {
          ...item,
          language: detectLanguage(item.filePath),
          mode: 'edit',
          runtimeEnvironmentId: runtimeTargetEnvironmentId(route.target)
        },
        { preview: true, suppressActiveRuntimeFallback: true, focusEditor: true }
      )
    } catch (error) {
      fail(error)
    }
  }
  async function copy(item: PinnedPrompt): Promise<void> {
    if (busy) {
      return
    }
    setBusy(pinnedPromptKey(item))
    try {
      const content = await readPinnedPrompt(item, item.owner ?? { kind: 'unresolved' })
      await window.api.ui.writeClipboardText(content)
      toast.success(`Copied ${basename(item.filePath)}`)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="shrink-0">
      <section
        aria-label="Global prompts"
        className="border-t border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground"
      >
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center gap-1">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="xs">
                {open ? <ChevronDown /> : <ChevronRight />}Global prompts
              </Button>
            </CollapsibleTrigger>
            <div className="ml-auto flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Toggle notes"
                    aria-pressed={notes}
                    onClick={() => setNotes(!notes)}
                  >
                    <StickyNote />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notes</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Create blank Markdown prompt"
                    disabled={creating || !!initial.error}
                    onClick={() => void create()}
                  >
                    <FilePlus2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New blank .md — available in every workspace</TooltipContent>
              </Tooltip>
              <PinnedPromptPicker
                worktreeId={worktree?.id}
                disabled={!!initial.error}
                onPin={pin}
                onBrowse={() => void browse()}
              />
            </div>
          </div>
          <CollapsibleContent>
            {initial.error ? (
              <p className="py-2 text-xs text-destructive" role="alert">
                {initial.error}
              </p>
            ) : pins.length === 0 ? (
              <div className="flex items-start gap-2 px-1 py-3 text-xs text-muted-foreground">
                <Pin className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  Create a blank .md or pin a file with +. Your prompts stay here across workspaces.
                </p>
              </div>
            ) : (
              <div className="mt-1 max-h-48 overflow-y-auto scrollbar-sleek">
                {pins.map((item, index) => (
                  <PinnedPromptRow
                    key={pinnedPromptKey(item)}
                    pin={item}
                    busy={busy === pinnedPromptKey(item)}
                    disabled={!!initial.error}
                    onOpen={() => openFile(item)}
                    onCopy={() => void copy(item)}
                    onRemove={() =>
                      save(pins.filter((entry) => pinnedPromptKey(entry) !== pinnedPromptKey(item)))
                    }
                    canMoveUp={index > 0}
                    canMoveDown={index < pins.length - 1}
                    onMove={(direction) => {
                      const target = pins[index + direction]
                      if (target) {
                        save(
                          reorderPinnedPrompts(pins, pinnedPromptKey(item), pinnedPromptKey(target))
                        )
                      }
                    }}
                    onDrop={(source) =>
                      save(reorderPinnedPrompts(pins, source, pinnedPromptKey(item)))
                    }
                  />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>
      {notes && <GlobalNotesPanel />}
    </div>
  )
}
