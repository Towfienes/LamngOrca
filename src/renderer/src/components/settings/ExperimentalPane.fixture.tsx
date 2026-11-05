import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import { ExperimentalPane } from './advanced/ExperimentalPane'

const settings = {
  ...getDefaultSettings('/home/test'),
  experimentalOrchestrationPanel: true
}

export const suspendedOrchestrationPanel = defineFixture({
  width: 760,
  store: { settings },
  render: () => <ExperimentalPane settings={settings} updateSettings={() => {}} />
})
