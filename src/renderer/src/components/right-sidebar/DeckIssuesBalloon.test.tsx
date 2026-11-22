// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DeckIssuesBalloon } from './DeckIssuesBalloon'
import type { DeckAssignedIssue } from './deck-assigned-issues-model'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const issue: DeckAssignedIssue = {
  key: 'r1#56',
  repoId: 'r1',
  repoFullName: 'bminhnemhoi/docset-check',
  number: 56,
  title: 'Kế hoạch 13–18/11: chuốt giao diện',
  url: 'https://github.com/bminhnemhoi/docset-check/issues/56',
  updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  priority: 0
}

function mount(props: Partial<Parameters<typeof DeckIssuesBalloon>[0]> = {}) {
  const handlers = { onRefresh: vi.fn(), onClose: vi.fn() }
  render(
    <DeckIssuesBalloon
      issues={[]}
      loading={false}
      refreshing={false}
      error={null}
      updatedAt={Date.now()}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

it('shows a skeleton while the first poll is loading', () => {
  mount({ loading: true, updatedAt: null })
  expect(screen.getByLabelText('Đang tải issue').getAttribute('aria-busy')).toBe('true')
})

it('says so when nothing is assigned', () => {
  mount()
  expect(screen.getByRole('status').textContent).toContain('Không có issue nào')
})

it('reports a failure with a retry button', () => {
  const { onRefresh } = mount({ error: 'gh: not logged in' })
  expect(screen.getByRole('status').textContent).toContain('gh: not logged in')
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(onRefresh).toHaveBeenCalled()
})

it('lists the repo, number, priority and age, and opens the issue on click', () => {
  const openUrl = vi.fn(() => Promise.resolve())
  vi.stubGlobal('api', { shell: { openUrl } })
  mount({ issues: [issue] })
  const row = screen.getByRole('button', { name: /#56/ })
  expect(row.textContent).toContain('P0')
  expect(row.textContent).toContain('docset-check · 3 giờ trước')
  fireEvent.click(row)
  expect(openUrl).toHaveBeenCalledWith(issue.url)
})

it('closes from its close button', () => {
  const { onClose } = mount({ issues: [issue] })
  fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
  expect(onClose).toHaveBeenCalled()
})
