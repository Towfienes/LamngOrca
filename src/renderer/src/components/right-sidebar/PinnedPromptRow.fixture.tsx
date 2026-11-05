import { defineFixture } from '../../component-fixtures/component-fixture'
import { PinnedPromptRow } from './PinnedPromptRow'

export const compact = defineFixture({
  width: 280,
  render: () => (
    <section aria-label="Global prompts" className="bg-sidebar p-2 text-sidebar-foreground">
      <div className="flex h-6 items-center px-1 text-xs">Global prompts</div>
      {['Research notes', 'Presentation outline with a long descriptive filename'].map(
        (name, index) => (
          <PinnedPromptRow
            key={name}
            pin={{
              filePath: `/notes/${name}.md`,
              relativePath: `notes/${name}.md`,
              worktreeId: 'fixture',
              owner: { kind: 'local' }
            }}
            busy={false}
            disabled={false}
            onOpen={() => {}}
            onCopy={() => {}}
            onRemove={() => {}}
            onMove={() => {}}
            onDrop={() => {}}
            canMoveUp={index > 0}
            canMoveDown={index === 0}
          />
        )
      )}
    </section>
  )
})
