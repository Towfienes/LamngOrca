#!/usr/bin/env node
/**
 * Renders resources/deepseek.webp — the bundled "DeepSeek" desk pet.
 *
 * Why procedural: the sprite is 72 frames driven by phase math (breathe, blink,
 * wave, hop), so one script owns every frame and the animation stays seamless.
 * Output matches the other bundled pets: 252x320, 12 fps, animated WebP with alpha.
 *
 * Requires ImageMagick (`magick`). Run: node config/scripts/generate-deepseek-pet.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..', '..')
const OUT_FILE = join(REPO_ROOT, 'resources', 'deepseek.webp')

const WIDTH = 252
const HEIGHT = 320
const FPS = 12
const FRAME_COUNT = 72
const LOOP_FRAMES = 36 // two wave periods + one hop keeps the cycle seamless

const BG = { top: '#eff6ff', bottom: '#dbeafe' } // DeepSeek UI light surface
const OUTLINE = '#0b1f45'
const BODY = '#ffffff'
const FIN = '#2563eb' // DeepSeek's brand blue carries the fins
const FIN_LIGHT = '#60a5fa'
const EYE_WHITE = '#ffffff'
const EYE = '#0f172a'
const CHEEK = '#f9a8d4'

const TAU = Math.PI * 2

const r2 = (n) => Math.round(n * 100) / 100

function bodyPath(cx, cy, rx, ry) {
  return `M ${r2(cx - rx)} ${r2(cy)} C ${r2(cx - rx)} ${r2(cy - ry * 1.05)} ${r2(cx + rx)} ${r2(
    cy - ry * 1.05
  )} ${r2(cx + rx)} ${r2(cy)} A ${r2(rx)} ${r2(ry)} 0 0 1 ${r2(cx - rx)} ${r2(cy)} Z`
}

function frameSvg(frame) {
  const phase = (frame % LOOP_FRAMES) / LOOP_FRAMES
  // Breathe: one slow cycle per loop span.
  const breathe = Math.sin(phase * TAU)
  // Blink: quick two-frame close, twice per loop.
  const blinkPos = frame % 18
  const blinking = blinkPos === 9 || blinkPos === 10
  // Wave: the right flipper lifts for a third of the loop.
  const wavePos = frame % 18
  const wave = wavePos < 6 ? Math.sin((wavePos / 6) * Math.PI) : 0
  // Hop: a small lift with a water spout at 3/4 of the loop.
  const hopPos = frame % LOOP_FRAMES
  const hop = hopPos >= 27 && hopPos <= 32 ? Math.sin(((hopPos - 27) / 5) * Math.PI) : 0
  const blush = 0.3 + hop * 0.5

  const cx = 126
  const bodyCy = 182 - hop * 26 + breathe * 2.5
  const rx = 74 + breathe * 2.5
  const ry = 64 - breathe * 2.5
  const eyeY = bodyCy - 26 - hop * 3
  const eyeDx = 31
  const eyeRx = 12.5
  const eyeRy = 14
  const pupilY = eyeY + 2.5
  const muzzleCy = bodyCy + 12
  const mouthY = muzzleCy + 14

  const body = bodyPath(cx, bodyCy, rx, ry)
  const eyeX = (left) => (left ? cx - eyeDx : cx + eyeDx)
  // Parametric ellipse avoids SVG arc-flag ambiguity between renderers.
  const ellipsePts = (x, y, rxE, ryE, fromDeg, toDeg, steps = 28) => {
    const pts = []
    for (let i = 0; i <= steps; i++) {
      const t = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180
      pts.push([x + Math.cos(t) * rxE, y + Math.sin(t) * ryE])
    }
    return pts
  }
  const toPolygon = (pts) => pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')
  // Eye white: full ellipse. The lower half bulges a touch for the friendly read.
  const eyeWhitePoints = (left) => {
    const x = eyeX(left)
    const upper = ellipsePts(x, eyeY, eyeRx, eyeRy, 180, 360, 20)
    const lower = ellipsePts(x, eyeY, eyeRx, eyeRy * 1.12, 0, 180, 20)
    return toPolygon([...upper, ...lower])
  }
  const lidShapePath = (left) => {
    const x = eyeX(left)
    return `M ${r2(x - eyeRx - 1)} ${r2(eyeY - eyeRy - 2)} H ${r2(x + eyeRx + 1)} V ${r2(eyeY)} Q ${r2(
      x
    )} ${r2(eyeY + eyeRy * 0.7)} ${r2(x - eyeRx - 1)} ${r2(eyeY)} Z`
  }
  const mouthPath =
    hop > 0.2
      ? `M ${r2(cx - 12)} ${r2(mouthY - 2)} q 12 13 24 0 q -12 17 -24 0 Z`
      : `M ${r2(cx - 9)} ${r2(mouthY)} q 9 7 18 0`
  // Dorsal crest sits behind the body, leaning back like a whale's fin.
  const crest = `M ${r2(cx - 16)} ${r2(bodyCy - ry + 12)} Q ${r2(cx - 4)} ${r2(bodyCy - ry - 46 - hop * 2)} ${r2(
    cx + 4
  )} ${r2(bodyCy - ry - 38 - hop * 2)} Q ${r2(cx + 16)} ${r2(bodyCy - ry - 14)} ${r2(cx + 22)} ${r2(
    bodyCy - ry + 12
  )} Z`
  // Tail flukes fan out behind the body, bobbing with the breathing cycle.
  const tailDx = 6 + breathe * 5
  const tailDy = 4 + breathe * 6
  const tail = `M ${r2(cx + rx * 0.45)} ${r2(bodyCy + ry * 0.45)} Q ${r2(cx + rx + 22)} ${r2(
    bodyCy + ry * 0.2 + tailDy
  )} ${r2(cx + rx + 34 + tailDx)} ${r2(bodyCy - 6 - tailDy)} Q ${r2(cx + rx + 10)} ${r2(
    bodyCy + ry * 0.7
  )} ${r2(cx + rx + 24)} ${r2(bodyCy + ry * 0.95 + tailDy)} Q ${r2(cx + rx - 4)} ${r2(
    bodyCy + ry * 0.8
  )} ${r2(cx + rx * 0.5)} ${r2(bodyCy + ry * 0.55)} Z`

  const flipperLeft = `M ${r2(cx - rx + 16)} ${r2(bodyCy + 16)} q -24 ${r2(8 - breathe * 5)} -34 28 q 20 2 34 -10 Z`
  // Wave: the right flipper sweeps up and out so the gesture reads at 200px.
  const flipperRight = `M ${r2(cx + rx - 16)} ${r2(bodyCy + 16)} Q ${r2(cx + rx + 10 + wave * 24)} ${r2(
    bodyCy + 4 - wave * 26
  )} ${r2(cx + rx + 26 + wave * 18)} ${r2(bodyCy - 30 - wave * 44)} Q ${r2(
    cx + rx + 34 - wave * 10
  )} ${r2(bodyCy - 4 - wave * 18)} ${r2(cx + rx + 18 - wave * 8)} ${r2(bodyCy + 30 - wave * 6)} Z`
  const waterline = r2(274 + breathe * 3)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG.top}"/>
      <stop offset="1" stop-color="${BG.bottom}"/>
    </linearGradient>
    <linearGradient id="fin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FIN_LIGHT}"/>
      <stop offset="1" stop-color="${FIN}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FIN_LIGHT}"/>
      <stop offset="1" stop-color="${FIN}"/>
    </linearGradient>
    <clipPath id="badgeClip"><rect x="14" y="18" width="${WIDTH - 28}" height="${HEIGHT - 36}" rx="64"/></clipPath>
    <clipPath id="bodyClip"><path d="${body}"/></clipPath>
  </defs>

  <g clip-path="url(#badgeClip)">
    <rect x="14" y="18" width="${WIDTH - 28}" height="${HEIGHT - 36}" fill="url(#bg)"/>
    <!-- sun + bubbles: soft storybook backdrop without competing with the pet -->
    <circle cx="58" cy="74" r="16" fill="${FIN_LIGHT}" opacity="0.3"/>
    <circle cx="84" cy="96" r="6" fill="${FIN_LIGHT}" opacity="0.28"/>
    <circle cx="196" cy="64" r="7" fill="${FIN_LIGHT}" opacity="0.26"/>
    <circle cx="212" cy="88" r="4" fill="${FIN_LIGHT}" opacity="0.24"/>
    <path d="M 0 ${waterline} q 26 -12 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0 V 330 H 0 Z" fill="url(#water)"/>
    <path d="M 0 ${r2(Number(waterline) + 14)} q 26 -10 52 0 t 52 0 t 52 0 t 52 0 t 52 0 t 52 0 V 330 H 0 Z" fill="${OUTLINE}" opacity="0.14"/>
  </g>

  <g>
    <path d="${tail}" fill="url(#fin)" stroke="${OUTLINE}" stroke-width="6" stroke-linejoin="round"/>
    <path d="${crest}" fill="url(#fin)" stroke="${OUTLINE}" stroke-width="6" stroke-linejoin="round"/>
    <!-- left flipper tucks behind the body; the waving one draws in front -->
    <path d="${flipperLeft}" fill="url(#fin)" stroke="${OUTLINE}" stroke-width="6" stroke-linejoin="round"/>

    <!-- body -->
    <path d="${body}" fill="${BODY}" stroke="${OUTLINE}" stroke-width="7"/>
    <g clip-path="url(#bodyClip)">
      <ellipse cx="${cx}" cy="${r2(bodyCy - ry * 0.55)}" rx="${r2(rx * 0.7)}" ry="${r2(ry * 0.3)}" fill="${FIN_LIGHT}" opacity="0.16"/>
      <ellipse cx="${r2(cx - rx * 0.55)}" cy="${r2(bodyCy - ry * 0.35)}" rx="${r2(rx * 0.22)}" ry="${r2(
        ry * 0.1
      )}" fill="${EYE_WHITE}" opacity="0.9" transform="rotate(-32 ${r2(cx - rx * 0.55)} ${r2(bodyCy - ry * 0.35)})"/>
    </g>

    <path d="${flipperRight}" fill="url(#fin)" stroke="${OUTLINE}" stroke-width="6" stroke-linejoin="round"/>

    <!-- muzzle + nostrils -->
    <ellipse cx="${cx}" cy="${r2(muzzleCy)}" rx="34" ry="23" fill="${FIN_LIGHT}" opacity="0.16"/>
    <ellipse cx="${r2(cx - 11)}" cy="${r2(muzzleCy + 1)}" rx="3.2" ry="4.2" fill="${EYE}" opacity="0.8"/>
    <ellipse cx="${r2(cx + 11)}" cy="${r2(muzzleCy + 1)}" rx="3.2" ry="4.2" fill="${EYE}" opacity="0.8"/>

    <!-- eyes -->
    ${
      blinking
        ? `<path d="M ${r2(cx - eyeDx - 14)} ${r2(eyeY + 3)} q 14 9 28 0" fill="none" stroke="${EYE}" stroke-width="5" stroke-linecap="round"/>
           <path d="M ${r2(cx + eyeDx - 14)} ${r2(eyeY + 3)} q 14 9 28 0" fill="none" stroke="${EYE}" stroke-width="5" stroke-linecap="round"/>`
        : `<polygon points="${eyeWhitePoints(true)}" fill="${EYE_WHITE}" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
           <polygon points="${eyeWhitePoints(false)}" fill="${EYE_WHITE}" stroke="${OUTLINE}" stroke-width="3.5" stroke-linejoin="round"/>
           <ellipse cx="${r2(cx - eyeDx + 1)}" cy="${r2(pupilY)}" rx="8" ry="8.6" fill="${EYE}"/>
           <ellipse cx="${r2(cx + eyeDx + 1)}" cy="${r2(pupilY)}" rx="8" ry="8.6" fill="${EYE}"/>
           <circle cx="${r2(cx - eyeDx - 2)}" cy="${r2(pupilY - 3)}" r="3.2" fill="${EYE_WHITE}"/>
           <circle cx="${r2(cx + eyeDx - 2)}" cy="${r2(pupilY - 3)}" r="3.2" fill="${EYE_WHITE}"/>
           <path d="${lidShapePath(true)}" fill="${BODY}"/>
           <path d="${lidShapePath(false)}" fill="${BODY}"/>`
    }

    <!-- cheeks + mouth -->
    <ellipse cx="${r2(cx - 48)}" cy="${r2(muzzleCy + 2)}" rx="11" ry="6" fill="${CHEEK}" opacity="${r2(blush)}"/>
    <ellipse cx="${r2(cx + 48)}" cy="${r2(muzzleCy + 2)}" rx="11" ry="6" fill="${CHEEK}" opacity="${r2(blush)}"/>
    <path d="${mouthPath}" fill="${hop > 0.2 ? EYE : 'none'}" stroke="${EYE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- spout while hopping -->
    ${
      hop > 0.15
        ? `<circle cx="${r2(cx - 18)}" cy="${r2(bodyCy - ry - 52)}" r="5" fill="${FIN_LIGHT}" stroke="${OUTLINE}" stroke-width="2.5"/>
           <circle cx="${r2(cx + 16)}" cy="${r2(bodyCy - ry - 58)}" r="4" fill="${FIN_LIGHT}" stroke="${OUTLINE}" stroke-width="2.5"/>
           <circle cx="${r2(cx + 34)}" cy="${r2(bodyCy - ry - 44)}" r="3" fill="${FIN_LIGHT}" stroke="${OUTLINE}" stroke-width="2"/>`
        : ''
    }
  </g>

  <rect x="14" y="18" width="${WIDTH - 28}" height="${HEIGHT - 36}" rx="64" fill="none" stroke="${OUTLINE}" stroke-opacity="0.5" stroke-width="3"/>
</svg>`
}

function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'deepseek-pet-'))
  try {
    const svgArgs = []
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const file = join(workDir, `frame-${String(frame).padStart(3, '0')}.svg`)
      writeFileSync(file, frameSvg(frame))
      svgArgs.push('-delay', String(100 / FPS), '(', file, '-resize', `${WIDTH}x${HEIGHT}!`, ')')
    }
    mkdirSync(dirname(OUT_FILE), { recursive: true })
    execFileSync(
      'magick',
      [
        '-background',
        'none',
        ...svgArgs,
        '-alpha',
        'on',
        '-layers',
        'optimize',
        '-loop',
        '0',
        OUT_FILE
      ],
      { stdio: 'inherit' }
    )
    console.log(`Wrote ${OUT_FILE}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main()
