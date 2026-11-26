import { RefreshCw, X } from 'lucide-react'
import { Button } from '../ui/button'
import {
  formatIssueAge,
  groupByRepo,
  type DeckAssignedIssue,
  type DeckWorkKind
} from './deck-assigned-issues-model'

// Issues are the default row; only PRs carry a tag so the same label never repeats down a list.
const KIND_LABEL: Record<Exclude<DeckWorkKind, 'issue'>, string> = { pr: 'PR', review: 'Review' }

// The balloon is always white manga paper, so fixed dark tones keep >= 4.5:1 in both app themes.
const PRIORITY_TONE: Record<number, string> = {
  0: 'border-red-700/60 text-red-700',
  1: 'border-amber-700/60 text-amber-700'
}

function PriorityChip({ priority }: { priority: number | null }): React.JSX.Element | null {
  if (priority === null) {
    return null
  }
  return (
    <span
      className={`shrink-0 rounded border px-1 text-[10px] leading-4 font-semibold ${
        PRIORITY_TONE[priority] ?? 'border-current/30 text-muted-foreground'
      }`}
    >
      P{priority}
    </span>
  )
}

/** The speech balloon's content: issues and PRs waiting on you, grouped by repo, most urgent first. */
export function DeckIssuesBalloon({
  issues,
  loading,
  refreshing,
  error,
  updatedAt,
  onRefresh,
  onClose
}: {
  issues: DeckAssignedIssue[]
  loading: boolean
  refreshing: boolean
  error: string | null
  updatedAt: number | null
  onRefresh: () => void
  onClose: () => void
}): React.JSX.Element {
  // Ages are relative to the last poll (at most 2 min stale) so rendering stays pure.
  const now = updatedAt ?? 0
  return (
    <div className="flex flex-col gap-2 px-4 py-3 font-sans" data-deck-issues>
      <div className="flex items-center gap-2">
        <h3 className="deck-issues-title min-w-0 flex-1 truncate text-lg leading-6">
          Việc chờ bạn
          {issues.length > 0 && (
            <span className="ml-2 align-middle text-xs font-sans text-muted-foreground">
              {issues.length}
            </span>
          )}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Làm mới"
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Đóng" onClick={onClose}>
          <X />
        </Button>
      </div>
      {loading && issues.length === 0 ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Đang tải">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-10 rounded bg-current/8 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : error && issues.length === 0 ? (
        <div className="flex flex-col items-start gap-2" role="status">
          <p className="text-xs text-destructive">Không tải được từ GitHub: {error}</p>
          <Button type="button" variant="outline" size="xs" onClick={onRefresh}>
            Thử lại
          </Button>
        </div>
      ) : issues.length === 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          Không có issue hay PR nào đang chờ bạn.
        </p>
      ) : (
        <div className="-mx-1 flex max-h-72 flex-col gap-3 overflow-y-auto scrollbar-sleek">
          {groupByRepo(issues).map((group) => (
            <section key={group.repoFullName} aria-label={group.repoFullName}>
              <h4
                className="truncate px-1 text-[11px] leading-4 font-semibold text-muted-foreground"
                title={group.repoFullName}
              >
                {group.repoFullName.split('/').pop()}
              </h4>
              <ul className="flex flex-col">
                {group.items.map((issue) => (
                  <li key={issue.key}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-1 rounded px-1 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                      title={`${issue.repoFullName}#${issue.number} ${issue.title}`}
                      onClick={() => void window.api.shell.openUrl(issue.url)}
                    >
                      <span className="flex min-w-0 items-start gap-1 text-xs leading-4">
                        {issue.kind !== 'issue' && (
                          <span className="shrink-0 rounded border border-current/30 px-1 text-[10px] leading-4 text-muted-foreground">
                            {KIND_LABEL[issue.kind]}
                          </span>
                        )}
                        <PriorityChip priority={issue.priority} />
                        <span className="shrink-0 font-semibold">#{issue.number}</span>
                        <span className="line-clamp-2 min-w-0">{issue.title}</span>
                      </span>
                      <span className="truncate text-[11px] leading-4 text-muted-foreground">
                        {formatIssueAge(issue.updatedAt, now)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {updatedAt !== null && !(loading && issues.length === 0) && (
        <p className="text-[10px] leading-4 text-muted-foreground">
          Cập nhật lúc{' '}
          {new Date(updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{' '}
          · tự làm mới 2 phút
        </p>
      )}
    </div>
  )
}
