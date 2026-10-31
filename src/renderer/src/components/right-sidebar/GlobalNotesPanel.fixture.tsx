import { defineFixture } from '../../component-fixtures/component-fixture'
import { GlobalNotesPanel } from './GlobalNotesPanel'
import '@/assets/manga-notes.css'

export const manga = defineFixture({
  width: 360,
  setup() {
    localStorage.setItem(
      'orca.global-notes.v1',
      '- [ ] Thuyết trình notebook\n- [x] Kiểm tra biểu đồ\n- [ ] Chuẩn bị phần demo'
    )
  },
  render: () => (
    <div className="p-4">
      <div data-manga-notes data-slot="popover-content">
        <GlobalNotesPanel variant="bubble" onClose={() => {}} />
      </div>
    </div>
  )
})
