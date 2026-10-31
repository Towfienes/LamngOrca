import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const NOTES_KEY = 'orca.global-notes.v1'
const NOTES_CHANGED = 'orca:global-notes-changed'
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

export function GlobalNotesPanel({
  variant = 'panel',
  onClose
}: {
  variant?: 'panel' | 'bubble'
  onClose?: () => void
}): React.JSX.Element {
  const [initial] = useState(loadNotes)
  const [text, setText] = useState(initial.text)
  const [saved, setSaved] = useState(true)
  const [open, setOpen] = useState(true)
  const [size, setSize] = useState(1)
  const [focusLine, setFocusLine] = useState(-1)
  useEffect(() => {
    const sync = (): void => {
      const next = loadNotes()
      if (!next.readFailed) {
        setText(next.text)
        setSaved(true)
      }
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === NOTES_KEY || event.key === null) {
        sync()
      }
    }
    window.addEventListener(NOTES_CHANGED, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(NOTES_CHANGED, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const saveNotes = (next: string): void => {
    if (initial.readFailed) {
      return
    }
    setText(next)
    try {
      localStorage.setItem(NOTES_KEY, next)
      setSaved(true)
      window.dispatchEvent(new Event(NOTES_CHANGED))
    } catch {
      setSaved(false)
    }
  }
  const failure = initial.readFailed
    ? 'Could not load saved notes. Reopen Orca to try again.'
    : !saved
      ? 'Could not save notes. Copy your text before closing Orca.'
      : null

  if (variant === 'bubble') {
    const lines = text === '' ? [] : text.split('\n')
    const addTask = (): void => {
      setFocusLine(lines.length)
      saveNotes([...lines, '- [ ] '].join('\n'))
    }
    const replaceLine = (index: number, next: string): void => {
      saveNotes(lines.map((line, n) => (n === index ? next : line)).join('\n'))
    }
    return (
      <section aria-label="To-do notes" className="flex min-w-0 flex-col gap-2 p-5">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-xl">To do</h2>
          {onClose && (
            <Button variant="ghost" size="icon-xs" aria-label="Close notes" onClick={onClose}>
              <X />
            </Button>
          )}
        </header>
        {lines.length === 0 && (
          <p className="text-base text-muted-foreground">What’s the next mission?</p>
        )}
        <div className="scrollbar-sleek flex max-h-[min(40vh,280px)] flex-col gap-1 overflow-y-auto">
          {lines.map((line, index) => {
            const task = /^[-*] \[([ xX])\] ?(.*)$/.exec(line)
            const checked = task ? task[1].toLowerCase() === 'x' : false
            const label = task ? task[2] : line
            return (
              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- Line positions identify this text buffer; inputs and checkboxes are fully controlled.
              <div key={index} className="flex min-w-0 items-center gap-2">
                <Checkbox
                  aria-label={`Complete task ${index + 1}`}
                  checked={checked}
                  disabled={initial.readFailed}
                  onCheckedChange={(value) =>
                    replaceLine(index, `- [${value === true ? 'x' : ' '}] ${label}`)
                  }
                />
                <Textarea
                  rows={1}
                  aria-label={`Task ${index + 1}`}
                  value={label}
                  readOnly={initial.readFailed}
                  autoFocus={index === focusLine}
                  data-manga-task
                  data-completed={checked ? '' : undefined}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      addTask()
                    }
                  }}
                  onChange={(event) =>
                    replaceLine(
                      index,
                      `- [${checked ? 'x' : ' '}] ${event.target.value.replace(/\r?\n/g, ' ')}`
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove task ${index + 1}`}
                  disabled={initial.readFailed}
                  onClick={() => saveNotes(lines.filter((_, n) => n !== index).join('\n'))}
                >
                  <X />
                </Button>
              </div>
            )
          })}
        </div>
        <footer className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="xs" disabled={initial.readFailed} onClick={addTask}>
            <Plus /> Add task
          </Button>
          <span className="font-sans text-xs text-muted-foreground" role="status">
            {initial.readFailed ? 'Unavailable' : saved ? 'Saved' : 'Not saved'}
          </span>
        </footer>
        {failure && (
          <p className="font-sans text-xs text-destructive" role="alert">
            {failure}
          </p>
        )}
      </section>
    )
  }

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
            onChange={(event) => saveNotes(event.target.value)}
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
