import { afterEach, describe, expect, it } from 'vitest'
import { i18n, translate } from './i18n'

const KEY = 'test.translateCache.label'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('translate cache', () => {
  it('serves repeat static lookups and never returns a stale catalog value', () => {
    expect(translate(KEY, 'Fallback')).toBe('Fallback')
    expect(translate(KEY, 'Fallback')).toBe('Fallback')
    i18n.addResource('en', 'translation', KEY, 'Loaded')
    expect(translate(KEY, 'Fallback')).toBe('Loaded')
    i18n.addResource('en', 'translation', KEY, 'Swapped')
    expect(translate(KEY, 'Fallback')).toBe('Swapped')
  })

  it('does not cache interpolated calls', () => {
    const key = 'test.translateCache.greeting'
    expect(translate(key, 'Hi {{name}}', { name: 'A' })).toBe('Hi A')
    expect(translate(key, 'Hi {{name}}', { name: 'B' })).toBe('Hi B')
  })
})
