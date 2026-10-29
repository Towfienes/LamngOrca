import { useEffect } from 'react'
import { useAppStore } from '../store'
import { awaitsCodexRestartAnswer } from './codex-restart-notice-state'

export default function CodexRestartChip({
  ptyId
}: {
  ptyId: string
  isVisible?: boolean
  shouldFocus?: boolean
}): null {
  const restartNotice = useAppStore((state) => state.codexRestartNoticeByPtyId[ptyId])
  useEffect(() => {
    const state = useAppStore.getState()
    const current = state.codexRestartNoticeByPtyId[ptyId]
    if (!current || !awaitsCodexRestartAnswer(current)) {
      return
    }
    // Deck keeps live sessions on their launch accounts when the global account changes.
    state.dismissCodexRestartNotices([ptyId])
  }, [ptyId, restartNotice])
  return null
}
