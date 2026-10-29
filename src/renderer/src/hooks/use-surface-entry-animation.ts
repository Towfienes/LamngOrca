import { useEffect, useRef, type RefObject } from 'react'

export function useSurfaceEntryAnimation(
  surface: string,
  enabled: boolean,
  motion: 'slide' | 'fade' = 'slide'
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const frames =
      motion === 'fade'
        ? [{ opacity: 0.78 }, { opacity: 1 }]
        : [
            { opacity: 0.78, transform: 'translateY(5px)' },
            { opacity: 1, transform: 'translateY(0)' }
          ]
    const animation = ref.current?.animate(frames, {
      duration: 160,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
    })
    void animation?.finished.catch(() => undefined)
    return () => animation?.cancel()
  }, [surface, enabled, motion])
  return ref
}
