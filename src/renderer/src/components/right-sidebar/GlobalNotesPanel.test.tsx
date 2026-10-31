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

beforeEach(() => vi.stubGlobal('localStorage', new Storage()))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

it('edits and ticks a manga checklist using the existing notes without discarding plain lines', () => {
  localStorage.setItem('orca.global-notes.v1', 'Thuyết trình notebook\n- [x] Kiểm tra biểu đồ')
  render(
    <TooltipProvider>
      <GlobalNotesPanel variant="bubble" />
    </TooltipProvider>
  )
  expect(screen.getByRole('textbox', { name: 'Task 1' })).toHaveProperty(
    'value',
    'Thuyết trình notebook'
  )
  expect(screen.getByRole('checkbox', { name: 'Complete task 2' }).getAttribute('data-state')).toBe(
    'checked'
  )
  fireEvent.click(screen.getByRole('checkbox', { name: 'Complete task 1' }))
  expect(localStorage.getItem('orca.global-notes.v1')).toBe(
    '- [x] Thuyết trình notebook\n- [x] Kiểm tra biểu đồ'
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Task 1' }), {
    target: { value: 'Sửa slide tiếng Việt' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Task 3' }), {
    target: { value: 'Chạy thử ipynb' }
  })
  expect(localStorage.getItem('orca.global-notes.v1')).toBe(
    '- [x] Sửa slide tiếng Việt\n- [x] Kiểm tra biểu đồ\n- [ ] Chạy thử ipynb'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Remove task 2' }))
  expect(localStorage.getItem('orca.global-notes.v1')).toBe(
    '- [x] Sửa slide tiếng Việt\n- [ ] Chạy thử ipynb'
  )
})

it('shares changes between the regular notes and the manga checklist', () => {
  mount()
  render(
    <TooltipProvider>
      <GlobalNotesPanel variant="bubble" />
    </TooltipProvider>
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Global notes' }), {
    target: { value: 'Chuẩn bị demo' }
  })
  expect(screen.getByRole('textbox', { name: 'Task 1' })).toHaveProperty('value', 'Chuẩn bị demo')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Complete task 1' }))
  expect(screen.getByRole('textbox', { name: 'Global notes' })).toHaveProperty(
    'value',
    '- [x] Chuẩn bị demo'
  )
})

it('protects an unreadable note in bubble mode and reports failed writes', () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('Blocked')
  })
  const save = vi.spyOn(localStorage, 'setItem')
  const view = render(
    <TooltipProvider>
      <GlobalNotesPanel variant="bubble" />
    </TooltipProvider>
  )
  expect(screen.getByRole('button', { name: 'Add task' })).toHaveProperty('disabled', true)
  expect(save).not.toHaveBeenCalled()
  view.unmount()
  vi.restoreAllMocks()
  vi.stubGlobal('localStorage', new Storage())
  localStorage.setItem('orca.global-notes.v1', '- [ ] Keep this')
  render(
    <TooltipProvider>
      <GlobalNotesPanel variant="bubble" />
    </TooltipProvider>
  )
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Full')
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Task 1' }), {
    target: { value: 'Do not lose this' }
  })
  expect(screen.getByRole('textbox', { name: 'Task 1' })).toHaveProperty(
    'value',
    'Do not lose this'
  )
  expect(screen.getByText(/Could not save notes/)).toBeTruthy()
})

it('adds the next task on Enter and preserves IME composition', () => {
  localStorage.setItem('orca.global-notes.v1', '- [ ] Chuẩn bị')
  render(
    <TooltipProvider>
      <GlobalNotesPanel variant="bubble" />
    </TooltipProvider>
  )
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Task 1' }), {
    key: 'Enter',
    isComposing: true
  })
  expect(screen.queryByRole('textbox', { name: 'Task 2' })).toBeNull()
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Task 1' }), { key: 'Enter' })
  expect(screen.getByRole('textbox', { name: 'Task 2' })).toBeTruthy()
  expect(localStorage.getItem('orca.global-notes.v1')).toBe('- [ ] Chuẩn bị\n- [ ] ')
})
