import { useState, type DragEvent } from 'react'
import { z } from 'zod'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import type { WorkspaceTabDot } from '@/lib/workspace-tab-dots'
import { moveWorkspaceIcon } from './workspace-icon-move'

const MIME = 'application/x-orca-workspace-icon+json'
const payloadSchema = z.object({
  worktreeId: z.string().min(1).max(512),
  groupId: z.string().min(1).max(512),
  tabId: z.string().min(1).max(512),
  leafId: z.string().min(1).max(512).optional()
})

export function useWorkspaceIconDrag(worktreeId: string, groupId: string | undefined) {
  const [over, setOver] = useState<number | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  return {
    start: (event: DragEvent, dot: WorkspaceTabDot): void => {
      const leafId =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-dot-pane-leaf]')?.dataset.dotPaneLeaf
          : undefined
      event.dataTransfer.setData(
        MIME,
        JSON.stringify({ worktreeId, groupId: dot.groupId, tabId: dot.id, leafId })
      )
      event.dataTransfer.effectAllowed = 'move'
      setDragging(dot.id)
    },
    end: (): void => {
      setOver(null)
      setDragging(null)
    },
    dragging,
    dropProps: (index: number, dot?: WorkspaceTabDot | null) => ({
      'data-drop-target': over === index ? 'true' : undefined,
      onDragOver: (event: DragEvent): void => {
        if (event.dataTransfer.types.includes(MIME)) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setOver(index)
        }
      },
      onDragLeave: (): void => setOver((current) => (current === index ? null : current)),
      onDrop: (event: DragEvent): void => {
        if (!event.dataTransfer.types.includes(MIME)) {
          return
        }
        event.preventDefault()
        setOver(null)
        setDragging(null)
        try {
          const payload = payloadSchema.parse(JSON.parse(event.dataTransfer.getData(MIME)))
          if (payload.worktreeId !== worktreeId || payload.groupId !== groupId) {
            return
          }
          if (payload.tabId === dot?.id) {
            return
          }
          void moveWorkspaceIcon(
            worktreeId,
            payload.groupId,
            payload.tabId,
            payload.leafId,
            index,
            dot?.id
          )
            .then((moved) => {
              if (!moved) {
                toast.error(
                  translate(
                    'workspace.icon.moveFailed',
                    'Could not move this icon to that workspace.'
                  )
                )
              }
            })
            .catch((error) => {
              console.warn('[workspace-icon] Move failed', error)
              toast.error(
                translate(
                  'workspace.icon.moveFailed',
                  'Could not move this icon to that workspace.'
                )
              )
            })
        } catch {
          // Ignore unrelated or stale drag payloads.
        }
      }
    })
  }
}
