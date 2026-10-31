import { create } from 'zustand'
import { z } from 'zod'

const slotLayoutSchema = z.array(z.string().min(1).nullable()).max(4096)

export function workspaceSlotLayoutKey(workspaceId: string, groupId: string): string {
  return JSON.stringify([workspaceId, groupId])
}

function loadSlotLayout(key: string): (string | null)[] {
  try {
    if (typeof localStorage !== 'undefined') {
      return slotLayoutSchema.parse(
        JSON.parse(localStorage.getItem(`orca:workspace-slots:v1:${key}`) ?? '[]')
      )
    }
  } catch {
    console.warn('[workspace-slots] Could not read the saved layout')
  }
  return []
}

function saveSlotLayout(key: string, slots: (string | null)[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`orca:workspace-slots:v1:${key}`, JSON.stringify(slots))
    }
  } catch {
    console.warn('[workspace-slots] Could not save the layout')
  }
}

type WorkspaceLaunchSelection = {
  workspaceId: string | null
  tabCount: number
  slotIndex: number
  groupId: string | null
  layouts: Record<string, (string | null)[]>
  open: (workspaceId: string, tabCount: number, slotIndex?: number, groupId?: string) => void
  reconcile: (workspaceId: string, groupId: string, tabIds: string[]) => void
  dismiss: (workspaceId: string) => void
}

export const useWorkspaceLaunchSelection = create<WorkspaceLaunchSelection>((set) => ({
  workspaceId: null,
  tabCount: 0,
  slotIndex: 0,
  groupId: null,
  layouts: {},
  open: (workspaceId, tabCount, slotIndex = tabCount, groupId) =>
    set({ workspaceId, tabCount, slotIndex, groupId: groupId ?? null }),
  reconcile: (workspaceId, groupId, tabIds) =>
    set((state) => {
      const key = workspaceSlotLayoutKey(workspaceId, groupId)
      const previous = state.layouts[key]
      const source = previous ?? loadSlotLayout(key)
      const remaining = new Set(tabIds)
      const vacated = source.flatMap((id, index) => (id && !remaining.has(id) ? [index] : []))
      const slots = source.map((id) => (id && remaining.delete(id) ? id : null))
      for (const id of remaining) {
        const selected =
          state.workspaceId === workspaceId &&
          (state.groupId === null || state.groupId === groupId) &&
          !slots[state.slotIndex]
        while (vacated.length > 0 && slots[vacated[0]] !== null) {
          vacated.shift()
        }
        let index = selected ? state.slotIndex : (vacated.shift() ?? slots.indexOf(null))
        if (index < 0) {
          index = slots.length
        }
        while (slots.length <= index) {
          slots.push(null)
        }
        slots[index] = id
      }
      while (slots.length > 0 && slots.at(-1) === null) {
        slots.pop()
      }
      if (
        previous &&
        previous.length === slots.length &&
        previous.every((id, index) => id === slots[index])
      ) {
        return state
      }
      saveSlotLayout(key, slots)
      return { layouts: { ...state.layouts, [key]: slots } }
    }),
  dismiss: (workspaceId) =>
    set((state) => (state.workspaceId === workspaceId ? { workspaceId: null } : state))
}))
