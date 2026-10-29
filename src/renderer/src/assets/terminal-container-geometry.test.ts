import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const terminalCss = fs.readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')

describe('terminal container geometry', () => {
  it('keeps the hidden link tooltip out of the fitted terminal height', () => {
    expect(terminalCss).toMatch(
      /\.xterm-container\s*{[^}]*height:\s*calc\(100% - var\(--pane-padding-y, 4px\) - var\(--orca-pane-footer-height, 0px\)\);/s
    )
    expect(terminalCss).toMatch(
      /\.pane\[data-has-title\] \.xterm-container\s*{[^}]*height:\s*calc\(\s*100% - var\(--orca-pane-title-height\) - var\(--orca-pane-footer-height, 0px\)\s*\);/s
    )
    expect(terminalCss).toMatch(
      /\.pane-link-tooltip\s*{[^}]*height:\s*var\(--orca-terminal-link-tooltip-height\);/s
    )
  })

  it('bounds cursor-blink repaints to the terminal surface (#10481)', () => {
    expect(terminalCss).toMatch(/\.xterm-container\s*{[^}]*contain:\s*paint;/s)
  })
})
