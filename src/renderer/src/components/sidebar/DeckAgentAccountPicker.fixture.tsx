import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import { DeckAgentAccountPicker } from './DeckAgentAccountPicker'
import type { Claude9ModelList } from '../../../../shared/claude9-models'
import type { DeeprelayModelList } from '../../../../shared/deeprelay-models'

const claude9: Claude9ModelList = {
  available: true,
  defaultId: 'dr',
  fetchedAt: Date.now(),
  models: [
    {
      alias: 'dr',
      id: 'dr',
      label: 'dr',
      ctx: 1_000_000,
      out: 128_000,
      vision: false,
      combo: false,
      reasoning: 'Effort-scaled'
    }
  ]
}

const deeprelay: DeeprelayModelList = {
  available: true,
  defaultId: 'deeprelay/deepseek-v4.1-flash',
  base: 'https://api.deeprelay.ai',
  fetchedAt: Date.now(),
  models: [
    {
      id: 'deeprelay/deepseek-v4.1-flash',
      label: 'deepseek-v4.1-flash',
      ctx: 1_048_576,
      out: 393_216,
      vision: true
    },
    { id: 'deeprelay/glm-5.3', label: 'glm-5.3', ctx: 1_048_576, out: 131_072, vision: false },
    {
      id: 'deeprelay/kimi-k3.1-pro',
      label: 'kimi-k3.1-pro',
      ctx: 1_048_576,
      out: 131_072,
      vision: true
    },
    {
      id: 'deeprelay/glm-5.3-flash',
      label: 'glm-5.3-flash',
      ctx: 1_048_576,
      out: 131_072,
      vision: false
    }
  ]
}

export const routers = defineFixture({
  width: 600,
  store: {
    settings: {
      ...getDefaultSettings('/tmp/fixture-home'),
      claudeManagedAccounts: [
        {
          id: 'account',
          email: 'ngolamtien1706@gmail.com',
          managedAuthPath: '/tmp/fixture-home/claude-account',
          authMethod: 'subscription-oauth',
          organizationName: "ngolamtien1706@gmail.com's Organization",
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ]
    }
  },
  setup() {
    useAppStore.setState({ fetchInactiveClaudeAccountUsage: async () => {} })
    window.api.claude9 = { list: async () => claude9, sessions: async () => [] }
    window.api.deeprelay = { list: async () => deeprelay, sessions: async () => [] }
  },
  render: () => (
    <DeckAgentAccountPicker
      agent="claude"
      local
      onLaunch={() => {}}
      onLaunchClaude9={() => {}}
      onLaunchDeeprelay={() => {}}
      onClose={() => {}}
    />
  ),
  interact: async (frame) => {
    await new Promise((resolve) => setTimeout(resolve, 150))
    frame
      .querySelector<HTMLButtonElement>('[aria-label="DeepRelay (claude-dl)"]')
      ?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
  }
})
