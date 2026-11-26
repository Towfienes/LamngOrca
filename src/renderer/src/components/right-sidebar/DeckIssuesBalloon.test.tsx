// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  kind: 'issue',
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
  expect(screen.getByLabelText('Đang tải').getAttribute('aria-busy')).toBe('true')
})

it('reports a failure with a retry button', () => {
  const { onRefresh } = mount({ error: 'gh: not logged in' })
  expect(screen.getByRole('status').textContent).toContain('gh: not logged in')
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
  expect(onRefresh).toHaveBeenCalled()
})

it('groups items under their repo and opens an item on click', () => {
  const openUrl = vi.fn(() => Promise.resolve())
  vi.stubGlobal('api', { shell: { openUrl } })
  const review: DeckAssignedIssue = {
    ...issue,
    key: 'r2#3',
    repoId: 'r2',
    kind: 'review',
    repoFullName: 'Towfienes/Momo-Techday',
    number: 3,
    url: 'https://github.com/Towfienes/Momo-Techday/pull/3'
  }
  mount({ issues: [issue, review] })
  const momo = screen.getByRole('region', { name: 'Towfienes/Momo-Techday' })
  const row = within(momo).getByRole('button', { name: /#3/ })
  expect(within(momo).queryByRole('button', { name: /#56/ })).toBeNull()
  fireEvent.click(row)
  expect(openUrl).toHaveBeenCalledWith(review.url)
})

it('closes from its close button', () => {
  const { onClose } = mount({ issues: [issue] })
  fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
  expect(onClose).toHaveBeenCalled()
})
