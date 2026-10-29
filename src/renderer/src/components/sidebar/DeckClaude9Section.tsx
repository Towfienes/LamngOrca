import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Router } from 'lucide-react'
import { Button } from '../ui/button'
import { formatTokenCount } from './deck-claude9-launch'
import type { Claude9Model, Claude9ModelList } from '../../../../shared/claude9-models'

export function useClaude9Models(enabled: boolean): {
  list: Claude9ModelList | null
  refresh: () => void
} {
  const [list, setList] = useState<Claude9ModelList | null>(null)
  const load = useCallback(
    (force: boolean) => {
      if (!enabled) {
        return
      }
      const api = window.api?.claude9
      if (!api) {
        setList({
          available: false,
          reason: 'claude9 is unavailable here',
          fetchedAt: Date.now()
        })
        return
      }
      setList(null)
      void api
        .list({ force })
        .then(setList)
        .catch((e: unknown) =>
          setList({
            available: false,
            reason: e instanceof Error ? e.message : 'Gateway offline',
            fetchedAt: Date.now()
          })
        )
    },
    [enabled]
  )
  useEffect(() => load(false), [load])
  return { list, refresh: () => load(true) }
}

/** The model claude9 opens with (CLAUDE9_DEFAULT), or null while unknown. */
export function claude9DefaultModel(list: Claude9ModelList | null): Claude9Model | null {
  return list?.available ? (list.models.find((m) => m.id === list.defaultId) ?? null) : null
}

export function DeckClaude9Section({
  list,
  selected,
  disabled,
  onPreview,
  onLaunch,
  onRetry
}: {
  list: Claude9ModelList | null
  selected: boolean
  disabled: boolean
  onPreview: () => void
  onLaunch: () => void
  onRetry: () => void
}): React.JSX.Element {
  const model = claude9DefaultModel(list)
  return (
    <div className="border-t border-border pt-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="9router (claude9)"
          disabled={disabled || !list?.available}
          data-current={selected}
          className="group/deck-c9 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/50 disabled:cursor-default disabled:opacity-60 data-[current=true]:bg-accent/30 motion-reduce:transition-none"
          onPointerEnter={onPreview}
          onFocus={onPreview}
          onClick={onLaunch}
        >
          <Router className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs group-focus-visible/deck-c9:underline group-focus-visible/deck-c9:underline-offset-4">
            9router
          </span>
          <span className="flex min-w-0 shrink items-center gap-1 truncate text-[11px] text-muted-foreground">
            {list === null ? (
              <Loader2 className="size-3 animate-spin" aria-label="Loading 9router" />
            ) : list.available ? (
              (model?.label ?? 'claude9')
            ) : (
              <span title={list.reason}>{list.reason}</span>
            )}
          </span>
        </button>
        {list && !list.available ? (
          <Button variant="ghost" size="icon-xs" aria-label="Retry 9router" onClick={onRetry}>
            <RefreshCw />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ago(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60_000)
  return min < 1 ? 'just now' : `${min}m ago`
}

export function DeckClaude9Detail({ list }: { list: Claude9ModelList | null }): React.JSX.Element {
  const model = claude9DefaultModel(list)
  const facts = [
    ['Starts with', model?.label ?? '—'],
    ['Context', formatTokenCount(model?.ctx ?? null)],
    ['Reasoning', model?.reasoning ?? 'Not probed'],
    ['Models', list?.available ? String(list.models.length) : '—']
  ]
  return (
    <>
      <p className="text-xs font-medium">9router</p>
      <p className="text-xs text-muted-foreground">
        Opens claude9 with Claude&apos;s launch args. Switch model and effort with /model.
      </p>
      <dl className="space-y-1.5 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {list?.available ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-status-success" aria-hidden />
          Gateway online · checked {ago(list.fetchedAt)}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Same skills, hooks, MCP and plugins as Claude. Sessions stay in ~/.claude-9router.
      </p>
    </>
  )
}
