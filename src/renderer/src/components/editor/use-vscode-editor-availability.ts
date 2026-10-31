import { useEffect, useState } from 'react'

let available: Promise<boolean> | undefined

export function useVSCodeEditorAvailability(): boolean | null {
  const [installed, setInstalled] = useState<boolean | null>(null)
  useEffect(() => {
    available ??= window.api?.vscodeEditor?.available().catch(() => false) ?? Promise.resolve(false)
    let mounted = true
    void available.then((value) => {
      if (mounted) {
        setInstalled(value)
      }
    })
    return () => {
      mounted = false
    }
  }, [])
  return installed
}
