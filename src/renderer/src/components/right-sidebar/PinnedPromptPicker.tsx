import { useState } from 'react'
import { FileText, FolderOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { basename } from '@/lib/path'
import { isPromptFile } from './pinned-prompts'
import type { FileExplorerOperationOwner } from './file-explorer-types'

export function PinnedPromptPicker({
  worktreeId,
  disabled,
  onPin,
  onBrowse
}: {
  worktreeId: string | undefined
  disabled: boolean
  onPin: (relativePath: string, owner: FileExplorerOperationOwner | undefined) => void
  onBrowse: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const listing = useRuntimeFileListForWorktree({
    enabled: open && !!worktreeId,
    worktreeId: worktreeId ?? null,
    query,
    hostFilterWhenCapped: true
  })
  const files = listing.files.filter(
    (path) => isPromptFile(path) && path.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Pin prompt file" disabled={disabled}>
              <Plus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Pin a .md or .txt file</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 max-w-[90vw]">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Find .md or .txt files…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandItem
              value="browse-global-markdown"
              onSelect={() => {
                setOpen(false)
                onBrowse()
              }}
            >
              <FolderOpen />
              Choose Markdown from computer…
            </CommandItem>
            {listing.loading && (
              <p className="p-3 text-xs text-muted-foreground" role="status">
                Finding files…
              </p>
            )}
            {listing.loadError && (
              <p className="p-3 text-xs text-destructive" role="alert">
                {listing.loadError}
              </p>
            )}
            {!listing.loading && !listing.loadError && files.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">
                No matching prompt files in this workspace.
              </p>
            )}
            {files.slice(0, 100).map((path) => (
              <CommandItem
                key={path}
                value={path}
                onSelect={() => {
                  onPin(path, listing.operationOwner)
                  setOpen(false)
                }}
              >
                <FileText />
                <span className="min-w-0">
                  <span className="block truncate">{basename(path)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{path}</span>
                </span>
              </CommandItem>
            ))}
            {(listing.truncated || files.length > 100) && (
              <p className="p-2 text-xs text-muted-foreground">
                Type more of the filename to narrow the results.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
