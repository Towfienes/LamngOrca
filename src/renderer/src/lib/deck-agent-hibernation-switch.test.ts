import { describe, expect, it } from 'vitest'
import { isAgentHibernationCoordinatorEnabled } from './deck-agent-hibernation-switch'

describe('isAgentHibernationCoordinatorEnabled', () => {
  it('stays off even when the stored setting is on', () => {
    expect(isAgentHibernationCoordinatorEnabled(true)).toBe(false)
  })

  it('stays off when the stored setting is off or missing', () => {
    expect(isAgentHibernationCoordinatorEnabled(false)).toBe(false)
    expect(isAgentHibernationCoordinatorEnabled(undefined)).toBe(false)
  })
})
