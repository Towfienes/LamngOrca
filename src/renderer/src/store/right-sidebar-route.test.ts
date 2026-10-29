import { describe, expect, it } from 'vitest'
import { normalizeRightSidebarRoute } from './right-sidebar-route'

describe('normalizeRightSidebarRoute', () => {
  it('preserves the Usage route on restart', () => {
    expect(normalizeRightSidebarRoute('usage')).toEqual({
      rightSidebarTab: 'usage',
      rightSidebarExplorerView: 'files'
    })
  })
  it('preserves well-formed plugin panel tabs', () => {
    expect(normalizeRightSidebarRoute('plugin:orca-samples.my-plugin/dashboard')).toEqual({
      rightSidebarTab: 'plugin:orca-samples.my-plugin/dashboard',
      rightSidebarExplorerView: 'files'
    })
  })

  it('drops a well-formed tab once the installed plugin list proves it is stale', () => {
    expect(
      normalizeRightSidebarRoute('plugin:orca-samples.removed/dashboard', undefined, {
        installedPluginTabKeys: new Set(['plugin:orca-samples.present/dashboard'])
      })
    ).toEqual({
      rightSidebarTab: 'explorer',
      rightSidebarExplorerView: 'files'
    })
  })
})
