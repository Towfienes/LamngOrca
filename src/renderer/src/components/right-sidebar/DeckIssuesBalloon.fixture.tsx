import { defineFixture } from '../../component-fixtures/component-fixture'
import { DeckIssuesBalloon } from './DeckIssuesBalloon'
import type { DeckAssignedIssue } from './deck-assigned-issues-model'
import '@/assets/manga-notes.css'

const POLLED_AT = Date.parse('2026-11-15T07:20:00Z')
const hoursAgo = (hours: number): string => new Date(POLLED_AT - hours * 3_600_000).toISOString()
const repo = 'bminhnemhoi/docset-check'
const issue = (number: number, title: string, priority: number | null, age: number) =>
  ({
    key: `r#${number}`,
    repoId: 'r',
    kind: 'issue',
    repoFullName: repo,
    number,
    title,
    url: `https://github.com/${repo}/issues/${number}`,
    updatedAt: hoursAgo(age),
    priority
  }) satisfies DeckAssignedIssue
const review = (number: number, title: string, age: number) =>
  ({
    key: `m#${number}`,
    repoId: 'm',
    kind: 'review',
    repoFullName: 'Towfienes/Momo-Techday',
    number,
    title,
    url: `https://github.com/Towfienes/Momo-Techday/pull/${number}`,
    updatedAt: hoursAgo(age),
    priority: null
  }) satisfies DeckAssignedIssue

const ISSUES = [
  issue(56, '[Việc của Tiến] Kế hoạch 13–18/11: chuốt giao diện và luồng demo', 0, 3),
  issue(105, '[Ops] Tiến deploy DocSet Check lên VPS (HTTPS, tài khoản demo)', 0, 26),
  issue(114, '[Video] Thêm lồng tiếng và nhạc cho video demo', 1, 0.1),
  review(3, 'Đưa nghiên cứu, dữ liệu cuộc thi và công cụ AI dùng chung lên repo', 2),
  review(2, 'Review hai ý tưởng MandateGuard và ScriptShield', 5)
]

const noop = (): void => {}

function Bubble({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="p-4">
      <div data-manga-notes data-slot="popover-content">
        {children}
      </div>
    </div>
  )
}

export const list = defineFixture({
  width: 360,
  render: () => (
    <Bubble>
      <DeckIssuesBalloon
        issues={ISSUES}
        loading={false}
        refreshing={false}
        error={null}
        updatedAt={POLLED_AT}
        onRefresh={noop}
        onClose={noop}
      />
    </Bubble>
  )
})

export const empty = defineFixture({
  width: 360,
  render: () => (
    <Bubble>
      <DeckIssuesBalloon
        issues={[]}
        loading={false}
        refreshing={false}
        error={null}
        updatedAt={POLLED_AT}
        onRefresh={noop}
        onClose={noop}
      />
    </Bubble>
  )
})
