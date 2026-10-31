import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { gateWorktreeAgentActivation } from '@/lib/worktree-agent-activation-gate'

export function useWorkspaceLaunchReadiness(worktreeId: string, newWorkspace: boolean) {
  const [inventory, setInventory] = useState<'checking' | 'empty' | 'blocked'>('checking')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (newWorkspace) {
      setInventory('empty')
      return
    }
    let cancelled = false
    setInventory('checking')
    void gateWorktreeAgentActivation(worktreeId)
      .then((outcome) => {
        if (cancelled) {
          return
        }
        if (outcome === 'empty') {
          useAppStore.getState().ensureWorktreeRootGroup(worktreeId)
          setInventory('empty')
        } else {
          setInventory('blocked')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInventory('blocked')
        }
      })
    return () => {
      cancelled = true
    }
  }, [worktreeId, attempt, newWorkspace])
  return { inventory, retry: () => setAttempt((value) => value + 1) }
}
