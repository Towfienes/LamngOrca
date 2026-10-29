import { useState } from 'react'
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const NOTES_KEY = 'orca.global-notes.v1'
const TEXT_SIZES = [
  'var(--text-xs)',
  'var(--text-sm)',
  'var(--text-base)',
  'var(--text-lg)',
  'var(--text-xl)'
]

function loadNotes(): { text: string; readFailed: boolean } {
  try {
    return { text: localStorage.getItem(NOTES_KEY) ?? '', readFailed: false }
  } catch {
    return { text: '', readFailed: true }
  }
}

export function GlobalNotesPanel(): React.JSX.Element {
  const [initial] = useState(loadNotes)
  const [text, setText] = useState(initial.text)
  const [saved, setSaved] = useState(true)
  const [open, setOpen] = useState(true)
  const [size, setSize] = useState(1)

  return (
    <section
      aria-label="Global notes panel"
      className="deck-global-notes shrink-0 border-t border-sidebar-border px-3 py-2"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="mb-1 flex items-center justify-between gap-1">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs">
              {open ? <ChevronDown /> : <ChevronRight />}
              Notes
            </Button>
          </CollapsibleTrigger>
          <span className="ml-auto text-xs text-muted-foreground" role="status">
            {initial.readFailed ? 'Unavailable' : saved ? 'Saved' : 'Not saved'}
          </span>
          {open && (
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Zoom notes out"
                    disabled={size === 0}
                    onClick={() => setSize(size - 1)}
                  >
                    <Minus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Smaller note text</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label="Reset note zoom"
                    onClick={() => setSize(1)}
                  >
                    {Math.round((([12, 14, 16, 18, 20][size] ?? 14) / 14) * 100)}%
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset note text size</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Zoom notes in"
                    disabled={size === TEXT_SIZES.length - 1}
                    onClick={() => setSize(size + 1)}
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Larger note text</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
        <CollapsibleContent>
          <Textarea
            aria-label="Global notes"
            placeholder="What are you working on? Write it here…"
            className="h-28 max-h-[25vh] resize-y"
            style={{ fontSize: TEXT_SIZES[size] }}
            value={text}
            readOnly={initial.readFailed}
            onChange={(event) => {
              const next = event.target.value
              setText(next)
              try {
                localStorage.setItem(NOTES_KEY, next)
                setSaved(true)
              } catch {
                setSaved(false)
              }
            }}
          />
          {initial.readFailed ? (
            <p className="mt-1 text-xs text-destructive">
              Could not load saved notes. Reopen Orca to try again.
            </p>
          ) : !saved ? (
            <p className="mt-1 text-xs text-destructive">
              Could not save notes. Copy your text before closing Orca.
            </p>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
