import { useEffect, useState } from 'react'
import '@/assets/boruto-karma.css'
import borutoPortrait from '@/assets/boruto-portrait.webp'
import karmaInk from '@/assets/boruto-karma-ink.webp'
import karmaGlow from '@/assets/boruto-karma-glow.webp'
import joganEye from '@/assets/boruto-jogan-eye.webp'
import joganGlow from '@/assets/boruto-jogan-glow.webp'

export type KarmaPhase = 'rest' | 'awake' | 'sleeping'

/**
 * Boruto wakes the Karma seal while issues are open: it climbs from the hand to the closed eye,
 * which opens as the Jogan. When the last issue closes it retreats and he rests again.
 * Each transition is a one-shot CSS animation; nothing runs while the state holds.
 */
export function BorutoKarmaPortrait({ awake }: { awake: boolean }): React.JSX.Element {
  const [phase, setPhase] = useState<KarmaPhase>(awake ? 'awake' : 'rest')
  useEffect(() => {
    setPhase((current) => (awake ? 'awake' : current === 'awake' ? 'sleeping' : current))
  }, [awake])
  return (
    <span
      className="deck-karma"
      data-karma={phase}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'deck-karma-retreat') {
          setPhase('rest')
        }
      }}
    >
      <img
        src={borutoPortrait}
        alt="Boruto Uzumaki"
        className="deck-usage-portrait"
        decoding="async"
        draggable={false}
      />
      <img
        src={karmaInk}
        alt=""
        aria-hidden
        className="deck-usage-portrait deck-karma-ink"
        draggable={false}
      />
      <img
        src={karmaGlow}
        alt=""
        aria-hidden
        className="deck-usage-portrait deck-karma-trail"
        draggable={false}
      />
      <img
        src={karmaGlow}
        alt=""
        aria-hidden
        className="deck-usage-portrait deck-karma-tip"
        draggable={false}
      />
      <img
        src={joganEye}
        alt=""
        aria-hidden
        className="deck-usage-portrait deck-karma-eye"
        draggable={false}
      />
      <img
        src={joganGlow}
        alt=""
        aria-hidden
        className="deck-usage-portrait deck-karma-eye-glow"
        draggable={false}
      />
    </span>
  )
}
