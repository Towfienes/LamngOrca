import { Copy, FileText, Loader2, PinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { basename } from '@/lib/path'
import { pinnedPromptKey, type PinnedPrompt } from './pinned-prompts'

export function PinnedPromptRow({
  pin,
  busy,
  disabled,
  onOpen,
  onCopy,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  onDrop
}: {
  pin: PinnedPrompt
  busy: boolean
  disabled: boolean
  onOpen: () => void
  onCopy: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  canMoveUp: boolean
  canMoveDown: boolean
  onDrop: (source: string) => void
}): React.JSX.Element {
  const name = basename(pin.filePath)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group flex min-w-0 items-center gap-1 rounded-md px-1 hover:bg-sidebar-accent"
          data-pinned-prompt={pin.filePath}
          draggable={!disabled}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-orca-pinned-prompt', pinnedPromptKey(pin))
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            if (
              !disabled &&
              event.dataTransfer.types.includes('application/x-orca-pinned-prompt')
            ) {
              event.preventDefault()
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (!disabled) {
              onDrop(event.dataTransfer.getData('application/x-orca-pinned-prompt'))
            }
          }}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onOpen}
            aria-label={`Open ${name}`}
          >
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{name.replace(/\.(md|txt)$/i, '')}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {pin.relativePath}
              </span>
            </span>
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Copy ${name}`}
                disabled={busy}
                onClick={onCopy}
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <Copy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy file contents</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Unpin ${name}`}
                disabled={disabled}
                onClick={onRemove}
              >
                <PinOff />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unpin — keep the file</TooltipContent>
          </Tooltip>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open file</ContextMenuItem>
        <ContextMenuItem onSelect={onCopy} disabled={busy}>
          Copy contents
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || !canMoveUp} onSelect={() => onMove(-1)}>
          Move up
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled || !canMoveDown} onSelect={() => onMove(1)}>
          Move down
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={onRemove}>
          Unpin
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
