import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Route } from 'lucide-react'
import { Button } from '../ui/button'
import { formatTokenCount } from './deck-claude9-launch'
import { formatRelativeAge } from './deck-relative-age'
import type { DeeprelayModel, DeeprelayModelList } from '../../../../shared/deeprelay-models'

export function useDeeprelayModels(enabled: boolean): {
  list: DeeprelayModelList | null
  refresh: () => void
} {
  const [list, setList] = useState<DeeprelayModelList | null>(null)
  const load = useCallback(() => {
    if (!enabled) {
      return
    }
    const api = window.api?.deeprelay
    if (!api) {
      setList({
        available: false,
        reason: 'DeepRelay is unavailable here',
        fetchedAt: Date.now()
      })
      return
    }
    setList(null)
    void api
      .list()
      .then(setList)
      .catch((e: unknown) =>
        setList({
          available: false,
          reason: e instanceof Error ? e.message : 'DeepRelay is unavailable',
          fetchedAt: Date.now()
        })
      )
  }, [enabled])
  useEffect(() => load(), [load])
  return { list, refresh: load }
}

/** The model DeepRelay opens with (its env.json default), or null while unknown. */
export function deeprelayDefaultModel(list: DeeprelayModelList | null): DeeprelayModel | null {
  return list?.available ? (list.models.find((m) => m.id === list.defaultId) ?? null) : null
}

export function DeckDeeprelaySection({
  list,
  selected,
  disabled,
  onPreview,
  onLaunch,
  onRetry
}: {
  list: DeeprelayModelList | null
  selected: boolean
  disabled: boolean
  onPreview: () => void
  onLaunch: () => void
  onRetry: () => void
}): React.JSX.Element {
  const model = deeprelayDefaultModel(list)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="DeepRelay (claude-dl)"
        disabled={disabled || !list?.available}
        data-current={selected}
        className="group/deck-dr flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/50 disabled:cursor-default disabled:opacity-60 data-[current=true]:bg-accent/30 motion-reduce:transition-none"
        onPointerEnter={onPreview}
        onFocus={onPreview}
        onClick={onLaunch}
      >
        <Route className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs group-focus-visible/deck-dr:underline group-focus-visible/deck-dr:underline-offset-4">
          DeepRelay
        </span>
        <span className="flex min-w-0 shrink items-center gap-1 truncate text-2xs text-muted-foreground">
          {list === null ? (
            <Loader2 className="size-3 animate-spin" aria-label="Loading DeepRelay" />
          ) : list.available ? (
            (model?.label ?? 'deeprelay')
          ) : (
            <span title={list.reason}>{list.reason}</span>
          )}
        </span>
      </button>
      {list && !list.available ? (
        <Button variant="ghost" size="icon-xs" aria-label="Retry DeepRelay" onClick={onRetry}>
          <RefreshCw />
        </Button>
      ) : null}
    </div>
  )
}

export function DeckDeeprelayDetail({
  list
}: {
  list: DeeprelayModelList | null
}): React.JSX.Element {
  const model = deeprelayDefaultModel(list)
  const base = list?.available ? (list.base?.replace(/^https?:\/\//, '') ?? '—') : '—'
  const facts = [
    ['Starts with', model?.label ?? '—'],
    ['Context', formatTokenCount(model?.ctx ?? null)],
    ['Models', list?.available ? String(list.models.length) : '—'],
    ['Base', base]
  ]
  return (
    <>
      <p className="text-xs font-medium">DeepRelay</p>
      <p className="text-pretty text-xs text-muted-foreground">
        Opens DeepRelay directly with <span className="whitespace-nowrap">claude-dl</span> or{' '}
        <span className="whitespace-nowrap">deeprelay</span>. Switch models with /model.
      </p>
      <dl className="space-y-1.5 text-xs">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {list?.available && list.fetchedAt !== null ? (
        <p className="text-2xs text-muted-foreground">
          Model list cached {formatRelativeAge(list.fetchedAt)}
        </p>
      ) : null}
      {list && !list.available ? (
        <p className="text-2xs text-muted-foreground">{list.reason}</p>
      ) : null}
      <p className="text-pretty text-2xs text-muted-foreground">
        Same skills, hooks, MCP and plugins as Claude. Sessions stay in{' '}
        <span className="whitespace-nowrap font-mono">~/.claude-deeprelay</span>.
      </p>
    </>
  )
}
