// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GlobalNotesPanel } from './GlobalNotesPanel'

function mount() {
  return render(
    <TooltipProvider>
      <GlobalNotesPanel />
    </TooltipProvider>
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('saves the exact draft immediately and restores it on remount', () => {
  const text = 'Đang làm:\n- Sửa API\n- Xem lại UI'
  const view = mount()
  fireEvent.change(screen.getByRole('textbox', { name: 'Global notes' }), {
    target: { value: text }
  })
  expect(localStorage.getItem('orca.global-notes.v1')).toBe(text)
  view.unmount()
  mount()
  expect(screen.getByRole('textbox')).toHaveProperty('value', text)
})

it('zooms only the note editor, clamps size, resets, and collapses without losing text', () => {
  mount()
  const editor = screen.getByRole('textbox')
  const original = editor.style.fontSize
  for (let n = 0; n < 8; n++) {
    fireEvent.click(screen.getByRole('button', { name: 'Zoom notes in' }))
  }
  expect(screen.getByRole('button', { name: 'Zoom notes in' })).toHaveProperty('disabled', true)
  expect(editor.style.fontSize).not.toBe(original)
  fireEvent.click(screen.getByRole('button', { name: 'Reset note zoom' }))
  expect(editor.style.fontSize).toBe(original)
  fireEvent.change(editor, { target: { value: 'Remember' } })
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Remember')
})

it('keeps unsaved text editable and reports storage failures', () => {
  mount()
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Full')
  })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this' } })
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Keep this')
  expect(screen.getByRole('status').textContent).toBe('Not saved')
  expect(screen.getByText(/Copy your text/)).toBeTruthy()
})

it('does not overwrite an unreadable saved note', () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('Blocked')
  })
  const save = vi.spyOn(localStorage, 'setItem')
  mount()
  expect(screen.getByRole('textbox')).toHaveProperty('readOnly', true)
  expect(screen.getByText(/Could not load/)).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
})
